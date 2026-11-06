import { isLightSkyEvent, type SkyMicroEventKind } from './dream-sky.js';
export type SkyWeather = {
  amount: number; thickness: number; contrast: number; turbulence: number;
  texture: number; speed: number; palette: number; colorSpread: number;
  stars: number; milkyWay: number; storm: number; saturation: number;
};
export const initialWeather: SkyWeather = {
  amount: .6, thickness: 1.1, contrast: 1.15, turbulence: .9,
  texture: .25, speed: 1, palette: 4.8, colorSpread: 1.4,
  stars: .6, milkyWay: 0, storm: .55, saturation: 1,
};
// Correlated weather, not independent switches: thick skies hide stars and
// permit more lightning. Targets are reached continuously over minutes.
// Coverage swings wider per user request 2026-11-02: thin scattered clouds to
// occasional near-full deck, and clear phases that let the Milky Way surface.
// The Dream phase clock separately controls the Milky Way.
export function chooseWeather(random: () => number): SkyWeather {
  const amount = .14 + random() * .8;
  return {
    saturation: 1, amount, thickness: .75 + amount * .65 + random() * .2,
    contrast: .9 + random() * .55, turbulence: .55 + random() * .8,
    texture: random(), speed: .85 + random() * .5,
    palette: random() * 7, colorSpread: .65 + random() * 1.2,
    stars: .4 + (1 - amount) * .55,
    milkyWay: 0,
    storm: random() < .28 ? 0 : amount * (.5 + random() * .5),
  };
}
// Dream time is divided into a 36-minute cloudscape and a 12-minute
// Milky Way phase. The visible transition is separately eased over minutes.
export function milkyPhase(dreamElapsedMs: number) {
  const cycle = 48 * 60_000;
  return ((Math.max(0, dreamElapsedMs) % cycle) >= 36 * 60_000) ? 1 : 0;
}
export function homeWeather(weather: SkyWeather): SkyWeather {
  return { ...weather, amount: .42 + weather.amount * .18, thickness: 1,
    contrast: .95, turbulence: .65, texture: .2 + weather.texture * .25,
    speed: .75 + (weather.speed - .85) * .3, palette: 5.15 + .6 * Math.sin(weather.palette * Math.PI * 2 / 7),
    colorSpread: .25, stars: .45, milkyWay: .08, storm: weather.storm * .55, saturation: .35 };
}
export function weatherForMode(weather: SkyWeather, dreamMix: number): SkyWeather {
  const result = homeWeather(weather), mix = Math.max(0, Math.min(1, dreamMix));
  for (const key of Object.keys(result) as (keyof SkyWeather)[]) {
    const difference = key === 'palette' ? ((weather[key] - result[key] + 10.5) % 7) - 3.5 : weather[key] - result[key];
    result[key] += difference * mix;
    if (key === 'palette') result[key] = (result[key] + 7) % 7;
  }
  return result;
}
export function advanceWeather(current: SkyWeather, target: SkyWeather, elapsedMs: number) {
  const dt = Math.max(0, Math.min(250, elapsedMs));
  for (const key of Object.keys(current) as (keyof SkyWeather)[]) {
    // Milky Way surfaces over many minutes by design: its own slow smoothing
    // key turns clear phases into a gradual reveal, never a sudden view.
    const amount = 1 - Math.exp(-dt / (key === 'texture' ? 600_000 : key === 'milkyWay' ? 420_000 : 100_000));
    // Palette moves around a ring by the shortest path, without a seam.
    const difference = key === 'palette' ? ((target[key] - current[key] + 10.5) % 7) - 3.5 : target[key] - current[key];
    current[key] += difference * amount;
    if (key === 'palette') current[key] = (current[key] + 7) % 7;
  }
}
export function canAddSkyEvent(active: readonly SkyMicroEventKind[], kind: SkyMicroEventKind) {
  if (active.length >= 2 || active.includes(kind)) return false;
  // Thunder is exclusive: it may start on its own, but never shares a frame
  // with another event. Heavier kinds never share; at most two genuinely cheap
  // kinds may overlap so festivals of layered effects cannot stack up.
  if (kind === 'thunder') return active.length === 0;
  if (active.includes('thunder')) return false;
  return isLightSkyEvent(kind) && active.every(isLightSkyEvent);
}
const hash = (x: number) => ((Math.sin(x * 127.1) * 43758.5453) % 1 + 1) % 1;
// Variable thunder length: each discharge keeps its pulses inside the first
// two thirds, but the real-time pace differs per event (2.2–5.8 s). Duration
// variability alone changes the apparent velocity of every pulse train.
export function thunderDuration(seed: number) {
  return 2200 + hash(seed * 1.37 + 3.1) * 3600;
}
// Soften only the brightest peaks; retain the weaker pulse envelope unchanged.
export function thunderExposure(pulse: number, dreamBlend: number) {
  const mix = Math.max(0, Math.min(1, dreamBlend));
  return Math.min(.82, Math.max(0, pulse) * (1.05 + .15 * mix));
}
export type ThunderPulse = { start: number; attack: number; decay: number; sustain: number; release: number; amplitude: number; big: boolean; };
// One local discharge inside ONE cloud cluster. The dominant flicker stays in
// that cloud: 1–4 irregular pulses (pa-pa-pa on nearly the same spot), unequal
// dark gaps, no alternating lobes. A later pulse can swell bigger than the
// rest; only such a discharge earns a delayed, weaker echo in adjacent banks.
export function thunderBurst(seed: number): ThunderPulse[] {
  const roll = hash(seed + 20);
  const count = roll < .15 ? 1 : roll < .52 ? 2 : roll < .82 ? 3 : 4;
  const bigIndex = count > 1 && hash(seed + 23) < .32 ? 1 + Math.floor(hash(seed + 27) * (count - 1)) : -1;
  const pulses: ThunderPulse[] = [];
  let previousEnd = 0;
  for (let i = 0; i < count; i++) {
    const big = i === bigIndex;
    // Controlled envelope: later pulses keep nearly the same brightness and
    // length as the first, with only small natural variation — no successive
    // fade-out ("bam-bam") that reads as a dying generator. Longer trains use
    // crisper pulses so even four repeats fit the bounded dark tail.
    const crowd = count >= 3 ? .74 : 1;
    const scale = i === 0 ? 1 : .84 + hash(seed + 91 + i * 3) * .16;
    const shape = i === 0 ? 1 : .88 + hash(seed + 95 + i * 2) * .12;
    const milliseconds = { attack: (.028 + hash(seed + 41 + i) * .022) * shape * crowd,
      decay: (.04 + hash(seed + 51 + i) * .028) * shape * crowd, sustain: (.007 + hash(seed + 61 + i) * .011) * shape * crowd,
      release: (.05 + hash(seed + 71 + i) * .022) * shape * crowd };
    const duration = milliseconds.attack + milliseconds.decay + milliseconds.sustain + milliseconds.release;
    // Everything lives in the first two thirds; the last third is always dark.
    const latest = .64 - duration;
    // Gaps stay small, unequal and realistic: quick repeats, rarely a longer
    // pause, never progressive decay.
    const gap = i === 0 ? .04 + hash(seed + 31) * .018 : .02 + hash(seed + 101 + i * 7) * (.022 + i * .009);
    const start = previousEnd === 0 ? gap : previousEnd + gap;
    if (start > latest) break;
    pulses.push({ start, ...milliseconds, amplitude: Math.min(1, scale), big });
    previousEnd = start + duration;
  }
  return pulses;
}
export function lightningPulse(progress: number, seed: number, cloud: number) {
  const smooth = (t: number) => t * t * (3 - 2 * t);
  // Neighbouring banks replay the SAME big discharge with a small natural
  // delay, so the wave front travels outward once instead of blinking side to
  // side. The echo travel time varies per event (variable front velocity) and
  // stays well below the burst length, so the replay is always heard.
  const echoVelocity = .7 + hash(seed + 161) * .9;
  const delay = cloud === 0 ? 0 : (.009 + hash(seed + 141 + cloud) * .011) * echoVelocity;
  const dim = cloud === 0 ? 1 : .34 + hash(seed + 151 + cloud) * .09;
  let result = 0;
  for (const p of thunderBurst(seed)) {
    if (cloud !== 0 && !p.big) continue;
    const t = progress - p.start - delay;
    const value = t < 0 ? 0 : t < p.attack ? smooth(t / p.attack)
      : t < p.attack + p.decay ? 1 - .84 * smooth((t - p.attack) / p.decay)
      : t < p.attack + p.decay + p.sustain ? .16
      : .16 * Math.max(0, 1 - (t - p.attack - p.decay - p.sustain) / p.release) ** 2;
    result = Math.max(result, value * p.amplitude * dim);
  }
  return result;
}
export function thunderCluster(seed: number, center: { x: number; y: number }) {
  const regions = [{ x: center.x, y: center.y }];
  if (hash(seed + 121) > .58) {
    const angle = hash(seed + 131) * Math.PI * 2;
    regions.push({ x: center.x + Math.cos(angle) * .018, y: center.y + Math.sin(angle) * .032 });
  }
  return regions;
}
export function thunderPosition(anchor: { x: number; y: number; windX: number; windY: number }, wind: { x: number; y: number }) {
  const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
  return { x: anchor.x + clamp(wind.x - anchor.windX, .012), y: anchor.y + clamp(wind.y - anchor.windY, .01) };
}

