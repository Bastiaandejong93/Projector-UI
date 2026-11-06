// Cloud amount follows the four-minute background crossfades continuously.
// The galaxy can still be partly clouded; there is no all-or-nothing switch.
export function cloudClearing(phase: number, blend: number) {
  const t = Math.max(0, Math.min(1, blend));
  if (phase % 4 === 2) return 1 - .8 * t;
  if (phase % 4 === 3) return .2 + .8 * t;
  return 1;
}
export type SkyColor = readonly [number, number, number];
export function mixSkyColor(a: SkyColor, b: SkyColor, blend: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, blend));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Shuffle each six-cloud cycle once. The two galaxy phases remain at 3 and 7,
// so the time share stays 3:1 without a chronological image sequence.
export function shuffleClouds(random: () => number) {
  const result = [0, 1, 2, 3, 4, 5];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

// Liquid transition timing: cloud phases never sit in a fixed rhythm and every
// crossfade completes faster than before. Cloud phases drift smoothly inside a
// bounded 4.5–7.5 minute window; galaxy phases keep their fixed 8 minutes so
// the sky still spends a quarter of its time on the Milky Way. No exact loop
// period recurses because durations drift and each phase draws its own
// crossfade-window fraction.
export const GALAXY_PHASE_MS = 8 * 60_000;
export const CLOUD_PHASE_MIN = 4.5 * 60_000, CLOUD_PHASE_MAX = 7.5 * 60_000;
export const CLOUD_PHASE_DRIFT = 2.5 * 60_000;
// Cloud slots use an ordinal inside the eight-phase cycle: the two galaxy
// phases sit at 3 and 7, so the six cloud slots are 0,1,2,4,5,6.
export function cloudscapeOrdinal(within: number) {
  const slot = ((within % 8) + 8) % 8;
  return slot < 3 ? slot : slot - 1;
}
// Explicit DEV/test staging: short, repeatable phases with a crossfade that
// starts after a few seconds, so a transition can be checked on the projector
// without waiting for the normal multi-minute cadence.
export const TRANSITION_TEST_PHASE_MS = 10_000;
export const TRANSITION_TEST_SPLIT = .45;
export function isGalaxyPhase(within: number) {
  return (within % 8) === 3 || (within % 8) === 7;
}
export function liquidCloudDuration(previous: number, random: () => number) {
  return Math.max(CLOUD_PHASE_MIN, Math.min(CLOUD_PHASE_MAX,
    previous + (random() - .5) * CLOUD_PHASE_DRIFT));
}
// The visible crossfade of a phase takes a randomized 42–62% of its own (already
// variable) length, so transition pace itself varies instead of pinning a fixed
// half-window after every phase. The stars stay static; only timing changes.
export const CROSSFADE_MIN = .30, CROSSFADE_MAX = .45;
export function crossfadeSplit(random: () => number) {
  return CROSSFADE_MIN + (CROSSFADE_MAX - CROSSFADE_MIN) * Math.max(0, Math.min(1, random()));
}
