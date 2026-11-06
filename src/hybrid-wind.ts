export const INITIAL_HYBRID_WIND = .022;
export const HYBRID_WIND_MIN = .0176;
export const HYBRID_WIND_MAX = .0264;
export const HYBRID_HEADING_LIMIT = .12;
const INERTIA_MS = 180_000;

/** Integrate the positive prevailing wind analytically, independent of FPS. */
export function advanceHybridWind(speed: number, target: number, elapsedMs: number,
  out = { speed: 0, movement: 0 }) {
  if (!Number.isFinite(speed) || !Number.isFinite(target) || !Number.isFinite(elapsedMs) || speed < 0 || target < 0 || elapsedMs < 0) {
    throw new RangeError('Invalid hybrid wind');
  }
  const decay = Math.exp(-elapsedMs / INERTIA_MS);
  out.speed = target + (speed - target) * decay;
  out.movement = (target * elapsedMs + (speed - target) * INERTIA_MS * (1 - decay)) / 1000;
  return out;
}

/** Slowly steer a shared near-horizontal heading, with no instant turn. */
export function advanceHybridHeading(heading: number, target: number, elapsedMs: number) {
  if (!Number.isFinite(heading) || !Number.isFinite(target) || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError('Invalid hybrid heading');
  }
  const bounded = Math.max(-HYBRID_HEADING_LIMIT, Math.min(HYBRID_HEADING_LIMIT, target));
  return bounded + (heading - bounded) * Math.exp(-elapsedMs / INERTIA_MS);
}

/** Bound vertical travel smoothly while leaving horizontal motion continuous. */
export function hybridVerticalOffset(travel: number) {
  const bounded = Math.max(-.06, Math.min(.06, travel));
  return .025 * Math.sin(bounded / .06 * Math.PI / 2);
}
