import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AnswerRejectedError, buildPrompt, frameCountWarnings, framePath, loadFrames,
  normalizeAnswer, parseArgs, retryPrompt, statedFrameCount, validateResult
} from '../tools/vision-ab-test.mjs';

test('parseArgs splits flags and key=value pairs like the runner CLI', () => {
  const args = parseArgs(['--dry-run', '--round=R1_vertical_motion', '--pair=R1P1', '--num-ctx=8192', 'a=b=c']);
  assert.equal(args.get('dry-run'), true);
  assert.equal(args.get('round'), 'R1_vertical_motion');
  assert.equal(args.get('pair'), 'R1P1');
  assert.equal(args.get('num-ctx'), '8192');
  assert.equal(args.get('a'), 'b=c');
});

test('statedFrameCount reads the manifest conditions, including sampled frames', () => {
  assert.equal(statedFrameCount('same scene, same weather, 6 frames at 1 second intervals'), 6);
  assert.equal(statedFrameCount('same scene, 160x90 mask versus 192x108 mask, 6 frames'), 6);
  assert.equal(statedFrameCount('30 minutes, 960x540 output, include frame-time log and 10 sampled frames'), 10);
  assert.equal(statedFrameCount('capture at 0%, 25%, 50%, 75%, 100% transition'), null);
  assert.equal(statedFrameCount(undefined), null);
});

test('frameCountWarnings reports every variant whose sequence disagrees with the condition', () => {
  const round = { round_id: 'R1_vertical_motion', condition: 'same scene, same weather, 6 frames at 1 second intervals' };
  const fourFrames = Array.from({ length: 4 }, (_, index) => ({ label: `f${index}` }));
  const sixFrames = Array.from({ length: 6 }, (_, index) => ({ label: `f${index}` }));
  const warnings = frameCountWarnings(round, fourFrames, fourFrames);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /R1_vertical_motion variant A: condition states 6 frames, sequence provides 4/);
  assert.match(warnings[1], /R1_vertical_motion variant B: condition states 6 frames, sequence provides 4/);
  assert.deepEqual(frameCountWarnings(round, sixFrames, sixFrames), []);
  assert.deepEqual(frameCountWarnings({ round_id: 'R3', condition: 'capture at 0%, 25%, 50%, 75%, 100% transition' }, fourFrames, fourFrames), []);
});

test('framePath accepts filenames and image/path/frame objects, rejects other types', () => {
  const pack = '/pack';
  const sequence = join(pack, 'R1/A/sequence.json');
  assert.equal(framePath('frame-00.png', sequence, pack), join(pack, 'R1/A/frame-00.png'));
  assert.equal(framePath({ image: 'frame-00.jpg' }, sequence, pack), join(pack, 'R1/A/frame-00.jpg'));
  assert.equal(framePath({ path: 'frame-00.webp' }, sequence, pack), join(pack, 'R1/A/frame-00.webp'));
  assert.equal(framePath({ frame: 'shot.avif' }, sequence, pack), join(pack, 'R1/A/shot.avif'));
  assert.throws(() => framePath('frame-00.bmp', sequence, pack), /unsupported image type: frame-00\.bmp/);
  assert.throws(() => framePath(7, sequence, pack), /each frame must be a filename or image\/path\/frame object/);
  assert.throws(() => framePath({}, sequence, pack), /each frame must be a filename or image\/path\/frame object/);
});

test('loadFrames reads array and frames-object sequences and falls back to the still', async () => {
  const pack = await mkdtemp(join(tmpdir(), 'vision-ab-test-'));
  try {
    await mkdir(join(pack, 'A'), { recursive: true });
    await mkdir(join(pack, 'B'), { recursive: true });
    await writeFile(join(pack, 'A/frame-00.png'), 'png');
    await writeFile(join(pack, 'A/frame-01.png'), 'png');
    await writeFile(join(pack, 'B/frame-00.png'), 'png');
    await writeFile(join(pack, 'A/sequence.json'), JSON.stringify(['frame-00.png', { image: 'frame-01.png' }]));
    await writeFile(join(pack, 'B/sequence.json'), JSON.stringify({ frames: ['frame-00.png'] }));
    const pair = { pair_id: 'R1P1', a: 'A/frame-00.png', b: 'B/frame-00.png', sequence_a: 'A/sequence.json', sequence_b: 'B/sequence.json' };
    const framesA = await loadFrames(pair, 'A', pack);
    assert.deepEqual(framesA.map(frame => frame.label), ['sequence.json#00', 'sequence.json#01']);
    assert.equal(framesA[1].path, join(pack, 'A/frame-01.png'));
    const framesB = await loadFrames(pair, 'B', pack);
    assert.deepEqual(framesB.map(frame => frame.label), ['sequence.json#00']);
    const withoutSequences = await loadFrames({ a: 'A/frame-00.png', b: 'B/frame-00.png' }, 'A', pack);
    assert.deepEqual(withoutSequences, [{ path: join(pack, 'A/frame-00.png'), label: 'frame-00.png' }]);
    const missingSequence = await loadFrames({ a: 'A/frame-00.png', b: 'B/frame-00.png', sequence_a: 'A/missing.json' }, 'A', pack);
    assert.deepEqual(missingSequence, [{ path: join(pack, 'A/frame-00.png'), label: 'frame-00.png', missingSequence: 'A/missing.json' }]);
    await writeFile(join(pack, 'A/empty.json'), JSON.stringify({ frames: [] }));
    await assert.rejects(() => loadFrames({ a: 'A/frame-00.png', sequence_a: 'A/empty.json' }, 'A', pack), /expected a non-empty frames array/);
  } finally {
    await rm(pack, { recursive: true, force: true });
  }
});

