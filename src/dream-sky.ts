// Pure, deterministic renderer policy. Positions are viewport fractions.
// User budget 2026-11-02: thunder 25%, meteor-shower pinned at 2%, everything
// else raised. Selection chance is not frequency: thunder still needs stormy
// dense banks before it may start.
export const skyEventWeights = [
  ['thunder', .25], ['firefly', .105], ['satellite', .095], ['constellation', .08],
  ['comet', .038], ['flare', .035], ['beacon', .062], ['binary-star', .062],
  ['dust-drift', .052], ['planet-glint', .052], ['star-cluster', .042],
  ['star-dance', .035], ['firefly-pair', .03], ['meteor', .042], ['meteor-shower', .02],
] as const;
export type SkyMicroEventKind = typeof skyEventWeights[number][0];
// User direction 2026-11-04: all micro-events are disabled except thunder.
// The weight table stays for the scheduler's pairing rules and so a future
// pass can re-enable kinds without rewriting the catalogue.
export function chooseSkyEvent(roll: number): SkyMicroEventKind {
  void roll;
  return 'thunder';
}
// Genuinely cheap point events. Only these may overlap as a pair; heavy kinds
// (thunder, constellation, meteor family) always run on their own.
const lightSkyEvents = new Set<SkyMicroEventKind>([
  'firefly', 'satellite', 'beacon', 'binary-star', 'dust-drift',
  'planet-glint', 'star-cluster', 'firefly-pair', 'flare', 'star-dance',
]);
export function isLightSkyEvent(kind: SkyMicroEventKind) {
  return lightSkyEvents.has(kind);
}
export type WindField = { x: number; y: number; vx: number; vy: number; targetVx: number; targetVy: number };
export function createWindFields(): WindField[] {
  return [0, 1, 2].map(i => ({ x: i * .37, y: 0, vx: .0115 + i * .002, vy: -.0008 + i * .0006, targetVx: .0115 + i * .002, targetVy: -.0008 + i * .0006 }));
}
// One prevailing target, with bounded field offsets: fields cannot diverge over hours.
export function retargetWinds(fields: WindField[], direction: number, speed: number) {
  const leader = fields[0]!;
  // Preserve one prevailing, almost-horizontal wind. Retargeting may ease the
  // heading slightly, but can never turn the layers into vertical/random motion.
  const angle = Math.max(-.08, Math.min(.08, Math.atan2(leader.vy, leader.vx) + (direction - .5) * .05));
  // User feedback 2026-11-04: clouds must drift much faster yet cohesively, so
  // the band narrows around a brisk heading and the per-field speed spread is
  // small — banks march together instead of scattering in all directions.
  const magnitude = Math.max(.0115, Math.min(.0165, Math.hypot(leader.vx, leader.vy) + (speed - .5) * .003));
  fields.forEach((field, index) => {
    const heading = Math.max(-.085, Math.min(.085, angle + (index - 1) * .018));
    const velocity = magnitude * (1 + index * .08);
    field.targetVx = Math.cos(heading) * velocity;
    field.targetVy = Math.sin(heading) * velocity;
  });
}
export function cloudVisibility(base: number, overlay: number, blend: number) {
  const t = Math.max(0, Math.min(1, blend));
  const eased = t * t * (3 - 2 * t);
  return (base === 1 ? 0 : 1) * (1 - eased) + (overlay === 1 ? 0 : 1) * eased;
}
export function advanceWind(field: WindField, elapsedMs: number) {
  const seconds = Math.max(0, Math.min(250, elapsedMs)) / 1000;
  const decay = Math.exp(-seconds / 180);
  // Analytic integration makes motion independent of render cadence.
  field.x += field.targetVx * seconds + (field.vx - field.targetVx) * 180 * (1 - decay);
  field.y += field.targetVy * seconds + (field.vy - field.targetVy) * 180 * (1 - decay);
  field.vx = field.targetVx + (field.vx - field.targetVx) * decay;
  field.vy = field.targetVy + (field.vy - field.targetVy) * decay;
}
export function cloudPosition(field: WindField, index: number) {
  const wrap = (n: number) => ((n % 1) + 1) % 1;
  return { x: wrap(field.x + index * .39) * 1.6 - .3, y: .16 + index * .11 + Math.sin(field.y * 2 + index) * .045 };
}
const noise = (seed: number) => ((Math.sin(seed * 127.1) * 43758.5453) % 1 + 1) % 1;
export function thunderClouds(seed: number) { return 1 + Math.floor(noise(seed + 3) * 3); }
export function thunderPulse(progress: number, seed: number, cloud: number) {
  const attack = .035 + noise(seed + cloud) * .045;
  const decay = .05 + noise(seed + cloud + 1) * .06;
  const release = .12 + noise(seed + cloud + 2) * .08;
  const envelope = (t: number) => {
    if (t < 0) return 0;
    if (t < attack) return t / attack;
    if (t < attack + decay) return 1 - .65 * (t - attack) / decay;
    if (t < attack + decay + .035) return .35;
    return .35 * Math.max(0, 1 - (t - attack - decay - .035) / release);
  };
  const start = .06 + cloud * .025;
  const second = start + attack + decay + .035 + release + .04 + noise(seed + 7) * .04 - cloud * .02;
  return Math.min(1, envelope(progress - start) + .7 * envelope(progress - second - cloud * .02));
}

// Fade outside the view before the periodic anchor wraps, including tall viewports.
export function cloudEdgeOpacity(x: number) {
  return Math.max(0, Math.min(1, (x + .3) / .15, (1.3 - x) / .15));
}
