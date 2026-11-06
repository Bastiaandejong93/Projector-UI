// Photo-based cloud layer.
//
// Four dense cloud masses are extracted offline from the reference cloudscapes
// (tools/extract-cloud-sprites.mjs). At runtime exactly three are in the sky at
// once. They ride the prevailing wind at slightly different speeds, so they
// overtake each other, drift apart and merge; each also breathes and turns a
// fraction of a degree. There is no per-pixel cloud raster and no veil: open
// sky between the masses stays open for the stars and the Milky Way.

export type CloudFlash = {
  x: number;
  y: number;
  radius: number;
  strength: number;
  color?: readonly [number, number, number];
};

type CloudAsset = {
  image: HTMLImageElement;
  aspect: number;
  alpha: Uint8Array;
};

type CloudSprite = {
  asset: number;
  x: number;
  y: number;
  scale: number;
  speed: number;
  alpha: number;
  phase: number;
  turnPeriod: number;
};

const CLOUD_URLS = [
  '/assets/clouds/cloud-violet.png',
  '/assets/clouds/cloud-storm.png',
  '/assets/clouds/cloud-amber.png',
  '/assets/clouds/cloud-drift.png',
] as const;
const ATLAS = 64;
const FLASH_WIDTH = 256;
const FLASH_HEIGHT = 144;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap = (value: number, span: number) => ((value % span) + span) % span;

export class PhotoClouds {
  private readonly assets: Array<CloudAsset | null> = [null, null, null, null];
  private readonly clouds: CloudSprite[];
  private elapsed = 0;
  private viewportWidth = 1280;
  private viewportHeight = 720;
  private lastWindX: number | null = null;
  private scaleBoost = 1;
  private alphaBoost = 1;
  private flashCanvas: HTMLCanvasElement | null = null;

