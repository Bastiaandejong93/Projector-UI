// Debug-only preview. A complete cycle takes 5½ minutes: two minutes each to
// open and close, a quiet clear interval, and an overcast rest between cycles.
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
export const MILKY_TRIAL_CYCLE_MS = 330_000;
export function milkyPreviewAt(elapsedMs: number) {
  const t = Math.max(0, elapsedMs) % MILKY_TRIAL_CYCLE_MS;
  const amount = smooth((t - 10_000) / 120_000) * (1 - smooth((t - 170_000) / 120_000));
  return { coverage: .96 - .88 * amount, reveal: amount };
}
