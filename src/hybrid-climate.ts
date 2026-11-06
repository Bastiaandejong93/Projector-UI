// Slow atmospheric targets. This state contains no rendering work and can be
// advanced at any frame cadence. A supplied RNG makes test playback repeatable.
export type ClimateMood = {
  coverage: number;
  red: number;
  green: number;
  blue: number;
  storm: number;
};
export type ClimateState = {
  start: number;
  end: number;
  fade: number;
  index: number;
  from: ClimateMood;
  to: ClimateMood;
  clearing: boolean;
};

const initial: ClimateMood = { coverage: .96, red: .92, green: .97, blue: 1.04, storm: .65 };
const palettes = [
  [.90, .96, 1.14], [.99, 1.00, 1.01], [.88, 1.12, .98], [1.14, .93, .97],
] as const;
const unit = (random: () => number) => Math.max(0, Math.min(.999999999, random()));
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

export function createClimate(random: () => number): ClimateState {
  const duration = 4 * 60_000 + unit(random) * 4 * 60_000;
  return { start: 0, end: duration, fade: 2 * 60_000, index: 0, from: { ...initial }, to: { ...initial }, clearing: false };
}

function nextSegment(state: ClimateState, random: () => number) {
  const start = state.end, from = state.to, index = state.index + 1;
  // A clearing has to return to clouds; the first three segments also remain
  // cloudy. Thereafter only a small fraction of mood changes opens the sky.
  const clearing = !state.clearing && index >= 3 && unit(random) < .02;
  const palette = palettes[Math.floor(unit(random) * palettes.length)]!;
  // Ordinary moods stay densely overcast; only the rare clearing thins them.
  const coverage = clearing ? .08 : .92 + unit(random) * .08;
  const to: ClimateMood = { coverage, red: palette[0], green: palette[1], blue: palette[2],
    storm: clearing ? 0 : .2 + unit(random) * .75 };
  const fade = (clearing || state.clearing ? 2 : 1.5) * 60_000 + unit(random) * 90_000;
  const hold = clearing ? 60_000 + unit(random) * 90_000 : 3 * 60_000 + unit(random) * 3 * 60_000;
  Object.assign(state, { start, end: start + fade + hold, fade, index, from, to, clearing });
}

export function climateAt(state: ClimateState, elapsedMs: number, random: () => number): ClimateMood {
  if (!Number.isFinite(elapsedMs) || elapsedMs < state.start) throw new RangeError('Invalid climate time');
  while (elapsedMs >= state.end) nextSegment(state, random);
  const t = smooth((elapsedMs - state.start) / state.fade);
  const lerp = (key: keyof ClimateMood) => state.from[key] + (state.to[key] - state.from[key]) * t;
  return { coverage: lerp('coverage'), red: lerp('red'), green: lerp('green'), blue: lerp('blue'), storm: lerp('storm') };
}
