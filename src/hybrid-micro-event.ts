// One restrained, opt-in local glow. Times are real milliseconds; the smooth
// envelope starts and ends at zero, so no event appears as an abrupt flash.
export const MICRO_GLOW_DURATION = 24_000;
export function microGlowEnvelope(elapsed: number): number {
  if (elapsed <= 0 || elapsed >= MICRO_GLOW_DURATION) return 0;
  const phase = elapsed / MICRO_GLOW_DURATION;
  return Math.sin(Math.PI * phase) ** 2;
}
export function nextMicroGlowDelay(random: number): number {
  return 120_000 + Math.max(0, Math.min(1, random)) * 180_000;
}
