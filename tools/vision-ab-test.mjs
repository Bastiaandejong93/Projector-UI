#!/usr/bin/env node
// Luna vision A/B runner.
//
// Sends locally stored A/B frames to a local Ollama vision model, validates
// the answer against a strict schema and writes one JSON record per pair.
// A dry-run validates the pack without any model call. External image APIs
// (Astra) are refused by name. Helper functions are exported so unit tests
// can exercise selection, parsing, normalization and validation directly.

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const scoreKeys = ['cloud_sagging', 'motion_stutter', 'shape_warp', 'detail_loss', 'seams_or_pop_in', 'background_camera_motion', 'naturalness'];
export const schema = {
  type: 'object', additionalProperties: false,
  required: ['pair_id', 'winner', 'confidence', 'scores', 'locations', 'observations', 'likely_cause', 'next_test'],
  properties: {
    pair_id: { type: 'string' }, winner: { enum: ['A', 'B', 'tie'] }, confidence: { type: 'number', minimum: 0, maximum: 1 },
    scores: { type: 'object', additionalProperties: false, required: scoreKeys, properties: Object.fromEntries(scoreKeys.map(key => [key, { type: 'integer', minimum: 0, maximum: 3 }])) },
    locations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['variant', 'frame', 'region', 'severity'], properties: { variant: { enum: ['A', 'B'] }, frame: { type: 'string' }, region: { type: 'string' }, severity: { type: 'integer', minimum: 0, maximum: 3 } } } },
    observations: { type: 'array', items: { type: 'string' } }, likely_cause: { type: 'string' }, next_test: { type: 'string' }
  }
};

const usage = `Usage: node tools/vision-ab-test.mjs [--dry-run] [--round=<round_id>] [--pair=<pair_id>] [--model=<ollama-model>] [--num-ctx=<tokens>] [--retries=<n>]

Environment: VISION_MODEL, VISION_NUM_CTX (default 32768), VISION_RETRIES (default 2).
The default model is qwen2.5vl:7b, the local Ollama registry name. Ollama's
default 4096-token context truncates this prompt plus its images, so num_ctx is
sent with every request. Invalid JSON or schema violations are retried with
corrective feedback; HTTP and network errors fail immediately.`;

// Rejection of a model answer (invalid JSON or schema mismatch): retryable.
export class AnswerRejectedError extends Error {}

export function parseArgs(argv) {
  return new Map(argv.map(value => {
    const [key, ...rest] = value.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }));
}

function integerOption(args, flag, environment, fallback, minimum) {
  const raw = args.has(flag) ? args.get(flag) : (environment !== undefined && environment !== '' ? environment : fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`--${flag} expects an integer >= ${minimum}, got: ${JSON.stringify(raw)}`);
  return value;
}

// Number of frames a round's condition claims per variant, e.g. "6 frames at
// 1 second intervals" or "include frame-time log and 10 sampled frames".
export function statedFrameCount(condition) {
  if (typeof condition !== 'string') return null;
  const match = condition.match(/(\d+)\s+(?:sampled\s+)?frames/i);
  return match ? Number(match[1]) : null;
}

const imageExtensions = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
const extension = path => path.slice(path.lastIndexOf('.')).toLowerCase();
const relativeTo = (dir, path) => path.replace(`${dir}/`, '');

export function framePath(entry, sequencePath, packDir) {
  const value = typeof entry === 'string' ? entry : entry?.image || entry?.path || entry?.frame;
  if (typeof value !== 'string') throw new Error(`${relativeTo(packDir, sequencePath)}: each frame must be a filename or image/path/frame object`);
  if (!imageExtensions.has(extension(value))) throw new Error(`${relativeTo(packDir, sequencePath)}: unsupported image type: ${value}`);
  return resolve(dirname(sequencePath), value);
}

