/**
 * The mount, drawn with WebGL2: the sheet is made once, into a tile, and then every frame the
 * windows, the light and whatever the light has done are drawn over it.
 */

import paperFrag from './paper.frag?raw';
import grainFrag from './grain.frag?raw';
import mountFrag from './mount.frag?raw';
import type { Layout } from './layout.ts';
import { ALBEDO, AMBIENT, BACKING, CHAR, CORE, DUSK, EMBERS, FIRE, GLOW, HEAT, INK, KILN, PAPER, RUBBING, RULE, SCORCH, hex, encode, type Sun } from './light.ts';

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const flatOf = (h: string) => hex(h).map(encode) as [number, number, number];
const FLAT = [flatOf(PAPER), flatOf(RUBBING)];

const TILE = 1024; // CSS px: the sheet repeats every 1024 px, before the second reading hides it
const TEXELS = 2048;
const SLOPE = 0.3;

export type Frame = {
  /** The middle of the view on the sheet, on the device pixel grid, and how far back the eye is: 1 at rest. */
  camera: { x: number; y: number; k: number };
  /** How far each folding plate is turned back from flat: 0 flat, π folded behind the page. */
  fold: [number, number];
  /** How far the shadow of what gathers the day has lifted, once the day is open: 0 to 1. */
  open: number;
  /** How far the last word is written: 0 not begun, 1 its last stroke, a little past as its last ember goes out. */
  write: number;
  /** Which of the lens's pictures is behind it, and how settled it is there. */
  strip: number;
  settled: number;
  sun: Sun;
  time: number;
  fade: number;
  /** Per window: laid, lifted, hover, reached by the keyboard. */
  states: number[][];
  /** 0 the plain sheet, 1 the rubbing. */
  rubbing: number;
  kindled: number;
  breath: number;
  disk: { r: number; intensity: number; preheat: number };
  burn: { r: number; glow: number; seed: number };
};

type Uniforms = Record<string, WebGLUniformLocation | null>;

export class Mount {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private u: Uniforms;
  private paper: WebGLTexture;
  private glyph: WebGLTexture;
  private pictures: WebGLTexture[];
  private carried = [0, 0, 0, 0, 0, 0];
  private layout: Layout | null = null;
  private dpr = 1;

