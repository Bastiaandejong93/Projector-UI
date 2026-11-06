import { CloudMotion, bankWidths } from './cloud-motion.js';
import type { WindField } from './dream-sky';
import { initialWeather, type SkyWeather } from './sky-weather.js';
export type CloudFlash = { x: number; y: number; radius: number; strength: number; color?: readonly [number, number, number] };

// A small CPU raster of the living cloud banks, composited over the
// photographic night sky with true alpha: open sky is fully transparent, bank
// interiors opaque, rims feathered. Seeded detail stays attached to each bank;
// the camera never moves.
const lattice = new Float32Array(256 * 256);
let seed = 731;
for (let i = 0; i < lattice.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  lattice[i] = (seed >>> 0) / 4294967296;
}
const ease = (x: number) => x * x * (3 - 2 * x);
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = ease(x - ix), v = ease(y - iy);
  const a = lattice[(iy & 255) * 256 + (ix & 255)]!;
  const b = lattice[(iy & 255) * 256 + ((ix + 1) & 255)]!;
  const c = lattice[((iy + 1) & 255) * 256 + (ix & 255)]!;
  const d = lattice[((iy + 1) & 255) * 256 + ((ix + 1) & 255)]!;
  return a + (b - a) * u + (c - a + (a - b - c + d) * u) * v;
}
const flashColor = [70,72,84];
const baseColor = [5, 9, 18];
const palette = [[34,45,53], [31,49,40], [67,44,29], [57,31,38], [46,35,62], [30,43,63], [28,49,50]];
// Per-bank vertical light: cool violet over lit ridgelines, warm amber under the
// underbellies. Composited only where banks actually contribute, so open sky and
// deep cores stay untouched.
const bankTopColor = [46, 35, 62];
const bankBottomColor = [67, 44, 29];
// Billow-top illumination: only the densest, most textured crests receive the
// extra exposure that brings the tonal range close to the reference assets.
const crestStart = .34, crestSpan = .47;
// Eight explicit cloud banks, no field of thin veils. Each bank is a substantial
// mass with its own drift, altitude, span and slow breathing, so they overtake,
// drift apart and occasionally merge into one bigger cloud. Every bank has its
// own amount gate: clear phases dissolve all eight into open sky (cloudless),
// stormy phases stack them into a temporary layered deck. User feedback
// 2026-11-04: more visible clouds, chunkier bodies, denser bases.
const banks = [
  { field: 0, phase: .08, layer: .30, gate: .18 },
  { field: 1, phase: .52, layer: .52, gate: .26 },
  { field: 2, phase: .86, layer: .72, gate: .36 },
  { field: 0, phase: .30, layer: .16, gate: .45 },
  { field: 1, phase: .68, layer: .84, gate: .54 },
  { field: 2, phase: .12, layer: .52, gate: .30 },
  { field: 0, phase: .62, layer: .62, gate: .24 },
  { field: 1, phase: .44, layer: .38, gate: .46 },
].map((bank, k) => {
  const width = bankWidths[k];
  const height = [.32, .29, .35, .24, .30, .19, .24, .21][k]!;
  return { ...bank, width: width ?? .5, height, id: k };
});
const wrapRange = (n: number, span: number) => ((n % span) + span) % span;
export class CloudTexture {
  readonly pixels: Uint8ClampedArray;
  private readonly relief: Float32Array;
  readonly density: Float32Array;
  geometry: Array<{ cx: number; cy: number; width: number; height: number; id: number; gate: number; color?: readonly [number, number, number] }> = [];
  constructor(readonly width = 320, readonly height = 180, readonly motion = new CloudMotion()) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.relief = new Float32Array(width * height);
    this.density = new Float32Array(width * height);
  }
  render(fields: WindField[], seconds: number, coverage: number, weather: SkyWeather = initialWeather, flashes: readonly CloudFlash[] = [], backgroundColor?: readonly [number, number, number], localColor?: (x: number, y: number) => readonly [number, number, number]) {
    const [a, b, c] = fields;
    this.motion.advance(a!.x, seconds, a!.y);
    // Per-frame bank geometry: one cheap precompute, then only mask work per pixel.
    const geometry = banks.map((bank, k) => {
      const cy = (k === 5 ? banks[1].layer : bank.layer) + this.motion.y[k]!;
      // Staggered amount gate: clear weather dissolves this bank completely,
      // heavy weather opens it; the 100s weather smoothing turns the gate into
      // a slow fade, so banks never pop in or out.
      const desired = ease(Math.max(0, Math.min(1, (weather.amount - bank.gate) / .12)));
      // An absent cloud may re-enter only from beyond its largest possible
      // extent; a changing weather target cannot birth it inside the frame.
      const gate = this.motion.allow(k, desired, 1.3);
      const cx = this.motion.x[k]!;
      // Light weather opens the sky; stormy phases may grow into heavy masses.
      const span = .75;
      return { cx, vaporX: this.motion.vaporX[k]!, cy, width: bank.width * span * .92, height: bank.height * span * 1.32, id: k, gate };
    }).filter(bank => bank.gate > 0);
    this.geometry = geometry;
    // A small spatial palette grid follows the actual background rather than
    // assigning a single, potentially clashing color to each moving bank.
    const colorGrid = localColor ? Array.from({ length: 9 * 5 }, (_, i) => localColor((i % 9) / 8, Math.floor(i / 9) / 4)) : null;
    const nearX = Math.max(1, Math.round(this.width / 160)), nearY = Math.max(1, Math.round(this.height / 90));
    const farX = Math.round(this.width / 45.7), farY = Math.round(this.height / 22.5);
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const u = x / this.width, v = y / this.height;
      // All overlapping envelopes contribute, avoiding owner-switch seams.
      const contributions: Array<{ bank: (typeof geometry)[number]; strength: number }> = [];
      let strongest = 0, maskSum = 1, bankDepth = 0, bankWeight = 0, vaporUnion = 1;
      for (const bank of geometry) {
        const dx = (u - bank.cx) / bank.width, dy = (v - bank.cy) / bank.height;
        // Distort the envelope with continuous, bank-local noise instead of a
        // clean ellipse. The phase is bounded, so shape never drifts away.
        const phase = Math.sin(seconds * .009 + bank.id * 1.7);
        const warp = noise(dx * 2.4 + bank.id * 17 + phase * .16, dy * 2.4 + bank.id * 11) - .5;
        const rest = Math.max(0, Math.min(1, 1 - dx * dx - dy * dy + warp * .36));
        // A wider, translucent vapor envelope travels faster than the dense
        // body but remains tethered to it; noise breaks up the silhouette.
        const vx = (u - bank.vaporX) / (bank.width * 1.12);
        const vy = dy / 1.12;
        const vaporNoise = noise(vx * 3.4 + bank.id * 29 + phase * .25, vy * 3.4 + bank.id * 7);
        const vaporRest = Math.max(0, Math.min(1, 1 - vx * vx - vy * vy + (vaporNoise - .5) * .6));
        const vapor = ease(vaporRest) * bank.gate * (.3 + .7 * vaporNoise);
        vaporUnion *= 1 - vapor;
        const soft = rest * rest * (3 - 2 * rest) * bank.gate * bank.gate;
        if (soft > 0) contributions.push({ bank, strength: soft });
        strongest = Math.max(strongest, soft);
        maskSum *= 1 - soft;
        bankDepth += soft * dy;
        bankWeight += soft;
      }
      let presence = strongest * .7 + (1 - maskSum) * .3;
      // The bank envelope before any vapor-edge sampling: the core floor and
      // the alpha ramp anchor to it, so noisy edge sampling cannot hole the body.
      const envelope = presence;
      let mass = 0, fine = 0, detail = 0, billow = 0, wisps = 0, micro = .5, mist = .5;
      // Blend all overlapping masses by their envelope weights.
      const sampleBank = (bank: (typeof geometry)[number], weight: number) => {
        const id = bank.id, lx = (u - bank.cx) / bank.width, ly = (v - bank.cy) / bank.height;
        // Seeded texture travels with the bank; its core cannot deform or
        // slide independently of the shared wind.
        const edge = Math.max(0, Math.min(1, (1 - weight) * .7));
        // Vapor evolves slightly faster than the anchored body, with a
        // bounded offset to prevent independent, unbounded sliding.
        const phase = Math.sin(seconds * .013 + id * 1.3);
        const px = lx + edge * phase * .07, py = ly + edge * Math.sin(seconds * .01 + id) * .035;
        const broad = noise(px * 2.5 + id * 19, py * 2.5 + id * 13);
        const localBillow = noise(px * 5 + id * 37, py * 5 + id * 11);
        const localFine = noise(px * 10 + id * 17, py * 10 + id * 29);
        const localDetail = noise(px * 20 + id * 43, py * 20 + id * 7);
        const localWisps = noise(px * 38 + id * 9, py * 38 + id * 41);
        const billows = broad * .36 + localBillow * .34 + localFine * .17 + localDetail * .09 + localWisps * .04;
        const filaments = broad * .4 + (1 - Math.abs(localBillow * 2 - 1)) * .23 + localFine * .21 + localDetail * .12 + localWisps * .04;
        let localMass = billows + (filaments - billows) * weather.texture * .25;
        const localMicro = this.width >= 320 ? noise(px * 55 + id * 11, py * 55 + id * 37) : .5;
        const localMist = this.width >= 320 ? noise(px * 90 + id * 21, py * 90 + id * 17) : .5;
        localMass += (localMicro - .5) * .11 + (localMist - .5) * .05;
        mass += localMass * weight;
        billow += localBillow * weight; fine += localFine * weight; detail += localDetail * weight; wisps += localWisps * weight;
        micro += (localMicro - .5) * weight; mist += (localMist - .5) * weight;
        return Math.max(0, Math.min(1, .12 + broad * .95 + localBillow * .65 + (localFine - .5) * .28)) * weight;
      };
      if (bankWeight > 0) {
        const total = bankWeight;
        let edge = 0;
        for (const item of contributions) edge += sampleBank(item.bank, item.strength / total);
        presence *= edge;
      }

      const solid = Math.max(0, Math.min(1, (mass - (.52 - weather.amount * .25)) * (4.5 * weather.contrast)));
      // User feedback 2026-11-04: chunky, voluminous bodies need a relatively
      // stable dense core: where the bank envelope is strongest the interior
      // cannot thin out under noisy billow sampling (scaled by its own amount
      // gate), while vapor rims keep the noise-driven falloff unchanged.
      const solidCore = Math.min(1, solid + (1 - solid) * envelope ** 4 * .55);
      const gateWeight = bankWeight > 0 ? contributions.reduce((sum, item) => sum + item.strength * item.bank.gate, 0) / bankWeight : 0;
      const coreBoost = 1 + .10 * envelope * envelope;
      const d = Math.min(1, solidCore * presence * gateWeight * coreBoost) * coverage;
      // True occlusion alpha: the photographic night sky, its stars and the
      // Milky Way stay visible through open sky, dense bank interiors turn
      // opaque and rims feather out. Never a flat translucent veil. The core
      // ramp leans solid so bodies read chunky rather than misty.
      const bodyOpacity = Math.min(1, presence * solidCore * (.9 + .6 * weather.thickness) * gateWeight * coreBoost);
      const vaporOpacity = (1 - vaporUnion) * .12;
      const opacity = (bodyOpacity + vaporOpacity * (1 - bodyOpacity)) * coverage;
      // Internal shading stays alive where the mask saturates: the bank ramp
      // never flattens the visible texture into a clean geometric silhouette.
      const shadeSource = .45 * fine + .55 * detail + .3 * billow + .2 * wisps +
        (.38 * micro + .24 * mist) * presence;
      const shade = Math.min(.99, .3 + .7 * shadeSource / (this.width >= 320 ? 1.7 : 1.5));
      // Light ceiling accounted for second-pass slope lighting; keeps lit tops
      // inside the reference tonal range without touching the dark cores. The
      // ceiling and ramp follow saturation: subdued Home stays calm, rich Dream
      // reaches the reference exposure.
      const richness = Math.max(0, Math.min(1, (weather.saturation - .35) / .65));
      const lightCeiling = .73 + .09 * richness;
      const light = Math.min(lightCeiling, (.8 + .15 * richness) * (.18 + .82 * d) * shade +
        Math.max(0, Math.min(1, (d - crestStart) / crestSpan)) ** 2 * shade *
          (.12 + .3 * Math.min(1, weather.colorSpread / 1.3)));
      // Vertical bank gradient mixes toward violet over the top, warm below.
      const gradMix = presence * Math.min(1, bankWeight) * (.42 + .28 * Math.min(1, weather.colorSpread));
      const gradT = bankWeight > 0 ? Math.max(0, Math.min(1, .5 + bankDepth / bankWeight * 2.4)) : .5;
      const hue = (noise(u * 2.2 + 40, v * 2 + 70) * weather.colorSpread + weather.palette) % 7;
      const col = palette[Math.floor(hue)]!, next = palette[(Math.floor(hue) + 1) % 7]!;
      const mix = ease(hue % 1);
      const bankCol = [0, 1, 2].map(channel => bankTopColor[channel]! + (bankBottomColor[channel]! - bankTopColor[channel]!) * gradT);
      const gx = u * 8, gy = v * 4, ix = Math.floor(gx), iy = Math.floor(gy);
      const tx = gx - ix, ty = gy - iy;
      const bodyCol = [0, 1, 2].map(channel => {
        const paletteCol = col[channel]! + (next[channel]! - col[channel]!) * mix;
        const atmospheric = paletteCol + (bankCol[channel]! - paletteCol) * gradMix;
        const tint = colorGrid ? (() => {
          const sample = (x: number, y: number) => colorGrid[Math.min(4, y) * 9 + Math.min(8, x)]![channel]!;
          const top = sample(ix, iy) * (1 - tx) + sample(ix + 1, iy) * tx;
          const bottom = sample(ix, iy + 1) * (1 - tx) + sample(ix + 1, iy + 1) * tx;
          return top * (1 - ty) + bottom * ty;
        })() : backgroundColor?.[channel];
        // User feedback 2026-11-04: clouds must follow the active background
        // palette, so the sampled sky tint carries most of the body color.
        return tint !== undefined ? atmospheric * .12 + tint * .88 : atmospheric;
      });
      const index = y * this.width + x;
      this.density[index] = Math.min(1, d * weather.thickness);
      this.relief[index] = mass;
      for (let channel = 0; channel < 3; channel++) {
        this.pixels[index * 4 + channel] = baseColor[channel]! + light * (42 + (bodyCol[channel]! - 42) * weather.saturation);
      }
      this.pixels[index * 4 + 3] = Math.max(0, Math.min(255, Math.round(opacity * 255)));
    }
    // Directional self-shadowing across the density field sculpts billows;
    // local lightning uses that same density, never a separate glowing blob.
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      const index = y * this.width + x, d = this.density[index]!;
      const near = this.relief[Math.max(0, y - nearY) * this.width + Math.min(this.width - 1, x + nearX)]!;
      const far = this.relief[Math.max(0, y - farY) * this.width + Math.min(this.width - 1, x + farX)]!;
      const slope = this.relief[index]! - near;
      const shadow = Math.max(0, far - this.relief[index]!) * weather.thickness;
      const lighting = Math.max(.28, Math.min(1.15, .72 + slope * 7 - shadow * 2.3));
      let flashR = 0, flashG = 0, flashB = 0;
      for (const source of flashes) {
        const dx = (x / this.width - source.x) * 1.7778, dy = y / this.height - source.y;
        const distance = (dx * dx + dy * dy) / (source.radius * source.radius);
        if (distance < 1) {
          const light = source.strength * (1 - distance) ** 2 * Math.max(0, d - .1) * (.45 + Math.max(0, slope) * 2);
          const color = source.color ?? flashColor;
          flashR += light * color[0]!; flashG += light * color[1]!; flashB += light * color[2]!;
        }
      }
      // The galactic band itself is no longer rastered: the real Milky Way
      // photograph lives behind this layer and shows through wherever the
      // banks leave open sky.
      for (let ch = 0; ch < 3; ch++) {
        const base = baseColor[ch]!;
        const body = base + (this.pixels[index * 4 + ch]! - base) * lighting;
        this.pixels[index * 4 + ch] = Math.min(70, body + Math.min(34, ch === 0 ? flashR : ch === 1 ? flashG : flashB));
      }
    }
  }
  findCloud(seed: number) {
    let best = { x: .5, y: .5, density: 0 };
    for (let i = 0; i < 72; i++) {
      const x = .1 + (((seed * .137 + i * .618) % 1 + 1) % 1) * .8;
      const y = .1 + (((seed * .313 + i * .427) % 1 + 1) % 1) * .8;
      const density = this.opacityAt(x, y);
      if (density > best.density) best = { x, y, density };
    }
    return best;
  }
  opacityAt(x: number, y: number) {
    const ix = Math.max(0, Math.min(this.width - 1, Math.floor(x * this.width)));
    const iy = Math.max(0, Math.min(this.height - 1, Math.floor(y * this.height)));
    return this.density[iy * this.width + ix]!;
  }
}
