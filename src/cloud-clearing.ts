// Clear the cloud layers using their actual downwind travel, not a timer.
export type CloudClearing = { startWind: number; clearAt: number | null; refillWind: number | null; done: boolean };
export function createCloudClearing(wind: number): CloudClearing {
  return { startWind: wind, clearAt: null, refillWind: null, done: false };
}
const smooth = (v: number) => { const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t); };
export function advanceCloudClearing(state: CloudClearing, wind: number, elapsed: number, fast = false) {
  const moved = Math.max(0,wind-state.startWind);
  if (state.clearAt === null && moved*.35 >= .70) state.clearAt=elapsed;
  const t = state.clearAt === null ? 0 : Math.max(0,elapsed-state.clearAt)*(fast ? 15 : 1);
  const rise = smooth(t/96_000);
  const reveal = state.clearAt === null ? 0 : rise*(1-smooth((t-156_000)/96_000));
  if (state.clearAt !== null && t>=224_000 && moved*.35>=1.12 && state.refillWind===null) state.refillWind=wind;
  const refill = state.refillWind===null ? 0 : Math.max(0,wind-state.refillWind);
  if (state.refillWind!==null && refill*.35>=1.12) state.done=true;
  const rareWindowMs = state.clearAt !== null && reveal >= .20 ? Math.max(0,(252_000-t)/(fast ? 15 : 1)) : 0;
  return { rareWindowMs, mode:state.done ? 0 : state.refillWind===null ? 1 : 2, moved, refill, reveal, rise, done:state.done };
}
