// Prototype (scene-pass transition): instead of crossfading two full photos,
// the outgoing scene's photographic clouds leave as a sprite mass in the
// prevailing wind while a clean sky plate under them (stars baked in, static)
// is handed over to the incoming scene, whose own cloud masses enter from the
// upwind edge and land exactly on their baked positions. Cloud pixels never
// blend with foreign cloud pixels, so mismatched palettes cannot smear into a
// clashing full-image crossfade. Assignees: stars never move — plates are
// drawn statically; only sprites translate.

// Frame widths a full-width cloud sprite must travel to entirely clear the
// render window; both drifts use this span so the swap happens mid-air.
export const SPRITE_TRAVEL = 1.12;
// Slow-start exponent: masses linger, then accelerate out on the wind.
export const SPRITE_GROWTH = 1.6, SPRITE_RETURN = 1.35;
// The two sky-only plates crossfade gently afterwards: their tones are close
// (all approved cloudscapes sit in the same dark blue night range), so no
// clashing full-image blend ever runs.
export const SKY_HANDOVER_START = .25;
export const GALAXY_INDEX = 9;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => t < 0 ? 0 : t > 1 ? 1 : t;

// Galaxy boundaries keep the previous veiled crossfade: the Milky Way photo is
// pure static sky, so its reveal is already an open-sky/stars reveal and its
// rotation transform must stay untouched.
export function transitionMode(currentIndex: number, nextIndex: number): 'scene-pass' | 'crossfade' {
  return currentIndex === GALAXY_INDEX || nextIndex === GALAXY_INDEX ? 'crossfade' : 'scene-pass';
}

// Palette harmonization during fly-away handover: both moving cloud sprites
// are tinted toward one shared tone — the average of the two scenes' active
// background colors — so a green outgoing plate never meets an orange incoming
// one as clashing raw hues. The tone is fixed for the whole transition, so the
// two sprites always agree with each other. Git: the strength is a sine bell
// that is exactly zero at both endpoints, so each sprite leaves and arrives
// with its untouched photographic colors and no pop is possible.
export const HARMONY_CAP = .45;
export function harmonyTone(current: readonly [number, number, number],
  next: readonly [number, number, number]): [number, number, number] {
  return [(current[0]! + next[0]!) / 2, (current[1]! + next[1]!) / 2, (current[2]! + next[2]!) / 2];
}
export function harmonyStrength(blend: number) {
  const t = clamp01(blend);
  return HARMONY_CAP * (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));
}

// Outgoing sprite offset downwind, fraction of the frame width. Zero at the
// first frame and fully off-screen at blend 1, so nothing pops at either end.
export function exitOffset(blend: number) {
  return SPRITE_TRAVEL * clamp01(blend) ** SPRITE_GROWTH;
}

// Incoming sprite offset arriving from upwind; lands exactly on its baked
// position (0) at blend 1, matching the ordinary full-photo draw that follows.
export function entryOffset(blend: number) {
  return SPRITE_TRAVEL * (1 - clamp01(blend)) ** SPRITE_RETURN;
}

// Sky-plate handover alpha: starts late enough that the leaving masses have
// already uncovered much of the static sky.
export function skyHandover(blend: number) {
  return smooth(clamp01((clamp01(blend) - SKY_HANDOVER_START) / (1 - SKY_HANDOVER_START)));
}

// One-time cloudy-pixel inpaint used to cut the sky plate: cloudy cells are
// replaced by the running average of their known sky neighbours so no plate
// keeps holes (and no dark flash can appear behind the leaving clouds). The
// remaining unfilled cells after the passes take the mean of all learned sky
// tones, so fully-cloudy frames still resolve to sky, never black.
export function fillCloudlessSky(width: number, height: number, data: Uint8ClampedArray,
  cloud: Uint8Array, threshold = 96, passes = 28) {
  const total = width * height;
  const unknown = new Uint8Array(total);
  let mean = [0, 0, 0], meanCount = 0;
  for (let i = 0; i < total; i++) {
    if (cloud[i]! >= threshold) unknown[i] = 1;
    else { const p = i * 4; mean[0]! += data[p]!; mean[1]! += data[p + 1]!; mean[2]! += data[p + 2]!; meanCount++; }
  }
  if (meanCount) mean = mean.map(v => v / meanCount);
  // A frame with no sky pixels at all is left untouched — inventing a sky
  // divider would paint black over the photography, which is worse than
  // keeping the plate identical to the photo.
  if (!meanCount) for (let i = 0; i < total; i++) unknown[i] = 0;
  for (let pass = 0; pass < passes; pass++) {
    let remaining = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!unknown[i]) continue;
      let red = 0, green = 0, blue = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (unknown[j]) continue;
        const p = j * 4;
        red += data[p]!; green += data[p + 1]!; blue += data[p + 2]!; count++;
      }
      if (!count) { remaining++; continue; }
      const p = i * 4;
      data[p] = red / count; data[p + 1] = green / count; data[p + 2] = blue / count;
      unknown[i] = 0;
    }
    if (!remaining) break;
  }
  // Any cells that never met a sky neighbour (pass count exhausted) settle on
  // the global sky mean: bounded, sky-toned, never black or white.
  for (let i = 0; i < total; i++) {
    if (!unknown[i]) continue;
    const p = i * 4;
    data[p] = mean[0]!; data[p + 1] = mean[1]!; data[p + 2] = mean[2]!;
  }
}