test('buildPrompt states the pair, condition and frame labels in a fixed order', () => {
  const round = { round_id: 'R1_vertical_motion', question: 'Which variant keeps cloud banks level?', condition: 'same scene, 6 frames at 1 second intervals' };
  const pair = { pair_id: 'R1P1' };
  const framesA = [{ label: 'sequence.json#00' }, { label: 'sequence.json#01' }];
  const framesB = [{ label: 'sequence.json#00' }];
  const prompt = buildPrompt(round, pair, framesA, framesB);
  assert.match(prompt, /A frames \(sequence\.json#00, sequence\.json#01\), then B frames \(sequence\.json#00\)/);
  assert.match(prompt, /Round: R1_vertical_motion\. Question: Which variant keeps cloud banks level\?\. Condition: same scene, 6 frames at 1 second intervals\. Pair: R1P1\. Schema: /);
  assert.match(prompt, /Do not infer FPS, GPU load, code causes, or projector performance from images/);
});

test('buildPrompt stays byte-identical to the prompt of the recorded qwen2.5vl run', async t => {
  const recordedPath = 'outputs/vision-ab-test/results/ollama/R1P1.json';
  if (!await access(recordedPath).then(() => true, () => false)) return t.skip('no recorded run available');
  const recorded = JSON.parse(await readFile(recordedPath, 'utf8'));
  const frames = variant => recorded.evidence.filter(entry => entry.variant === variant).map(entry => ({ label: entry.frame }));
  const round = { round_id: recorded.round_id, question: 'Which variant keeps cloud banks level and natural during vertical movement?', condition: 'same scene, same weather, 6 frames at 1 second intervals' };
  const prompt = buildPrompt(round, { pair_id: recorded.pair_id }, frames('A'), frames('B'));
  assert.equal(prompt, recorded.prompt);
});

const frameLabels = { A: new Set(['sequence.json#00', 'sequence.json#01']), B: new Set(['sequence.json#00']) };
const validAnswer = () => ({
  pair_id: 'R1P1', winner: 'B', confidence: 0.9,
  scores: { cloud_sagging: 1, motion_stutter: 0, shape_warp: 1, detail_loss: 0, seams_or_pop_in: 0, background_camera_motion: 0, naturalness: 2 },
  locations: [{ variant: 'A', frame: 'sequence.json#00', region: 'cloud banks', severity: 2 }],
  observations: ['Variant B stays level.'], likely_cause: '', next_test: 'Repeat with verified timing.'
});

test('validateResult accepts a schema-conforming answer, with and without frame labels', () => {
  const withLabels = validAnswer();
  assert.equal(validateResult(withLabels, 'R1P1', frameLabels), withLabels);
  const withoutLabels = validAnswer();
  assert.equal(validateResult(withoutLabels, 'R1P1'), withoutLabels);
});

test('validateResult rejects the documented llava failure modes and malformed answers', () => {
  assert.throws(() => validateResult({ ...validAnswer(), confidence: 2 }, 'R1P1', frameLabels), /invalid confidence/);
  assert.throws(() => validateResult({ ...validAnswer(), locations: [{ variant: 'A', frame: '0', region: 'cloud banks', severity: 2 }] }, 'R1P1', frameLabels), /locations must use presented frame labels/);
  assert.throws(() => validateResult({ ...validAnswer(), extra: 1 }, 'R1P1', frameLabels), /unexpected result properties/);
  assert.throws(() => validateResult({ ...validAnswer(), winner: 'C' }, 'R1P1', frameLabels), /invalid pair_id or winner/);
  assert.throws(() => validateResult({ ...validAnswer(), pair_id: 'R9P9' }, 'R1P1', frameLabels), /invalid pair_id or winner/);
  assert.throws(() => validateResult({ ...validAnswer(), scores: { ...validAnswer().scores, naturalness: 4 } }, 'R1P1', frameLabels), /invalid scores/);
  assert.throws(() => validateResult({ ...validAnswer(), scores: { ...validAnswer().scores, naturalness: '2' } }, 'R1P1', frameLabels), /invalid scores/);
  assert.throws(() => validateResult({ ...validAnswer(), locations: [{ variant: 'A', frame: 'sequence.json#00', region: 'cloud banks', severity: 9 }] }, 'R1P1', frameLabels), /invalid locations/);
  assert.throws(() => validateResult({ ...validAnswer(), observations: 'none' }, 'R1P1', frameLabels), /invalid observations or follow-up fields/);
  assert.throws(() => validateResult(null, 'R1P1', frameLabels), /unexpected result properties/);
});

test('validateResult still accepts arbitrary frame strings when no labels are provided', () => {
  const answer = { ...validAnswer(), locations: [{ variant: 'A', frame: '0', region: 'cloud banks', severity: 2 }] };
  assert.equal(validateResult(answer, 'R1P1'), answer);
});

test('normalizeAnswer rescales confidence from 0-3/0-10/0-100 and records every change', () => {
  const { answer, changes } = normalizeAnswer({ ...validAnswer(), confidence: 2 });
  assert.equal(answer.confidence, 0.667);
  assert.deepEqual(changes, ['confidence: 2 -> 0.667 (rescaled from 0-3)']);
  assert.equal(normalizeAnswer({ ...validAnswer(), confidence: 5 }).answer.confidence, 0.5);
  assert.equal(normalizeAnswer({ ...validAnswer(), confidence: 90 }).answer.confidence, 0.9);
  assert.equal(normalizeAnswer({ ...validAnswer(), confidence: '0.9' }).answer.confidence, 0.9);
  const untouched = validAnswer();
  assert.deepEqual(normalizeAnswer(untouched), { answer: untouched, changes: [] });
});

test('normalizeAnswer coerces numeric strings for scores and severity', () => {
  const base = validAnswer();
  const { answer, changes } = normalizeAnswer({
    ...base,
    scores: { cloud_sagging: '1', motion_stutter: '0', shape_warp: '1', detail_loss: '0', seams_or_pop_in: '0', background_camera_motion: '0', naturalness: '2' },
    locations: [{ variant: 'A', frame: 'sequence.json#00', region: 'cloud banks', severity: '2' }]
  });
  assert.equal(answer.scores.naturalness, 2);
  assert.equal(answer.locations[0].severity, 2);
  assert.equal(changes.length, 8); // 7 score keys + 1 severity
  assert.ok(changes.includes('scores.naturalness: "2" -> 2'));
  assert.ok(changes.includes('locations[0].severity: "2" -> 2'));
});

test('normalizeAnswer leaves non-numeric and out-of-scope values for the validator', () => {
  const { answer, changes } = normalizeAnswer({ ...validAnswer(), confidence: 'high', observations: ['fine'] });
  assert.equal(answer.confidence, 'high');
  assert.deepEqual(changes, []);
  const huge = normalizeAnswer({ ...validAnswer(), confidence: 1000 });
  assert.equal(huge.answer.confidence, 1000);
});

test('a normalized llava-style answer passes validation', () => {
  const llavaStyle = {
    pair_id: 'R1P1', winner: 'B', confidence: 2,
    scores: { cloud_sagging: '1', motion_stutter: '0', shape_warp: '1', detail_loss: '0', seams_or_pop_in: '0', background_camera_motion: '0', naturalness: '2' },
    locations: [{ variant: 'A', frame: 'sequence.json#00', region: 'cloud banks', severity: '2' }],
    observations: ['Variant B stays level.'], likely_cause: '', next_test: 'Repeat with verified timing.'
  };
  const { answer, changes } = normalizeAnswer(llavaStyle);
  assert.equal(changes.length, 9); // confidence rescale + 7 scores + 1 severity
  assert.equal(validateResult(answer, 'R1P1', frameLabels), answer);
});

test('retryPrompt repeats the rejection and lists the presented frame labels', () => {
  const prompt = retryPrompt('Base prompt.', new AnswerRejectedError('R1P1: invalid confidence'), frameLabels);
  assert.match(prompt, /^Base prompt\.\nYour previous reply was rejected: R1P1: invalid confidence\./);
  assert.match(prompt, /Valid location frame labels — A: sequence\.json#00, sequence\.json#01; B: sequence\.json#00\./);
  assert.match(prompt, /Return corrected JSON only, matching the schema exactly\.$/);
  assert.doesNotMatch(retryPrompt('Base.', 'failed', undefined), /Valid location frame labels/);
});
