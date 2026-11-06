/** Stable, subtle additions to the existing star texture; no per-frame work. */
export function extraStars(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3) throw new RangeError('Invalid star field size');
  let state = 0x51a7e11;
  const next = () => { state = (Math.imul(state,1664525)+1013904223) >>> 0; return state/0x1_0000_0000; };
  return Array.from({length:220}, () => ({
    x: 1+Math.floor(next()*(width-2)),
    y: 1+Math.floor(next()*(height-2)),
    alpha: .12+next()*.16,
  }));
}
