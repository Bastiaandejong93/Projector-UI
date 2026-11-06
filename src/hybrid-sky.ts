import { extraStars } from './star-field';
import { createCloudClearing, advanceCloudClearing, type CloudClearing } from './cloud-clearing';
import { createClimate, climateAt } from './hybrid-climate';
import { createBankTrack, advanceBankTrack } from './cloud-bank-trajectory';
import { advanceHybridHeading, advanceHybridWind, hybridVerticalOffset, HYBRID_HEADING_LIMIT, HYBRID_WIND_MAX, HYBRID_WIND_MIN, INITIAL_HYBRID_WIND } from './hybrid-wind';
import { hybridVertex, hybridFragment, hybridMicroFragment, hybridMilkyFragment, hybridGasFragment, hybridFloorFragment, hybridStrongerGasFragment, hybridSkyMicroFragment, hybridLivingFragment } from './hybrid-shaders';
import { MICRO_GLOW_DURATION, microGlowEnvelope, nextMicroGlowDelay } from './hybrid-micro-event';
import { milkyPreviewAt } from './hybrid-milky-trial';
import { sampleSkyMicro, type SkyMicroKind } from './sky-micro-trial';
import { advanceLivingSchedule, createLivingSchedule } from './living-sky-schedule';
import { transformCloudAnchor, type CloudTransform } from './cloud-variant';
import { lightningPulse, thunderDuration, thunderExposure, thunderWaitMs, hybridThunderWaitMs } from './sky-weather';

const ASSET_ROOT = '/assets/clouds/hybrid/';
const ASSETS = ['volume-atlas.png', 'far.png', 'near.png', 'small1.png', 'small2.png', 'sky.png', 'bankBlue.png', 'bankGreen.png', 'bankTop.png', 'bankTop2.png'] as const;
const UNIFORMS = ['atlas', 'farBank', 'nearBank', 'smallBank1', 'smallBank2', 'starField', 'farIncoming', 'nearIncoming'] as const;
// Representative bright regions of the cleaned cloud masses, in texture
// coordinates. The shader still clips the glow to the actual bright pixels.
const ORIGINAL_ANCHORS = [[.3854, .7407], [.8542, .2222], [.5833, .2222], [.3125, .4815], [.1979, .8519], [.875, .6667]] as const;
const VARIANTS: ReadonlyArray<{ asset: number; anchor: number; transform: CloudTransform }> = [
  { asset: 1, anchor: 0, transform: 'mirror' },
  { asset: 2, anchor: 1, transform: 'mirror' },
  { asset: 9, anchor: 5, transform: 'rotate180' },
];
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
  ...ORIGINAL_ANCHORS, ...VARIANTS.map(v => transformCloudAnchor(ORIGINAL_ANCHORS[v.anchor]!, v.transform)),
];
// Upper and lower banks use separate bags to preserve broad cloud cover.
const FAR_BANKS = [0, 4, 5, 6] as const, NEAR_BANKS = [1, 2, 3, 7, 8] as const;
const fract = (value: number) => ((value % 1) + 1) % 1;

type Options = { thunderTest: boolean; timeScale?: number; microCloud?: boolean; microCloudTest?: boolean; milkyTrial?: boolean; milkyPreviewSpeed?: number; gasTrial?: boolean; floorTrial?: boolean; strongerGasTrial?: boolean; livingTrial?: boolean; cinematicTrial?: boolean; orbitalTrial?: boolean; livingFast?: boolean; previewLivingPhase?: number; skyMicroTrial?: SkyMicroKind; onReady: () => void; onFailure: (error: unknown) => void };
type Discharge = { start: number; duration: number; seed: number; bank: number };

/** Experimental renderer. Its fixed background and cloud volumes share a
 * single opaque surface; the caller keeps the previous renderer underneath
 * until this renderer has produced its first complete frame. */
