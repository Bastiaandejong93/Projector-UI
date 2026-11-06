export type SkyMicroKind = 'twinkle' | 'meteor' | 'ufo' | 'satellite' | 'aircraft' | 'comet' | 'firefly' | 'probe' | 'meteor_shower' | 'satellite_pair';

const START_MS = 2_000;
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function sampleSkyMicro(kind: SkyMicroKind, elapsedMs: number) {
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  const duration = kind === 'twinkle' ? 4_000 : kind === 'meteor' ? 2_200 : kind === 'satellite' ? 30_000 : kind === 'aircraft' ? 42_000 : kind === 'comet' ? 18_000 : kind === 'firefly' ? 12_000 : kind === 'probe' ? 28_000 : kind === 'meteor_shower' ? 10_000 : kind === 'satellite_pair' ? 30_000 : 16_000;
  const time = Math.max(0, Math.min(duration, elapsed - START_MS));
  const phase = time / duration;

  if (kind === 'twinkle') {
    return {
      x: .57448,
      y: .86204,
      intensity: smooth(phase / .15) * (1 - smooth((phase - .85) / .15)),
      phase,
    };
  }

  if (kind === 'meteor') {
    return {
      x: .18 + (.75 - .18) * phase,
      y: .44 + (.25 - .44) * phase,
      intensity: smooth(phase / .12) * (1 - smooth((phase - .88) / .12)),
      phase,
    };
  }

  if (kind === 'satellite') {
    return {
      x: .12 + .70 * phase,
      y: .28 + .15 * phase,
      intensity: smooth(phase / .12) * (1 - smooth((phase - .88) / .12)),
      phase,
    };
  }

  if (kind === 'meteor_shower') {
    return { x:.5, y:.5, intensity:smooth(time/400)*(1-smooth((time-9600)/400)), phase };
  }
  if (kind === 'firefly') {
    return { x: .28 + .12*phase + .012*Math.sin(phase*Math.PI*2), y: .30 + .06*phase + .01*Math.sin(phase*Math.PI*4),
      intensity: smooth(phase/.15)*(1-smooth((phase-.85)/.15)), phase };
  }
  if (kind === 'probe' || kind === 'satellite_pair') {
    return { x: .12 + .70*phase, y: .55 + .08*phase,
      intensity: smooth(phase/.12)*(1-smooth((phase-.88)/.12)), phase };
  }
  if (kind === 'aircraft' || kind === 'comet') {
    return { x: .10 + .80 * phase, y: (kind === 'aircraft' ? .35 : .60) + .08 * phase,
      intensity: smooth(phase / .12) * (1 - smooth((phase - .88) / .12)), phase };
  }


  const seconds = time / 1_000;
  const x = seconds < 7 ? -.04 + (.62 + .04) * smooth(seconds / 7)
    : seconds < 12 ? .62
      : seconds < 12.5 ? .62 + (1.05 - .62) * smooth((seconds - 12) / .5)
        : 1.05;
  return {
    x,
    // The first preview follows the darker middle of the existing cloud gap.
    y: .37,
    intensity: smooth(seconds / .5) * (1 - smooth((seconds - 15.5) / .5)),
    phase,
  };
}