export function imageReady(image: { complete?: boolean; naturalWidth: number; naturalHeight: number }) {
  return image.complete !== false && image.naturalWidth > 0 && image.naturalHeight > 0;
}
const preparedBackgrounds = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
export function prepareStaticBackground(image: HTMLImageElement) {
  if (!imageReady(image) || preparedBackgrounds.has(image)) return;
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = Math.round(960 * image.naturalHeight / image.naturalWidth);
  canvas.getContext('2d', { alpha: false, willReadFrequently: true })!.drawImage(image, 0, 0, canvas.width, canvas.height);
  preparedBackgrounds.set(image, canvas);
}

// The background is always drawn from the original images at cover geometry.
// In particular, no mask-derived canvas or moving transform enters this path.
export function drawStaticBackgroundTransition(
  ctx: CanvasRenderingContext2D, current: HTMLImageElement, next: HTMLImageElement,
  width: number, height: number, blend: number
) {
  const draw = (image: HTMLImageElement) => {
    if (!imageReady(image)) return;
    const prepared = preparedBackgrounds.get(image);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.drawImage(prepared ?? image, (width - w) / 2, (height - h) / 2, w, h);
  };
  const alpha = Math.max(0, Math.min(1, blend));
  if (alpha === 1 && imageReady(next)) { draw(next); return; }
  draw(current);
  if (alpha > 0 && imageReady(next)) {
    ctx.save();
    try { ctx.globalAlpha = alpha; draw(next); } finally { ctx.restore(); }
  }
}

// The incoming sky is revealed by a very broad, wind-directed atmospheric
// front. The offset is bounded so the reveal remains soft, never a hard wipe.
// Both source images retain fixed cover coordinates throughout.
export function spatialRevealAlpha(position: number, progress: number, windDirection: number) {
  const t = clamp01(progress), x = clamp01(position);
  const direction = windDirection < 0 ? -1 : 1;
  const local = clamp01(t - direction * .18 * Math.sin(Math.PI * t) * (2 * x - 1));
  return smooth(local);
}
type RevealSurface = { layer: HTMLCanvasElement; mask: HTMLCanvasElement; pixels: ImageData };
const revealSurfaces = new WeakMap<HTMLCanvasElement, RevealSurface>();
export function drawSpatialBackgroundTransition(ctx: CanvasRenderingContext2D,
  current: HTMLImageElement, next: HTMLImageElement, width: number, height: number,
  blend: number, windDirection: number) {
  const t = clamp01(blend);
  // Current is always drawn as a complete opaque base. Never expose an empty
  // layer if the next asset is missing, even at the end of a phase.
  if (!imageReady(next) || t <= 0 || t >= 1) {
    drawStaticBackgroundTransition(ctx, current, next, width, height, t);
    return;
  }
  drawStaticBackgroundTransition(ctx, current, current, width, height, 0);
  let surfaces = revealSurfaces.get(ctx.canvas);
  if (!surfaces) {
    const layer = document.createElement('canvas'), mask = document.createElement('canvas');
    mask.width = 96; mask.height = 1;
    const maskContext = mask.getContext('2d')!;
    surfaces = { layer, mask, pixels: maskContext.createImageData(mask.width, 1) };
    revealSurfaces.set(ctx.canvas, surfaces);
  }
  const { layer, mask, pixels } = surfaces;
  const scale = Math.min(1, 960 / width, 540 / height);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  if (layer.width !== w) layer.width = w;
  if (layer.height !== h) layer.height = h;
  for (let x = 0; x < mask.width; x++) {
    const p = x * 4;
    pixels.data[p] = pixels.data[p + 1] = pixels.data[p + 2] = 255;
    pixels.data[p + 3] = Math.round(255 * spatialRevealAlpha(x / (mask.width - 1), t, windDirection));
  }
  mask.getContext('2d')!.putImageData(pixels, 0, 0);
  const layerContext = layer.getContext('2d')!;
  layerContext.globalCompositeOperation = 'copy';
  drawStaticBackgroundTransition(layerContext, next, next, w, h, 0);
  layerContext.globalCompositeOperation = 'destination-in';
  layerContext.drawImage(mask, 0, 0, w, h);
  layerContext.globalCompositeOperation = 'source-over';
  ctx.drawImage(layer, 0, 0, width, height);
}

// Independent translucent cloud wisps: no source photograph or star pixels are
// sampled. Shared wind moves their centres horizontally within a small range.
export function backgroundCloudFlow(windX: number, index: number) {
  const phase = windX * .22 + index * .65;
  return { x: .018 * Math.sin(phase), opacity: .10 + .025 * Math.sin(phase + .8) };
}
export function drawBackgroundCloudFlow(ctx: CanvasRenderingContext2D, width: number, height: number,
  windX: number, color: readonly [number, number, number], clearing: number) {
  const banks = [[.22, .70, .22], [.68, .76, .25], [.48, .88, .24]] as const;
  const rgb = color.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',');
  ctx.save();
  for (let i = 0; i < banks.length; i++) {
    const [x, y, radius] = banks[i]!;
    const flow = backgroundCloudFlow(windX, i);
    const cx = (x + flow.x) * width, cy = y * height, r = radius * width;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, `rgba(${rgb},${flow.opacity * Math.max(0, Math.min(1, clearing))})`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}