export class HybridSky {
  private readonly canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private geometry: WebGLBuffer | null = null;
  private frame = 0;
  private stopped = false;
  private ready = false;
  private lastFrame = 0;
  private lastTime = 0;
  private elapsed = 0;
  private simulatedElapsed = 0;
  private canLivingMilky = false;
  private readonly living;
  private wind = 0;
  private cloudClearing: CloudClearing | null = null;
  private speed = INITIAL_HYBRID_WIND;
  private targetSpeed = INITIAL_HYBRID_WIND;
  private readonly windScratch = { speed: 0, movement: 0 };
  private heading = 0;
  private targetHeading = 0;
  private verticalTravel = 0;
  private nextRetarget = 180_000;
  private nextThunder: number;
  private discharge: Discharge | null = null;
  private nextMicroGlow: number;
  private microGlow: { start: number; bank: number } | null = null;
  private readonly farTrack = createBankTrack(0, 1);
  private readonly nearTrack = createBankTrack(0, 1);
  private readonly textures: WebGLTexture[] = [];
  private readonly bankTextures: WebGLTexture[] = [];
  private readonly climate = createClimate(Math.random);
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  constructor(private readonly scene: HTMLElement, private readonly options: Options) {
    this.living = options.livingTrial ? createLivingSchedule(Math.random, options.livingFast, options.cinematicTrial, false) : null;
    this.nextThunder = options.thunderTest ? 4000 : thunderWaitMs(Math.random(), true);
    this.nextMicroGlow = options.microCloudTest ? 4000 : nextMicroGlowDelay(Math.random());
    this.canvas.width = 640; this.canvas.height = 360;
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;visibility:hidden;opacity:0;transition:opacity 1400ms ease';
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.fail(new Error('Hybrid sky WebGL context lost'));
    });
  }

  async start() {
    try {
      const gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
      if (!gl) throw new Error('Hybrid sky WebGL unavailable');
      this.gl = gl;
      const units = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      this.canLivingMilky = !!this.options.livingTrial && units >= 9;
      // Debug-only preview: jump to a chosen phase only when the sky texture
      // is supported, so eight-unit devices never clear to an empty sky.
      if (this.living && this.canLivingMilky && this.options.previewLivingPhase !== undefined) this.living.milkyStart = -this.options.previewLivingPhase;
      if (this.options.milkyTrial && units < 9) throw new Error('Milky Way preview requires nine fragment texture units');
      const paths = ASSETS.map(name => `${ASSET_ROOT}${name}`);
      if (this.options.milkyTrial || this.canLivingMilky) paths.push('/assets/backgrounds/luna-milky-way-v1.png');
      const images = await Promise.all(paths.map(async path => {
        const image = new Image(); image.decoding = 'async'; image.src = path;
        await image.decode(); return image;
      }));
      if (this.stopped) return;
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Cannot create hybrid shader');
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Hybrid shader compile failed');
        return shader;
      };
      const program = gl.createProgram(); if (!program) throw new Error('Cannot create hybrid program');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, hybridVertex));
      const fragment = this.options.livingTrial ? hybridLivingFragment(this.canLivingMilky, !!this.options.cinematicTrial, !!this.options.orbitalTrial) : this.options.milkyTrial ? hybridMilkyFragment
        : this.options.skyMicroTrial ? hybridSkyMicroFragment(this.options.skyMicroTrial)
          : this.options.strongerGasTrial ? hybridStrongerGasFragment : this.options.floorTrial ? hybridFloorFragment : this.options.gasTrial ? hybridGasFragment : this.options.microCloud ? hybridMicroFragment : hybridFragment;
      // Slow subpixel motion can expose mediump coordinate quantization on TV
      // GPUs. Prefer high precision where available; retain WebGL1 fallback.
      const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      const fragmentSource = precision && precision.precision > 0
        ? fragment.replace('precision mediump float;', 'precision highp float;') : fragment;
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Hybrid shader link failed');
      for (const shader of gl.getAttachedShaders(program) ?? []) gl.deleteShader(shader);
      gl.useProgram(program); this.program = program;
      const buffer = gl.createBuffer(); if (!buffer) throw new Error('Cannot create hybrid geometry');
      this.geometry = buffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (let i = 0; i < images.length; i++) {
        // Extra banks are cached on separate GPU textures; the optional Milky
        // Way preview uses a ninth sampler only in its dedicated QA shader.
        gl.activeTexture(gl.TEXTURE0 + (i === 10 ? 8 : Math.min(i, 7))); const texture = gl.createTexture(); if (!texture) throw new Error('Cannot allocate hybrid texture');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        this.textures.push(texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, i !== 0);
        let source: TexImageSource = images[i]!;
        if (i === 5) {
          // Add stable points once to the existing sky texture: no extra
          // shader pass, texture unit, animation or per-frame random work.
          const starCanvas = document.createElement('canvas');
          starCanvas.width = images[i]!.naturalWidth; starCanvas.height = images[i]!.naturalHeight;
          const ctx = starCanvas.getContext('2d'); if (!ctx) throw new Error('Cannot prepare star field');
          ctx.drawImage(images[i]!, 0, 0);
          for (const star of extraStars(starCanvas.width, starCanvas.height)) {
            ctx.fillStyle = `rgba(160,182,216,${star.alpha})`;
            ctx.fillRect(star.x, star.y, 1, 1);
          }
          source = starCanvas;
        }
        if (i === 10) {
          const band = document.createElement('canvas'); band.width = 640; band.height = 360;
          const ctx = band.getContext('2d'); if (!ctx) throw new Error('Cannot prepare Milky Way');
          ctx.filter = this.options.orbitalTrial ? 'blur(.5px)' : this.options.cinematicTrial ? 'blur(.75px)' : 'blur(2px)'; ctx.drawImage(images[i]!, 0, 0, band.width, band.height);
          source = band;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        if (i < UNIFORMS.length) gl.uniform1i(gl.getUniformLocation(program, UNIFORMS[i]!), i);
        if (i === 10) gl.uniform1i(gl.getUniformLocation(program, 'milkyField'), 8);
      }
      this.bankTextures.push(this.textures[1]!, this.textures[2]!, this.textures[6]!, this.textures[7]!, this.textures[8]!, this.textures[9]!);
      for (const variant of VARIANTS) {
        const source = images[variant.asset]!, canvas = document.createElement('canvas');
        canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Cannot prepare cloud variant');
        ctx.translate(canvas.width, variant.transform === 'rotate180' ? canvas.height : 0);
        ctx.scale(-1, variant.transform === 'rotate180' ? -1 : 1);
        ctx.drawImage(source, 0, 0);
        const texture = gl.createTexture(); if (!texture) throw new Error('Cannot allocate cloud variant');
        this.textures.push(texture); this.bankTextures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + 7); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      }
      this.bindBanks();
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      for (const key of ['drift', 'flow', 'verticalDrift', 'coverage', 'mood', 'flash', 'flashCenter']) this.locations.set(key, gl.getUniformLocation(program, key));
      if (this.options.microCloud) this.locations.set('microGlow', gl.getUniformLocation(program, 'microGlow'));
      if (this.options.milkyTrial) this.locations.set('milkyReveal', gl.getUniformLocation(program, 'milkyReveal'));
      if (this.options.skyMicroTrial) this.locations.set('skyEvent', gl.getUniformLocation(program, 'skyEvent'));
      if (this.options.livingTrial) {
        for (const key of ['skyEvent', 'eventKind', 'eventDirection']) this.locations.set(key, gl.getUniformLocation(program, key));
        if (this.canLivingMilky) for (const key of ['milkyReveal', 'milkyDirection']) this.locations.set(key, gl.getUniformLocation(program, key));
        if (this.options.cinematicTrial) {
          for (const key of ['cloudRetreat', 'cloudTravel', 'skyMatch', 'clearanceMode', 'clearDistance', 'refillDistance', 'milkyRise']) this.locations.set(key, gl.getUniformLocation(program, key));
          if (this.canLivingMilky) this.locations.set(this.options.orbitalTrial ? 'skyRotationBlend' : 'milkyOffset', gl.getUniformLocation(program, this.options.orbitalTrial ? 'skyRotationBlend' : 'milkyOffset'));
        }
      }
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Hybrid sky texture setup failed');
      this.scene.append(this.canvas);
      this.resume();
    } catch (error) { this.fail(error); }
  }

  resume() {
    if (this.stopped || this.frame || !this.gl || document.hidden) return;
    this.lastFrame = 0; this.lastTime = 0;
    this.frame = requestAnimationFrame(this.paint);
  }

  pause() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0; this.lastTime = 0;
    if (this.ready) {
      // The compositor may discard a WebGL surface while backgrounded. Reveal
      // the retained 2D frame underneath until a new complete frame is drawn.
      this.canvas.style.visibility = 'hidden'; this.canvas.style.opacity = '0'; this.ready = false;
    }
  }

  stop() {
    this.stopped = true; this.pause(); this.canvas.remove();
    if (this.gl) {
      for (const texture of this.textures) this.gl.deleteTexture(texture);
      if (this.geometry) this.gl.deleteBuffer(this.geometry);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.textures.length = 0; this.bankTextures.length = 0; this.geometry = null;
    this.gl = null; this.program = null;
  }

  private fail(error: unknown) {
    if (this.stopped) return;
    this.stop(); this.options.onFailure(error);
  }

  private bindBanks() {
    const gl = this.gl!;
    const banks = this.bankTextures;
    for (const [unit, bank] of [[1, FAR_BANKS[this.farTrack.current]!], [6, FAR_BANKS[this.farTrack.incoming]!],
      [2, NEAR_BANKS[this.nearTrack.current]!], [7, NEAR_BANKS[this.nearTrack.incoming]!]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, banks[bank]!);
    }
  }

  private readonly paint = (time: number) => {
    this.frame = 0;
    if (this.stopped || !this.gl || !this.program || document.hidden) return;
    if (time - this.lastFrame + .01 < 1000 / 30) { this.frame = requestAnimationFrame(this.paint); return; }
    const dt = this.lastTime ? Math.min(250, Math.max(0, time - this.lastTime)) : 0;
    this.lastTime = time; this.lastFrame = time - ((time - this.lastFrame + .01) % (1000 / 30)) + .01;
    try {
      this.elapsed += dt;
      const simulationDt = dt * Math.max(1, Math.min(60, this.options.timeScale ?? 1));
      this.simulatedElapsed += simulationDt;
      if (this.simulatedElapsed >= this.nextRetarget) {
        this.targetSpeed = HYBRID_WIND_MIN + Math.random() * (HYBRID_WIND_MAX - HYBRID_WIND_MIN);
        this.targetHeading = (Math.random() * 2 - 1) * HYBRID_HEADING_LIMIT;
        this.nextRetarget = this.simulatedElapsed + 120_000 + Math.random() * 180_000;
      }
      // Wind has inertia; local density evolves separately at smaller scales.
      const windStep = advanceHybridWind(this.speed, this.targetSpeed, simulationDt, this.windScratch);
      this.speed = windStep.speed;
      const movement = windStep.movement * (this.options.strongerGasTrial ? 1.21 : this.options.floorTrial ? 1.1 : 1);
      const oldHeading = this.heading;
      this.heading = advanceHybridHeading(this.heading, this.targetHeading, simulationDt);
      this.verticalTravel = Math.max(-.06, Math.min(.06,
        this.verticalTravel + movement * Math.sin((oldHeading + this.heading) / 2)));
      const vertical = hybridVerticalOffset(this.verticalTravel);
      this.wind += movement;
      const oldFar = this.farTrack.current, oldNear = this.nearTrack.current;
      advanceBankTrack(this.farTrack, movement * .35, FAR_BANKS.length, Math.random);
      advanceBankTrack(this.nearTrack, movement * .45, NEAR_BANKS.length, Math.random);
      if (oldFar !== this.farTrack.current || oldNear !== this.nearTrack.current) this.bindBanks();
      const mood = climateAt(this.climate, this.simulatedElapsed, Math.random);
      // Advance an existing clearing before selecting an event so rare
      // events have time to finish while the Milky Way is still visible.
      const existingClearing = this.cloudClearing ? advanceCloudClearing(this.cloudClearing, this.wind, this.elapsed, this.options.livingFast) : null;
      const living = this.living ? advanceLivingSchedule(this.living, this.elapsed, Math.random, !!this.discharge, this.canLivingMilky, this.cloudClearing?.done ?? false, existingClearing?.rareWindowMs ?? 0) : null;
      if (living?.cinematic && !this.cloudClearing) this.cloudClearing = createCloudClearing(this.wind);
      if (!living?.cinematic) this.cloudClearing = null;
      const clearing = this.cloudClearing ? existingClearing ?? advanceCloudClearing(this.cloudClearing, this.wind, this.elapsed, this.options.livingFast) : null;
      if (!this.options.skyMicroTrial && !living?.sky && !this.discharge && !this.microGlow && this.elapsed >= this.nextThunder && (mood.storm >= .12 || this.options.thunderTest)) {
        const seed = this.options.thunderTest ? 12.45 : Math.random() * 100;
        const currentBank = FAR_BANKS[this.farTrack.current]!, incomingBank = FAR_BANKS[this.farTrack.incoming]!;
        const currentX = ANCHORS[currentBank]![0] + this.farTrack.offset;
        const incomingX = ANCHORS[incomingBank]![0] + this.farTrack.offset - 1;
        const bank = currentX > .04 && currentX < .96 ? currentBank
          : incomingX > .04 && incomingX < .96 ? incomingBank : -1;
        if (bank >= 0) this.discharge = { start: this.elapsed, duration: thunderDuration(seed), seed, bank };
        else this.nextThunder = this.elapsed + 5000;
      }
      let flash = 0;
      if (this.discharge) {
        const progress = (this.elapsed - this.discharge.start) / this.discharge.duration;
        if (progress >= 1) {
          this.discharge = null;
          this.nextThunder = this.elapsed + (this.options.thunderTest ? 4000 : hybridThunderWaitMs(Math.random()));
        } else flash = thunderExposure(lightningPulse(progress, this.discharge.seed, 0), 1);
      }
      const gl = this.gl, w = this.wind;
      gl.uniform4f(this.locations.get('drift')!, this.farTrack.offset, this.nearTrack.offset, fract(w*.50), fract(w*.58));
      gl.uniform4f(this.locations.get('flow')!, fract(w*.18*.7), fract(.19+w*.20), fract(w*.24*.83), fract(.51+w*.27));
      gl.uniform1f(this.locations.get('verticalDrift')!, vertical);
      const preview = this.options.milkyTrial ? milkyPreviewAt(this.elapsed * (this.options.milkyPreviewSpeed ?? 1)) : null;
      const sequence = living?.cinematic;
      const reveal = clearing?.reveal ?? sequence?.galaxy ?? living?.milky?.reveal ?? 0;
      gl.uniform1f(this.locations.get('coverage')!, living?.milky ? mood.coverage + (.08 - mood.coverage) * reveal : preview?.coverage ?? mood.coverage);
      if (preview) gl.uniform1f(this.locations.get('milkyReveal')!, preview.reveal);
      if (living) {
        const sky = living.sky;
        const kind = sky ? ({ twinkle: 1, meteor: 2, satellite: 3, ufo: 4, aircraft: 5, comet: 6, firefly: 7, probe: 8, meteor_shower: 9, satellite_pair: 10 } as const)[sky.kind] : 0;
        gl.uniform1i(this.locations.get('eventKind')!, kind);
        gl.uniform1f(this.locations.get('eventDirection')!, sky?.direction ?? 1);
        gl.uniform4f(this.locations.get('skyEvent')!, sky?.x ?? 0, sky?.y ?? 0, sky?.intensity ?? 0, sky?.phase ?? 0);
        if (this.options.cinematicTrial) {
          gl.uniform1f(this.locations.get('cloudRetreat')!, sequence?.cloudRetreat ?? 0);
          gl.uniform1f(this.locations.get('cloudTravel')!, sequence?.cloudTravel ?? 0);
          gl.uniform1f(this.locations.get('skyMatch')!, sequence?.skyMatch ?? 0);
          gl.uniform1f(this.locations.get('clearanceMode')!, clearing?.mode ?? 0);
          gl.uniform1f(this.locations.get('clearDistance')!, clearing?.moved ?? 0);
          gl.uniform1f(this.locations.get('refillDistance')!, clearing?.refill ?? 0);
          gl.uniform1f(this.locations.get('milkyRise')!, clearing?.rise ?? 0);
        }
        if (this.canLivingMilky) {
          // In the orbital trial this is the inverse of the visible sky
          // rotation; it keeps moving forward while the band exits.
          const angle = this.options.orbitalTrial ? 0 : -.16 * (1 - reveal);
          gl.uniform1f(this.locations.get('milkyReveal')!, reveal);
          gl.uniform2f(this.locations.get('milkyDirection')!, Math.cos(angle), Math.sin(angle));
          if (this.options.orbitalTrial) gl.uniform1f(this.locations.get('skyRotationBlend')!, living.orbital?.blend ?? 0);
          else if (this.options.cinematicTrial) gl.uniform2f(this.locations.get('milkyOffset')!, .08 * Math.sin(reveal * Math.PI), .32 * (1 - reveal));
        }
      }
      if (this.options.skyMicroTrial) {
        const event = sampleSkyMicro(this.options.skyMicroTrial, this.elapsed);
        gl.uniform4f(this.locations.get('skyEvent')!, event.x, event.y, event.intensity, event.phase);
      }
      gl.uniform3f(this.locations.get('mood')!, mood.red, mood.green, mood.blue);
      gl.uniform1f(this.locations.get('flash')!, flash);
      const currentBank = FAR_BANKS[this.farTrack.current]!, incomingBank = FAR_BANKS[this.farTrack.incoming]!;
      if (this.options.microCloud) {
        if (this.microGlow && this.elapsed - this.microGlow.start >= MICRO_GLOW_DURATION) {
          this.microGlow = null;
          this.nextMicroGlow = this.elapsed + nextMicroGlowDelay(Math.random());
        }
        if (!this.microGlow && !this.discharge && this.elapsed >= this.nextMicroGlow && mood.coverage > .5) {
          const x = ANCHORS[currentBank]![0] + this.farTrack.offset;
          const incomingX = ANCHORS[incomingBank]![0] + this.farTrack.offset - 1;
          const bank = x > .15 && x < .85 ? currentBank : incomingX > .15 && incomingX < .85 ? incomingBank : -1;
          if (bank >= 0) this.microGlow = { start: this.elapsed, bank };
          else this.nextMicroGlow = this.elapsed + 5000;
        }
        const event = this.microGlow;
        const eventOnScreen = event && (event.bank === currentBank || event.bank === incomingBank);
        const eventAnchor = ANCHORS[event?.bank ?? currentBank]!;
        const eventOffset = event?.bank === currentBank ? this.farTrack.offset : this.farTrack.offset - 1;
        gl.uniform3f(this.locations.get('microGlow')!, eventAnchor[0] + eventOffset,
          eventAnchor[1] + vertical * .75,
          eventOnScreen && !this.discharge ? microGlowEnvelope(this.elapsed - event!.start) : 0);
      }
      const flashBank = this.discharge?.bank ?? currentBank;
      const anchor = ANCHORS[flashBank]!;
      if (flashBank !== currentBank && flashBank !== incomingBank) {
        gl.uniform1f(this.locations.get('flash')!, 0);
      }
      const bankOffset = flashBank === currentBank ? this.farTrack.offset : this.farTrack.offset - 1;
      gl.uniform2f(this.locations.get('flashCenter')!, anchor[0] + bankOffset, anchor[1] + vertical * .75);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!this.ready) {
        if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) throw new Error('Hybrid sky first frame failed');
        this.ready = true; this.canvas.style.visibility = 'visible'; this.options.onReady();
        // The previous complete frame stays underneath while the newly drawn
        // opaque surface fades in; this avoids a sudden startup plate swap.
        requestAnimationFrame(() => { if (!this.stopped) this.canvas.style.opacity = '1'; });
      }
      this.frame = requestAnimationFrame(this.paint);
    } catch (error) { this.fail(error); }
  };
}
