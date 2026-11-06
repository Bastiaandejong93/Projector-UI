// Scene-specific regions of the photographed cloud banks. Broad bright
// neighbourhoods select cloud volume; the open star field and isolated points
// are rejected before any motion is applied.
export type CloudMasks = { cloud: Uint8Array; highlight: Uint8Array };
export type CloudFlow = { x: number; y: number; shade: number };
export const BACKGROUND_ADVECTION_RATE = 2.8;
// Two overlapping parcels reset only while invisible. Both travel downwind;
// unlike a bounded sine offset, neither parcel ever reverses velocity.
export function advectedParcel(wind: number, second = false) {
  const travel = wind * BACKGROUND_ADVECTION_RATE + (second ? .5 : 0);
  const phase = ((travel % 1) + 1) % 1;
  // Each invisible handoff seeds a different travel span. Variation belongs
  // to a whole parcel, never a pixel or frame; no seven-second exact replay.
  const cycle = Math.floor(travel);
  const hash = Math.sin(cycle * 127.1 + (second ? 17.7 : 3.1)) * 43758.5453;
  const span = .09 + .03 * (hash - Math.floor(hash));
  return { offset: phase * span, weight: Math.sin(Math.PI * phase) ** 2 };
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
// Background clouds are animated as a local cloud-region flow. These bounds are
// large enough to read at projector distance, while the source photograph,
// stars and all fixed structures remain pixel-locked.
export const BACKGROUND_CLOUD_DRIFT = .34;
export const BACKGROUND_CLOUD_PHASE_SPEED = 10;
// Maximum local displacement of cloud pixels, as a fraction of the frame.
export const BACKGROUND_CLOUD_FLOW = .12;
export const BACKGROUND_CLOUD_FLOW_SPEED = 7;
export function makeCloudMasks(width: number, height: number, rgba: Uint8ClampedArray): CloudMasks {
  const cloud = new Uint8Array(width * height), highlight = new Uint8Array(width * height);
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) luma[i] = .2126 * rgba[i*4]! + .7152 * rgba[i*4+1]! + .0722 * rgba[i*4+2]!;
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const i = y * width + x;
    let sum = 0, min = 255;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const v = luma[i + dy * width + dx]!; sum += v; min = Math.min(min, v);
    }
    // A broad bright neighbourhood is the only cloud signal. The open star
    // field stays below this floor even where individual stars are bright (a
    // star-rich plate measures ~9%), so every photographed cloud bank (top,
    // volume and lower banks) may flow while stars and fixed structures stay
    // untouched. Floors are set low on purpose: the masks must cover most of
    // the plate so the background reads as moving, not as a sparse overlay.
    const mean = sum / 25;
    if (mean < 26 || min < 10 || luma[i]! < 28) continue;
    const a = clamp((mean - 26) / 20) * clamp((luma[i]! - 28) / 18);
    cloud[i] = Math.round(Math.min(1, a * 1.1) * 255);
    if (mean >= 44 && luma[i]! >= 52) highlight[i] = Math.round(Math.min(1, a * 1.1) * clamp((luma[i]! - 52) / 28) * 255);
  }
  return { cloud, highlight };
}
// The phase is a bounded local erosion, never a translation of a photograph.
// The advancing front moves in the shared wind direction, while individual
// clouds gently phase in place between clearing events. Presence stays dense in
// the cloud core so this can never read as a thin smoke sheet.
export function cloudErosion(x: number, y: number, windX: number, windY: number, vx: number, vy: number, clear: number) {
  const length = Math.hypot(vx, vy) || 1, dx = vx / length, dy = vy / length;
  const drift = BACKGROUND_CLOUD_DRIFT * Math.sin(windX * 1.35 + windY * .22);
  const along = clamp(.5 + (x - .5) * dx + (y - .5) * dy + drift);
  const phase = .5 + .5 * Math.sin(x * 8.5 + y * 5.5 - windX * BACKGROUND_CLOUD_PHASE_SPEED - windY * 1.7);
  const base = .9 + .1 * phase;
  const front = clamp(clamp(clear) * 2 - (1 - along));
  return clamp(base * (1 - clear) + front * clamp(clear));
}
// Local cloud-region flow in normalized frame units. The dominant wind picks
// the direction; a single travelling wave gives neighbouring cells one shared
// phase. The wave is positive-only, so every sample lies upwind of its
// destination and the field can never split into opposing left/right travel.
export function cloudFlowOffset(x: number, y: number, windX: number, windY: number, vx: number, vy: number,
  out: CloudFlow = { x: 0, y: 0, shade: 1 }): CloudFlow {
  const length = Math.hypot(vx, vy) || 1, dx = vx / length, dy = vy / length;
  const along = (x - .5) * dx + (y - .5) * dy;
  const across = (y - .5) * dx - (x - .5) * dy;
  // A low spatial frequency keeps a whole bank moving together instead of
  // shearing cloud detail apart like rubber.
  const phase = along * 5 + across * 1.8 - (windX * BACKGROUND_CLOUD_FLOW_SPEED + windY * 1.1);
  const wave = .5 + .5 * Math.sin(phase);
  const amplitude = BACKGROUND_CLOUD_FLOW * (.7 + .3 * Math.sin(windX * .8 + y * 3.4));
  out.x = dx * amplitude * wave;
  out.y = dy * amplitude * wave * .65;
  // Light never rises above the photograph itself: clouds stay darker and
  // denser than their plate, never a translucent lighter smoke sheet.
  const light = .5 + .5 * Math.sin(along * 2.2 + across * .7 - (windX * 1.15 + windY * .3) + 2.1);
  out.shade = .88 + .12 * light;
  return out;
}
export function erodedAlpha(mask: number, x: number, y: number, windX: number, windY: number, vx: number, vy: number, clear: number) {
  return Math.round(clamp(mask / 255) * cloudErosion(x, y, windX, windY, vx, vy, clear) * 255);
}