  static create(canvas: HTMLCanvasElement): Mount | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'high-performance',
    });
    if (!gl) return null;
    try { return new Mount(gl); } catch (e) { console.error(e); return null; }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.paper = this.makePaper();
    this.glyph = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.glyph);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array([0, 1, 0, 1]));
    this.params(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE);
    this.pictures = [0, 1, 2, 3, 4, 5].map(() => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      this.params(gl.LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE);
      return t;
    });
    this.program = this.link(mountFrag);
    this.u = this.locate(this.program);
    this.constants();
  }

  /** The last word, as word.ts makes it: where it lies, blurred; when the brush comes; how much is fire. */
  setGlyph(mask: Float32Array, size: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.glyph);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.FLOAT, mask);
  }

  /**
   * Leaf `i`'s picture, to be drawn by the mount from now on (behind the lens, or on its plate as
   * it turns) instead of lying under it. Kept as it is displayed, encoded, as the mount multiplies
   * the others.
   */
  carry(i: number, picture: TexImageSource): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.pictures[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, picture);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.params(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, gl.CLAMP_TO_EDGE);
    this.carried[i] = 1;
    gl.useProgram(this.program);
    gl.uniform1fv(this.u.uCarried, this.carried);
  }

  resize(W: number, V: number, dpr: number): void {
    const c = this.gl.canvas as HTMLCanvasElement;
    const w = Math.round(W * dpr), h = Math.round(V * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.dpr = h / V;
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
    const { gl, u } = this;
    gl.useProgram(this.program);
    gl.uniform4fv(u.uWin, layout.cuts.flatMap((r) => [r.x, r.y, r.w, r.h]));
    gl.uniform1fv(u.uRound, layout.round.map(Number));
    gl.uniform3f(u.uShade, layout.shade.inner, layout.shade.outer, DUSK);
    gl.uniform2f(u.uFireSpan, ...layout.fire);
    gl.uniform2f(u.uFocus, layout.focus.x, layout.focus.y);
    const g = layout.glyph;
    gl.uniform4f(u.uGlyphRect, g.x, g.y, g.w, g.h);
    gl.uniform4fv(u.uFlap, layout.flaps.flatMap((r) => [r.x, r.y, r.w, r.h]));
    gl.uniform1f(u.uFocal, layout.focal);
  }

  draw(f: Frame): void {
    const L = this.layout;
    if (!L) return;
    const { gl, u } = this;
    const c = gl.canvas as HTMLCanvasElement;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, c.width, c.height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.paper);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.glyph);
    this.pictures.forEach((t, i) => { gl.activeTexture(gl.TEXTURE2 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(u.uView, L.W, L.V);
    gl.uniform1f(u.uDpr, this.dpr);
    gl.uniform3f(u.uCamera, f.camera.x, f.camera.y, f.camera.k);
    gl.uniform2f(u.uFold, ...f.fold);
    gl.uniform1f(u.uOpen, f.open);
    gl.uniform1f(u.uWrite, f.write);
    gl.uniform1f(u.uStrip, f.strip);
    gl.uniform1f(u.uSettled, f.settled);
    gl.uniform3f(u.uDay, ...f.sun.light);
    gl.uniform3f(u.uSunDir, ...f.sun.dir);
    gl.uniform1f(u.uSunKey, f.sun.key);
    gl.uniform1f(u.uTime, f.time);
    gl.uniform1f(u.uFade, f.fade);
    gl.uniform4fv(u.uState, f.states.flat());
    gl.uniform1f(u.uRubbing, f.rubbing);
    gl.uniform3f(u.uFlat, ...([0, 1, 2].map((i) => FLAT[0][i] + (FLAT[1][i] - FLAT[0][i]) * f.rubbing) as [number, number, number]));
    gl.uniform3f(u.uKiln, f.camera.x, f.camera.y + L.V * (0.5 + KILN.below), L.V * KILN.height);
    gl.uniform4f(u.uKilnLight, KILN.key * f.breath, KILN.fill, KILN.falloff, Math.hypot(L.V * KILN.below, L.V * KILN.height));
    gl.uniform1f(u.uKindled, f.kindled);
    gl.uniform4f(u.uDisk, f.disk.r, f.disk.intensity, f.disk.preheat, 0);
    gl.uniform4f(u.uBurn, f.burn.r, f.burn.glow, f.burn.seed, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private constants(): void {
    const { gl, u } = this;
    gl.useProgram(this.program);
    gl.uniform1i(u.uPaper, 0);
    gl.uniform1i(u.uGlyph, 1);
    [u.uLeaf0, u.uLeaf1, u.uLeaf2, u.uPlate0, u.uPlate1, u.uPlate2].forEach((l, i) => gl.uniform1i(l, 2 + i));
    gl.uniform1fv(u.uCarried, this.carried);
    gl.uniform1f(u.uTile, TILE);
    gl.uniform1f(u.uSlope, SLOPE);
    gl.uniform1f(u.uRelief, 0.34);
    gl.uniform1f(u.uBevel, 4);
    gl.uniform1f(u.uDepth, 4.2);
    gl.uniform1f(u.uGlyphDepth, 5.0);
    gl.uniform3f(u.uAlbedo, ...ALBEDO);
    gl.uniform3f(u.uInk, ...INK);
    gl.uniform3f(u.uRule, ...RULE);
    gl.uniform3f(u.uCore, ...CORE);
    gl.uniform3f(u.uBacking, ...BACKING);
    gl.uniform3f(u.uScorch, ...SCORCH);
    gl.uniform3f(u.uChar, ...CHAR);
    gl.uniform3f(u.uFire, ...FIRE);
    gl.uniform3f(u.uEmbers, ...EMBERS);
    gl.uniform3f(u.uAmbient, ...AMBIENT);
    gl.uniform3f(u.uGlow, ...GLOW);
    gl.uniform3f(u.uHeat, ...HEAT);
  }

  /** Make the sheet: its height and pulp, then from those its slopes, mipmapped. */
  private makePaper(): WebGLTexture {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const height = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, height);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, TEXELS, TEXELS);
    this.params(gl.NEAREST, gl.NEAREST, gl.REPEAT);
    const fbA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, height, 0);
    const paper = this.link(paperFrag);
    gl.useProgram(paper);
    gl.uniform1f(gl.getUniformLocation(paper, 'uSize'), TILE);
    gl.uniform1f(gl.getUniformLocation(paper, 'uRes'), TEXELS);
    gl.uniform1f(gl.getUniformLocation(paper, 'uSeed'), 1688);
    gl.viewport(0, 0, TEXELS, TEXELS);
    // In strips, so no one draw holds the GPU long.
    gl.enable(gl.SCISSOR_TEST);
    const STRIPS = 8;
    for (let i = 0; i < STRIPS; i++) {
      gl.scissor(0, (i * TEXELS) / STRIPS, TEXELS, TEXELS / STRIPS);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.flush();
    }
    gl.disable(gl.SCISSOR_TEST);

    const grain = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, grain);
    gl.texStorage2D(gl.TEXTURE_2D, Math.log2(TEXELS) + 1, gl.RGBA8, TEXELS, TEXELS);
    this.params(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR, gl.REPEAT);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    const fbB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, grain, 0);
    const slopes = this.link(grainFrag);
    gl.useProgram(slopes);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, height);
    gl.uniform1i(gl.getUniformLocation(slopes, 'uHeight'), 0);
    gl.uniform1f(gl.getUniformLocation(slopes, 'uSize'), TILE);
    gl.uniform1f(gl.getUniformLocation(slopes, 'uSlope'), SLOPE);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, grain);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbA); gl.deleteFramebuffer(fbB);
    gl.deleteTexture(height);
    gl.deleteProgram(paper); gl.deleteProgram(slopes);
    return grain;
  }

  private params(min: number, mag: number, wrap: number): void {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  private link(frag: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'program');
    return p;
  }

  private locate(p: WebGLProgram): Uniforms {
    const gl = this.gl;
    const u: Uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i)!.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return new Proxy(u, { get: (t, k: string) => t[k] ?? null });
  }
}