  constructor() {
    const order = [0, 1, 2, 3].sort(() => Math.random() - .5).slice(0, 3);
    const baseX = [.12, .55, .88], baseY = [.31, .21, .63], baseScale = [.42, .36, .45];
    this.clouds = order.map((asset, index) => ({
      asset,
      x: baseX[index]! + (Math.random() - .5) * .10,
      y: baseY[index]! + (Math.random() - .5) * .08,
      scale: baseScale[index]! + (Math.random() - .5) * .04,
      speed: [.86, 1.02, 1.2][index]! + (Math.random() - .5) * .05,
      alpha: .90 + Math.random() * .08,
      phase: Math.random() * Math.PI * 2,
      turnPeriod: 90 + Math.random() * 90,
    }));

    CLOUD_URLS.forEach((url, index) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        const atlasCanvas = document.createElement('canvas');
        atlasCanvas.width = ATLAS; atlasCanvas.height = ATLAS;
        const atlasContext = atlasCanvas.getContext('2d', { willReadFrequently: true })!;
        atlasContext.drawImage(image, 0, 0, ATLAS, ATLAS);
        const atlas = atlasContext.getImageData(0, 0, ATLAS, ATLAS).data;
        const alpha = new Uint8Array(ATLAS * ATLAS);
        for (let i = 0; i < alpha.length; i++) alpha[i] = atlas[i * 4 + 3]!;
        this.assets[index] = { image, aspect: image.naturalWidth / image.naturalHeight, alpha };
      };
      image.src = url;
    });
  }

  update(elapsedMs: number, amount: number, storm: number, windX: number) {
    const seconds = clamp(elapsedMs, 0, 250) / 1000;
    this.elapsed += seconds;
    this.scaleBoost = .94 + .10 * clamp(amount, 0, 1) + .03 * clamp(storm, 0, 1);
    this.alphaBoost = .82 + .18 * clamp(amount, 0, 1) + .05 * clamp(storm, 0, 1);
    if (this.lastWindX === null) this.lastWindX = windX;
    const delta = clamp(windX - this.lastWindX, -.002, .002);
    this.lastWindX = windX;
    for (const cloud of this.clouds) {
      cloud.x += delta * cloud.speed;
      // Fully gone off the right: recycle with a fresh asset and altitude while
      // the replacement enters from the left, so no cloud ever pops in frame.
      const edge = cloud.scale * .5;
      if (cloud.x - edge > 1.02) {
        cloud.asset = (cloud.asset + 1 + Math.floor(Math.random() * 3)) % CLOUD_URLS.length;
        cloud.x = -edge - .08;
        cloud.y = .20 + Math.random() * .52;
        cloud.scale = .34 + Math.random() * .12;
        cloud.speed = .80 + Math.random() * .46;
        cloud.alpha = .88 + Math.random() * .10;
        cloud.phase = Math.random() * Math.PI * 2;
        cloud.turnPeriod = 90 + Math.random() * 90;
      }
    }
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number, alphaScale = 1) {
    this.paint(context, width, height, alphaScale, true);
  }

  private paint(context: CanvasRenderingContext2D, width: number, height: number, alphaScale: number, rememberViewport: boolean) {
    if (rememberViewport) {
      this.viewportWidth = width;
      this.viewportHeight = height;
    }
    context.imageSmoothingEnabled = true;
    for (const cloud of this.clouds) {
      const asset = this.assets[cloud.asset];
      if (!asset) continue;
      const breathe = 1 + .025 * Math.sin(this.elapsed * .045 + cloud.phase);
      const drawWidth = width * cloud.scale * this.scaleBoost * breathe;
      const drawHeight = drawWidth / asset.aspect;
      if (cloud.x + drawWidth / width / 2 < 0 || cloud.x - drawWidth / width / 2 > 1) continue;
      const turn = .011 * Math.sin(this.elapsed * Math.PI * 2 / cloud.turnPeriod + cloud.phase * 1.9);
      const alpha = clamp(cloud.alpha * this.alphaBoost * alphaScale, 0, 1);
      if (alpha <= .005) continue;
      context.save();
      context.translate(cloud.x * width, cloud.y * height);
      context.rotate(turn);
      context.globalAlpha = alpha;
      context.drawImage(asset.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      context.restore();
    }
  }

  /** 0..1 cloud opacity at a viewport fraction, sampled from the last draw. */
  coverageAt(x: number, y: number) {
    let best = 0;
    for (const cloud of this.clouds) {
      const asset = this.assets[cloud.asset];
      if (!asset) continue;
      const breathe = 1 + .025 * Math.sin(this.elapsed * .045 + cloud.phase);
      const drawWidth = this.viewportWidth * cloud.scale * this.scaleBoost * breathe;
      const drawHeight = drawWidth / asset.aspect;
      const left = cloud.x * this.viewportWidth - drawWidth / 2;
      const top = cloud.y * this.viewportHeight - drawHeight / 2;
      const u = (x * this.viewportWidth - left) / drawWidth;
      const v = (y * this.viewportHeight - top) / drawHeight;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const sample = asset.alpha[Math.min(ATLAS - 1, Math.floor(v * ATLAS)) * ATLAS + Math.min(ATLAS - 1, Math.floor(u * ATLAS))]! / 255;
      best = Math.max(best, sample * cloud.alpha);
    }
    return best;
  }

  /** A dense point inside one visible cloud, for cloud-local lightning. */
  findCloud(seed: number) {
    const hash = (value: number) => wrap(Math.sin(seed * 127.1 + value * 311.7) * 43758.5453, 1);
    let best = { x: .5, y: .4, density: 0 };
    for (const cloud of this.clouds) {
      for (let i = 0; i < 4; i++) {
        const x = cloud.x + (hash(i + 1) - .5) * cloud.scale * .60;
        const y = cloud.y + (hash(i + 5) - .5) * cloud.scale * .55;
        if (x < .03 || x > .97 || y < .03 || y > .97) continue;
        const density = this.coverageAt(x, y);
        if (density > best.density) best = { x, y, density };
      }
    }
    return best;
  }

  /** Lightning only exists where the clouds are; the same composited masses
   * mask a small glow. Cheap low-res offscreen, a few frames per discharge. */
  renderFlashes(context: CanvasRenderingContext2D, flashes: readonly CloudFlash[], width: number, height: number, alphaScale = 1) {
    if (!flashes.length) return;
    if (!this.flashCanvas) {
      this.flashCanvas = document.createElement('canvas');
      this.flashCanvas.width = FLASH_WIDTH;
      this.flashCanvas.height = FLASH_HEIGHT;
    }
    const flashContext = this.flashCanvas.getContext('2d')!;
    flashContext.clearRect(0, 0, FLASH_WIDTH, FLASH_HEIGHT);
    flashContext.globalCompositeOperation = 'source-over';
    flashContext.globalAlpha = 1;
    for (const flash of flashes) {
      const x = flash.x * FLASH_WIDTH, y = flash.y * FLASH_HEIGHT;
      const radius = Math.max(8, flash.radius * FLASH_HEIGHT * 2.2);
      const color = flash.color ?? [68, 58, 44];
      const strength = clamp(flash.strength, 0, 1);
      const glow = flashContext.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${.85 * strength})`);
      glow.addColorStop(.45, `rgba(${color[0]},${color[1]},${color[2]},${.38 * strength})`);
      glow.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
      flashContext.fillStyle = glow;
      flashContext.fillRect(0, 0, FLASH_WIDTH, FLASH_HEIGHT);
    }
    // Keep the glow only on the clouds, never in open sky.
    flashContext.globalCompositeOperation = 'destination-in';
    this.paint(flashContext, FLASH_WIDTH, FLASH_HEIGHT, alphaScale, false);
    flashContext.globalCompositeOperation = 'source-over';
    context.save();
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = .92;
    context.imageSmoothingEnabled = true;
    context.drawImage(this.flashCanvas, 0, 0, FLASH_WIDTH, FLASH_HEIGHT, 0, 0, width, height);
    context.restore();
  }
}
