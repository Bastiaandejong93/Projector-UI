import { MILKY_TRIAL_CYCLE_MS, milkyPreviewAt } from './hybrid-milky-trial.js';
import { sampleSkyMicro, type SkyMicroKind } from './sky-micro-trial.js';
import { CINEMATIC_CYCLE_MS, cinematicMilkyAt } from './milky-cinematic.js';
import { celestialMotionAt } from './celestial-motion.js';

type Event = { kind: SkyMicroKind; start: number; yOffset: number; mirrored: boolean };
export type LivingSchedule = {
  nextEvent: number;
  nextMilky: number;
  event: Event | null;
  milkyStart: number | null;
  fast: boolean;
  cinematic: boolean;
  orbital: boolean;
};
const roll = (random: () => number) => Math.max(0, Math.min(.999999, random()));
const duration: Record<SkyMicroKind, number> = { twinkle: 6_000, meteor: 4_200, satellite: 32_000, ufo: 18_000, aircraft: 44_000, comet: 20_000, firefly: 14_000, probe: 30_000, meteor_shower: 12_000, satellite_pair: 32_000 };
const eventDelay = (r: () => number, fast: boolean) => fast ? 3_000 + roll(r) * 3_000 : 75_000 + roll(r) * 135_000;
const milkyDelay = (r: () => number, fast: boolean, cinematic: boolean) => fast ? 5_000 : (cinematic ? 60 + roll(r) * 60 : 30 + roll(r) * 45) * 60_000;

export function createLivingSchedule(random: () => number, fast = false, cinematic = false, orbital = false): LivingSchedule {
  return { nextEvent: eventDelay(random, fast), nextMilky: milkyDelay(random, fast, cinematic), event: null, milkyStart: null, fast, cinematic, orbital };
}

/** Schedules one event at a time; pause a due event during lightning. */
export function advanceLivingSchedule(state: LivingSchedule, elapsed: number, random: () => number, lightning: boolean, canMilky: boolean, canFinishCinematic = true, rareMilkyMsRemaining = 0) {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Invalid living-sky time');
  const factor = state.fast ? 15 : 1;
  if (state.milkyStart !== null && (!state.cinematic || canFinishCinematic) && (elapsed - state.milkyStart) * factor >= (state.cinematic ? CINEMATIC_CYCLE_MS : MILKY_TRIAL_CYCLE_MS)) {
    state.milkyStart = null;
    state.nextMilky = elapsed + milkyDelay(random, state.fast, state.cinematic);
  }
  if (canMilky && state.milkyStart === null && elapsed >= state.nextMilky) state.milkyStart = elapsed;
  if (state.event && elapsed - state.event.start >= duration[state.event.kind]) {
    state.event = null;
    state.nextEvent = elapsed + eventDelay(random, state.fast);
  }
  if (!state.event && !lightning && elapsed >= state.nextEvent) {
    const pick = roll(random);
    const kind: SkyMicroKind = pick < .16 ? 'twinkle' : pick < .38 ? 'meteor' : pick < .52 ? 'satellite' : pick < .64 ? 'aircraft' : pick < .74 ? 'comet' : pick < .83 ? 'firefly' : pick < .91 ? 'probe' : pick < .985 ? 'satellite_pair' : pick < .995 ? 'meteor_shower' : 'ufo';
    // Rare events are skipped outside a sufficiently long visible Milky Way,
    // rather than being queued or made more frequent on the next selection.
    if ((kind === 'ufo' || kind === 'meteor_shower') && rareMilkyMsRemaining < duration[kind]) {
      state.nextEvent = elapsed + eventDelay(random, state.fast);
    } else {
      state.event = { kind, start: elapsed, yOffset: kind === 'twinkle' ? 0 : (roll(random) - .5) * .12, mirrored: kind !== 'twinkle' && roll(random) < .5 };
    }
  }
  const event = state.event;
  const sample = event ? sampleSkyMicro(event.kind, elapsed - event.start) : null;
  const sky = sample && event ? { ...sample, x: event.mirrored ? 1 - sample.x : sample.x,
    y: Math.max(.12, Math.min(.9, sample.y + event.yOffset)), kind: event.kind,
    direction: event.mirrored ? -1 : 1 } : null;
  const at = state.milkyStart === null ? null : (elapsed - state.milkyStart) * factor;
  const milky = at === null || state.cinematic ? null : milkyPreviewAt(at);
  const cinematic = at === null || !state.cinematic ? null : cinematicMilkyAt(at);
  const orbital = at === null || !state.orbital ? null : celestialMotionAt(at);
  return { sky, milky, cinematic, orbital };
}