export async function loadFrames(pair, variant, packDir) {
  const exists = async path => access(path).then(() => true, () => false);
  const key = variant.toLowerCase();
  const still = resolve(packDir, pair[key]);
  const sequenceRef = pair[`sequence_${key}`];
  if (!sequenceRef) return [{ path: still, label: basename(still) }];
  const sequencePath = resolve(packDir, sequenceRef);
  if (!await exists(sequencePath)) return [{ path: still, label: basename(still), missingSequence: relativeTo(packDir, sequencePath) }];
  const parsed = JSON.parse(await readFile(sequencePath, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : parsed.frames;
  if (!Array.isArray(entries) || !entries.length) throw new Error(`${relativeTo(packDir, sequencePath)}: expected a non-empty frames array`);
  return entries.map((entry, index) => ({ path: framePath(entry, sequencePath, packDir), label: `${basename(sequencePath)}#${String(index).padStart(2, '0')}` }));
}

export function buildPrompt(round, pair, framesA, framesB) {
  const labels = frames => frames.map(frame => frame.label).join(', ');
  return `You are reviewing one visual A/B test for a projector sky renderer using a local vision model. Compare A and B only within this pair and only under the stated condition. The images arrive in this exact order: A frames (${labels(framesA)}), then B frames (${labels(framesB)}). Use frame labels in locations. The stated condition describes the intended capture, not verified metadata. Do not assume images form a time sequence or infer motion stutter, camera motion, or smoothness without verified timing and matching scene evidence; identify insufficient evidence in observations and next_test. A contact sheet alone does not establish timing. Do not infer FPS, GPU load, code causes, or projector performance from images. Score 0 none, 1 slight, 2 clear, 3 distracting; use 0 for unassessable scores and explain the limitation in observations. likely_cause must be an image-supported hypothesis or an empty string. Return JSON only, matching this schema exactly. Round: ${round.round_id}. Question: ${round.question}. Condition: ${round.condition}. Pair: ${pair.pair_id}. Schema: ${JSON.stringify(schema)}`;
}

// Coerces documented local-model mistakes (numbers as strings, confidence on a
// 0-3/0-10/0-100 scale instead of 0-1) and reports every single change, so no
// model output is ever altered silently.
export function normalizeAnswer(answer) {
  const changes = [];
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return { answer, changes };
  const toNumber = (path, value) => {
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      const parsed = Number(value);
      changes.push(`${path}: ${JSON.stringify(value)} -> ${JSON.stringify(parsed)}`);
      return parsed;
    }
    return value;
  };
  const normalized = { ...answer };
  let confidence = toNumber('confidence', normalized.confidence);
  if (typeof confidence === 'number' && confidence > 1) {
    const scale = confidence <= 3 ? 3 : confidence <= 10 ? 10 : confidence <= 100 ? 100 : null;
    if (scale) {
      const scaled = Math.round((confidence / scale) * 1000) / 1000;
      changes.push(`confidence: ${JSON.stringify(confidence)} -> ${JSON.stringify(scaled)} (rescaled from 0-${scale})`);
      confidence = scaled;
    }
  }
  normalized.confidence = confidence;
  if (normalized.scores && typeof normalized.scores === 'object' && !Array.isArray(normalized.scores)) {
    normalized.scores = Object.fromEntries(Object.entries(normalized.scores).map(([key, value]) => [key, toNumber(`scores.${key}`, value)]));
  }
  if (Array.isArray(normalized.locations)) {
    normalized.locations = normalized.locations.map((location, index) => location && typeof location === 'object' && !Array.isArray(location)
      ? { ...location, severity: toNumber(`locations[${index}].severity`, location.severity) }
      : location);
  }
  return { answer: normalized, changes };
}

// frameLabelsByVariant (optional): { A: Set<labels>, B: Set<labels> }. When a
// variant's label set is present, every location must reference one of the
// frame labels that were actually sent for that variant.
export function validateResult(result, expectedPair, frameLabelsByVariant) {
  const allowed = new Set(Object.keys(schema.properties));
  if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some(key => !allowed.has(key))) throw new Error(`${expectedPair}: unexpected result properties`);
  if (result.pair_id !== expectedPair || !['A', 'B', 'tie'].includes(result.winner)) throw new Error(`${expectedPair}: invalid pair_id or winner`);
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) throw new Error(`${expectedPair}: invalid confidence`);
  if (!result.scores || Object.keys(result.scores).length !== scoreKeys.length || scoreKeys.some(key => !Number.isInteger(result.scores[key]) || result.scores[key] < 0 || result.scores[key] > 3)) throw new Error(`${expectedPair}: invalid scores`);
  if (!Array.isArray(result.locations) || result.locations.some(location => !location || typeof location !== 'object' || Array.isArray(location) || !['A', 'B'].includes(location.variant) || typeof location.frame !== 'string' || typeof location.region !== 'string' || !Number.isInteger(location.severity) || location.severity < 0 || location.severity > 3)) throw new Error(`${expectedPair}: invalid locations`);
  if (frameLabelsByVariant && result.locations.some(location => {
    const labels = frameLabelsByVariant[location.variant];
    return labels instanceof Set && !labels.has(location.frame);
  })) {
    const list = variant => [...(frameLabelsByVariant[variant] ?? [])].join(', ') || 'none';
    throw new Error(`${expectedPair}: locations must use presented frame labels (A: ${list('A')}; B: ${list('B')})`);
  }
  if (!Array.isArray(result.observations) || result.observations.some(note => typeof note !== 'string') || typeof result.likely_cause !== 'string' || typeof result.next_test !== 'string') throw new Error(`${expectedPair}: invalid observations or follow-up fields`);
  return result;
}

