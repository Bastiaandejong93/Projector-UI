// Offscreen image-space deformation: the camera and the viewport edges stay
// fixed while several localized areas of the source photograph evolve.
// This is an artistic approximation, not a fluid simulation.
// Shader-precision note: the five per-field sine phases are computed in
// JavaScript modulo 2π and passed as bounded uniforms, so the fragment
// shader never evaluates sin() with an unbounded time accumulator. This
// avoids mediump argument-reduction drift after long runs.
export class BackgroundWarp {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private textures = new WeakMap<HTMLImageElement, WebGLTexture>();
  private windLocation: WebGLUniformLocation | null;
  private phaseLocations: (WebGLUniformLocation | null)[] = [];
  private restored = false;
  private readonly rates = [0.040, 0.028, 0.021];
  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, program: WebGLProgram) {
    this.canvas = canvas; this.gl = gl; this.program = program;
    this.windLocation = gl.getUniformLocation(program, 'u_wind');
    for (let i = 0; i < 3; i++) {
      this.phaseLocations[i] = gl.getUniformLocation(program, `u_phase${i}`);
    }
    canvas.addEventListener('webglcontextlost', event => event.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => { this.restored = true; });
  }
  static create() {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const gl = canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) return null;
    const shader = (type: number, source: string) => {
      const sh = gl.createShader(type); if (!sh) return null;
      gl.shaderSource(sh, source); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
      return sh;
    };
    const vs = shader(gl.VERTEX_SHADER, `attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv = a_pos * .5 + .5; gl_Position = vec4(a_pos,0.,1.); }`);
    const fs = shader(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 v_uv; uniform sampler2D u_image; uniform vec2 u_wind;
      uniform float u_phase0; uniform float u_phase1; uniform float u_phase2;
      vec2 field(vec2 uv, vec2 center, vec2 radius, float rate, float phase, float t) {
        vec2 d=(uv-center)/radius; float influence=exp(-dot(d,d)*1.8);
        vec2 sway=vec2(sin(t+phase)-sin(phase), .45*(sin(t*.78+u_wind.y*2.0+phase*1.4)-sin(phase*1.4)));
        vec2 churn=vec2(sin(d.y*4.0+t+phase)-sin(d.y*4.0+phase),
                        sin(d.x*4.0-t*.8+phase)-sin(d.x*4.0+phase));
        return influence*(sway*.045+churn*.019);
      }
      void main() {
        vec2 uv=v_uv;
        vec2 shift=field(uv,vec2(.23,.74),vec2(.37,.34),.040,.2, u_phase0)
                  +field(uv,vec2(.72,.70),vec2(.36,.30),.028,1.1, u_phase1)
                  +field(uv,vec2(.30,.28),vec2(.36,.32),.021,2.2, u_phase2);
        float border=smoothstep(0.0,.09,uv.x)*smoothstep(0.0,.09,1.0-uv.x)*smoothstep(0.0,.09,uv.y)*smoothstep(0.0,.09,1.0-uv.y);
        gl_FragColor=texture2D(u_image,clamp(uv+shift*border,0.0,1.0));
      }`);
    if (!vs || !fs) return null;
    const program=gl.createProgram(); if (!program) return null;
    gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    gl.uniform1i(gl.getUniformLocation(program,'u_image'),0);
    return new BackgroundWarp(canvas,gl,program);
  }
  needsRebuild() { return this.restored; }
  render(image: HTMLImageElement, windX: number, windY: number, time = 0) {
    const gl=this.gl; if (gl.isContextLost() || !image.naturalWidth) return null;
    let texture=this.textures.get(image);
    if (!texture) {
      const created=gl.createTexture(); if (!created) return null; texture=created;
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      this.textures.set(image,texture);
    }
    // Per-field phases are driven by elapsed time, not by the accumulated wind
    // coordinate, so slowing/reversing wind cannot stall or reverse the warp.
    // All uniforms stay bounded to avoid mediump argument-reduction drift.
    const twoPi = 2 * Math.PI;
    const wrappedWindX = ((windX % twoPi) + twoPi) % twoPi;
    const wrappedWindY = ((windY % twoPi) + twoPi) % twoPi;
    for (let i = 0; i < this.rates.length; i++) {
      const t = ((time * this.rates[i]!) % twoPi + twoPi) % twoPi;
      gl.uniform1f(this.phaseLocations[i]!, t);
    }
    gl.useProgram(this.program);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform2f(this.windLocation, wrappedWindX, wrappedWindY);
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    return this.canvas;
  }
}
