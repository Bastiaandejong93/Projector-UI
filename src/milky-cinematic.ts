// Separate visual trial: distinct, continuous stages rather than opening
// clouds and the galactic image at the same time. Times are milliseconds.
export const CINEMATIC_CYCLE_MS = 600_000;
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

// Mostly constant travel speed, with a short acceleration and deceleration.
const travelPhase = (elapsed: number) => {
  const duration = 180_000, ramp = 20_000;
  const t = Math.max(0, Math.min(duration, elapsed));
  if (t < ramp) return t * t / (2 * ramp * (duration - ramp));
  if (t > duration - ramp) return 1 - (duration - t) ** 2 / (2 * ramp * (duration - ramp));
  return (t - ramp / 2) / (duration - ramp);
};

export function cinematicMilkyAt(elapsedMs: number) {
  const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % CINEMATIC_CYCLE_MS;
  const cloudRetreat = smooth((t - 8_000) / 180_000) * (1 - smooth((t - 412_000) / 180_000));
  // The outgoing bank moves right. Once completely offscreen, position the
  // returning bank offscreen on the left; its visible motion remains rightward.
  const cloudTravel = t < 412_000 ? 1.36 * travelPhase(t - 8_000)
    : 1.36 * (travelPhase(t - 412_000) - 1);
  const skyMatch = smooth((t - 188_000) / 48_000) * (1 - smooth((t - 440_000) / 48_000));
  const galaxy = smooth((t - 188_000) / 96_000) * (1 - smooth((t - 344_000) / 96_000));
  return { cloudRetreat, cloudTravel, skyMatch, galaxy };
}