export function retryPrompt(basePrompt, rejection, frameLabelsByVariant) {
  const message = rejection instanceof Error ? rejection.message : String(rejection);
  const list = variant => frameLabelsByVariant?.[variant] instanceof Set ? [...frameLabelsByVariant[variant]].join(', ') : '';
  const labels = list('A') || list('B') ? ` Valid location frame labels — A: ${list('A')}; B: ${list('B')}.` : '';
  return `${basePrompt}\nYour previous reply was rejected: ${message}.${labels} Return corrected JSON only, matching the schema exactly.`;
}

export function frameCountWarnings(round, framesA, framesB) {
  const expected = statedFrameCount(round?.condition);
  if (!expected) return [];
  const warnings = [];
  for (const [variant, frames] of [['A', framesA], ['B', framesB]]) {
    if (frames.length !== expected) warnings.push(`${round.round_id} variant ${variant}: condition states ${expected} frames, sequence provides ${frames.length}`);
  }
  return warnings;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has('help')) {
    console.log(usage);
    return;
  }

  const dryRun = args.has('dry-run');
  const model = args.get('model') || process.env.VISION_MODEL || 'qwen2.5vl:7b';
  if (typeof model !== 'string' || /astra/i.test(model)) throw new Error('Only local Ollama vision models are supported; Astra is not allowed.');
  const numCtx = integerOption(args, 'num-ctx', process.env.VISION_NUM_CTX, 32768, 1);
  const retries = integerOption(args, 'retries', process.env.VISION_RETRIES, 2, 0);

  const root = fileURLToPath(new URL('..', import.meta.url));
  const packDir = resolve(root, 'outputs/vision-ab-test');
  const manifestPath = resolve(packDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const roundId = args.get('round');
  const pairId = args.get('pair');
  const rounds = roundId ? manifest.rounds.filter(round => round.round_id === roundId) : manifest.rounds;
  if (!rounds.length) throw new Error(`Unknown round: ${roundId}`);
  const pairs = rounds.flatMap(round => round.pairs.map(pair => ({ round, pair })));
  const selected = pairId ? pairs.filter(({ pair }) => pair.pair_id === pairId) : pairs;
  if (!selected.length) throw new Error(`Unknown pair: ${pairId}`);

  const exists = async path => access(path).then(() => true, () => false);
  const resultsDir = resolve(packDir, 'results', dryRun ? 'dry-run' : 'ollama');
  await mkdir(resultsDir, { recursive: true });

  for (const { round, pair } of selected) {
    const framesA = await loadFrames(pair, 'A', packDir);
    const framesB = await loadFrames(pair, 'B', packDir);
    const frames = [...framesA.map(frame => ({ ...frame, variant: 'A' })), ...framesB.map(frame => ({ ...frame, variant: 'B' }))];
    const evidence = await Promise.all(frames.map(async frame => ({ variant: frame.variant, frame: frame.label, image: relativeTo(packDir, frame.path), exists: await exists(frame.path), ...(frame.missingSequence ? { missing_sequence: frame.missingSequence } : {}) })));
    const warnings = frameCountWarnings(round, framesA, framesB);
    const record = { pair_id: pair.pair_id, round_id: round.round_id, model, mode: dryRun ? 'dry-run' : 'ollama', ...(!dryRun ? { num_ctx: numCtx, retries } : {}), evidence, ...(warnings.length ? { warnings } : {}), prompt: buildPrompt(round, pair, framesA, framesB) };
    const output = resolve(resultsDir, `${pair.pair_id}.json`);
    if (!dryRun) {
      const missing = evidence.filter(frame => !frame.exists);
      if (missing.length) {
        record.error = `${pair.pair_id}: missing required visual evidence: ${missing.map(frame => frame.image).join(', ')}`;
        await writeFile(output, `${JSON.stringify(record, null, 2)}\n`);
        throw new Error(record.error);
      }
      const frameLabels = { A: new Set(framesA.map(frame => frame.label)), B: new Set(framesB.map(frame => frame.label)) };
      const images = await Promise.all(frames.map(frame => readFile(frame.path, 'base64')));
      record.attempts = [];
      let accepted = false;
      for (let attempt = 1; attempt <= 1 + retries && !accepted; attempt++) {
        try {
          const prompt = attempt === 1 ? record.prompt : retryPrompt(record.prompt, record.attempts.at(-1).error, frameLabels);
          record.prompt = prompt;
          const body = { model, stream: false, format: schema, options: { num_ctx: numCtx }, prompt, images };
          const response = await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
          if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
          const payload = await response.json();
          record.raw_response = payload.response;
          let answer;
          try { answer = JSON.parse(payload.response); } catch { throw new AnswerRejectedError(`${pair.pair_id}: Ollama did not return valid JSON`); }
          const { answer: normalized, changes } = normalizeAnswer(answer);
          if (changes.length) record.normalizations = changes; else delete record.normalizations;
          try { record.result = validateResult(normalized, pair.pair_id, frameLabels); }
          catch (error) { throw new AnswerRejectedError(error instanceof Error ? error.message : String(error)); }
          record.schema = schema;
          accepted = true;
        } catch (error) {
          const retryable = error instanceof AnswerRejectedError;
          record.attempts.push({ attempt, error: error instanceof Error ? error.message : String(error), retryable, ...(record.raw_response ? { raw_response: record.raw_response } : {}) });
          if (!retryable) break;
        }
      }
      if (!accepted) {
        record.error = `${pair.pair_id}: no valid answer after ${record.attempts.length} attempt(s); last error: ${record.attempts.at(-1)?.error ?? 'unknown'}`;
        await writeFile(output, `${JSON.stringify(record, null, 2)}\n`);
        throw new Error(record.error);
      }
    }
    await writeFile(output, `${JSON.stringify(record, null, 2)}\n`);
    console.log(JSON.stringify({ pair_id: pair.pair_id, output: relativeTo(packDir, output), mode: record.mode, ...(warnings.length ? { warnings } : {}), evidence, image_count: evidence.length }));
  }
}

let invokedDirectly = false;
if (typeof process.argv[1] === 'string') {
  try { invokedDirectly = import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href; } catch { invokedDirectly = false; }
}
if (invokedDirectly) await main();
