// A single continuous apparent rotation for both stars and the Milky Way.
// The real sky rotates roughly 15 degrees/hour; this is a deliberate
// time-lapse. A fixed pivot and fixed sky positions trace circular arcs.
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
export const SKY_PIVOT = { x: .5, y: -.8 } as const;
export const GALACTIC_ANCHOR = { x: 1, y: .65 } as const;
export function celestialMotionAt(elapsedMs: number) {
  const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const progress = Math.max(0, Math.min(1, (t - 200_000) / 252_000));
  // Keep the rotated sky visible after the Milky Way exits. Blend back to
  // the original star field only while returning clouds cover the change.
  const blend = smooth((t - 176_000) / 24_000) * (1 - smooth((t - 524_000) / 120_000));
  return { progress, angle: -1.8 * progress, blend };
}

export function rotateSkyPoint(x: number, y: number, angle: number) {
  const dx=x-SKY_PIVOT.x, dy=y-SKY_PIVOT.y, c=Math.cos(angle), s=Math.sin(angle);
  return { x: SKY_PIVOT.x + dx*c - dy*s, y: SKY_PIVOT.y + dx*s + dy*c };
}
