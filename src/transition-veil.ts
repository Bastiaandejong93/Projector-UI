// Restrained cloud-overlay transition: while two cloudscapes crossfade, the
// procedural cloud banks that already drift across the sky are drawn stronger
// for the middle of the transition, so a moving foreground breaks up the
// regional hue mismatches where the two photographs disagree. The veil is a
// smooth bell that is exactly the old look at both ends, and it is capped by
// the clearing schedule so the Milky Way phases keep their open sky. Nothing
// here moves the background photographs or their static stars.

// Sine bell over the 0..1 crossfade: 0 at either endpoint, smooth everywhere,
// peak in the middle. Clamped so the endpoints are exactly zero.
export function transitionVeil(blend: number) {
  const t = Math.max(0, Math.min(1, blend));
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
}

// The veil may only reinforce clouds that the weather clearing still allows:
// during the galaxy phases clearing drops toward .2, and the veil shrinks with
// it so the added opacity can never re-cloud the revealed sky.
export function veilWeight(blend: number, clearing: number) {
  return transitionVeil(blend) * Math.max(0, Math.min(1, clearing));
}

// Front-of-sky draw opacities for the cloud mask and its photographic detail
// during a transition, replacing the fixed 0.32 / 0.42 baselines.
export function veilAlphas(veil: number) {
  const v = Math.max(0, Math.min(1, veil));
  return { mask: Math.min(.6, .32 + .28 * v), detail: Math.min(.68, .42 + .26 * v) };
}