/** Cached alpha from the same background sprite that is painted, in row-major order. */
export type BackgroundCloudMask = { width: number; height: number; alpha: Uint8Array };
/** Deterministic candidate selection; null means retry when a cloud is available. */
export function backgroundThunderAnchor(mask: BackgroundCloudMask, seed: number, storm: number) {
  if (storm < .12 || mask.width < 1 || mask.height < 1 || mask.alpha.length < mask.width * mask.height) return null;
  // A coarse deterministic scan cannot miss a sparse highlight patch the way
  // a handful of random probes can. It runs only when a storm starts, never in
  // the frame loop.
  let best: { x: number; y: number; density: number } | null = null;
  const step = Math.max(1, Math.floor(Math.min(mask.width, mask.height) / 48));
  for (let y = 1; y < mask.height; y += step) for (let x = 1; x < mask.width; x += step) {
    const density = mask.alpha[y * mask.width + x]! / 255;
    if (!best || density > best.density) best = { x: x / mask.width, y: y / mask.height, density };
  }
  if (!best || best.density < .22) return null;
  // A small seeded nudge keeps successive storms from pinning one exact pixel.
  return {
    x: Math.max(.04, Math.min(.96, best.x + (hash(seed) - .5) * .02)),
    y: Math.max(.04, Math.min(.96, best.y + (hash(seed + 5) - .5) * .02)),
    density: best.density,
  };
}
/** Alpha multiplier for a local glow; zero alpha always leaves open sky untouched. */
export function backgroundThunderAlpha(cloudAlpha: number, radial: number, pulse: number) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return clamp(cloudAlpha) * clamp(radial) * clamp(pulse);
}

/** Build once from the unmodified background RGBA; reject isolated stars using neighbourhood luminance. */
export function makeBackgroundLightningMask(width: number, height: number, rgba: Uint8ClampedArray): BackgroundCloudMask {
  const alpha = new Uint8Array(width * height), luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) luma[i] = .2126 * rgba[i * 4]! + .7152 * rgba[i * 4 + 1]! + .0722 * rgba[i * 4 + 2]!;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += luma[i + dy * width + dx]!;
    if (sum / 9 >= 34 && luma[i]! >= 42) alpha[i] = Math.round(Math.min(1, (luma[i]! - 42) / 26) * 255 * rgba[i * 4 + 3]! / 255);
  }
  return { width, height, alpha };
}
/** A short first wait and bounded variable spacing; caller supplies a uniform random value. */
export function thunderWaitMs(random: number, first = false) {
  const r = Math.max(0, Math.min(1, random));
  return first ? 12000 + r * 8000 : 22000 + r * 28000;
}

/** A modestly shorter quiet gap for the hybrid cloudscape. */
export function hybridThunderWaitMs(random: number) {
  const r = Math.max(0, Math.min(1, random));
  return 8_000 + r * 10_000;
}
