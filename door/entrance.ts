/**
 * The entrance: the kiln's eye. index.html puts its veil up over the door before the door is
 * painted, once a session; this draws on it. The fire in the eye comes up and burns while the door
 * opens underneath. Once the first picture is laid in, or the door has kept it waiting too long,
 * the view goes up to the eye and through it, into the fire, and the door comes up out of the glare
 * as an exposure does, its darks first. Any input hurries it to its end.
 *
 * In development, ?t=1.4 holds it at 1.4 s, and ?slow=4 plays it at a quarter the pace.
 */

import kilnFrag from './kiln.frag?raw';
import { PAPER, RUBBING } from './light.ts';

type RGB = [number, number, number];

const HURRY = 0.35;   // s: what is left of it, once the reader does anything
const PATIENCE = 3.5; // s from the page's start: the longest it waits for the door
const DEPTH = 1.2;    // the tube through the wall, as in kiln.frag

const T = {
  gate: 1.2,          // the eye burns at least this long, and until the door is ready
  white: 1.8,         // the glare starts to take the view here…
  through: 2.15,      // …by now the view is in the fire…
  end: 3.25,          // …and the door has come up out of it here
};
const GLARE = 7;      // stops over, at the height of the glare
const WARM: RGB = [1, 0.93, 0.82]; // the glare's colour, as the stops each channel is over

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const span = (t: number, a: number, b: number) => Math.min(Math.max((t - a) / (b - a), 0), 1);

/** Where everything is at `t`. */
function at(t: number, W: number, V: number) {
  const heat = 1 - (1 - span(t, 0.05, 0.9)) ** 3;
  // Drawn slowly toward the eye while it burns, then up to it and through, gathering pace.
  const u = span(t, T.gate, T.through);
  const near = 11 - 0.6 * ease(span(t, 0, T.gate));
  const z = near - (near + DEPTH + 1.4) * u ** 2.3;
  const off = 1 - ease(Math.min(u * 1.6, 1));
  return {
    heat,
    eye: [-0.6 * off, -0.7 * off, V > W ? z * 0.8 : z] as RGB,
    gain: GLARE * ease(span(t, T.white, T.through)),
    // Out of the glare: stops over, falling fast and then slowly, as eyes come back.
    over: GLARE * (1 - span(t, T.through, T.end)) ** 2.2,
  };
}

/** Draw the entrance on `veil`; `ready` tells when the door has opened under it. */
export async function enter(veil: HTMLElement, ready: () => boolean): Promise<void> {
  veil.style.animation = 'none'; // it is drawn now: the veil's own way out, in door.css, is not wanted
  const canvas = veil.querySelector('canvas')!;
  const tint = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const done = () => {
    veil.remove();
    if (tint) tint.content = document.documentElement.dataset.edition === 'rubbing' ? RUBBING : PAPER;
  };

  const params = new URLSearchParams(location.search);
  const held = import.meta.env.DEV && params.has('t') ? Number(params.get('t')) : null;
  const slow = import.meta.env.DEV ? Math.max(Number(params.get('slow')) || 1, 1) : 1;

  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) { done(); return; }
  const program = link(gl, kilnFrag);
  const u = locate(gl, program);
  gl.bindVertexArray(gl.createVertexArray());
  // The wall comes after the fire: until its textures are in, it is drawn bare.
  let wallSince: number | null = null;
  loadWall(gl).then(() => { wallSince = performance.now(); }).catch(() => {});

  let clock = held ?? 0, speed = 1;
  const hurry = () => { if (held === null) speed = Math.max(speed, (T.end - clock) / HURRY); };
  const quit = new AbortController();
  for (const type of ['wheel', 'keydown', 'pointerdown', 'touchstart']) addEventListener(type, hurry, { passive: true, signal: quit.signal });

  let last = performance.now(), first = true, glare = false;
  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (held === null && !first) {
      const waiting = clock >= T.gate && speed === 1 && !ready() && now / 1000 < PATIENCE;
      if (!waiting) clock += dt * (speed === 1 ? 1 / slow : speed);
    }
    first = false;

    const W = veil.clientWidth, V = veil.clientHeight;
    const s = at(Math.min(clock, T.end), W, V);

    if (clock < T.through) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const cw = Math.round(W * dpr), ch = Math.round(V * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
      gl.useProgram(program);
      gl.uniform2f(u('uView'), W, V);
      gl.uniform1f(u('uDpr'), ch / V);
      gl.uniform1f(u('uTime'), now / 1000);
      gl.uniform1f(u('uHeat'), s.heat);
      gl.uniform3f(u('uEye'), ...s.eye);
      gl.uniform1f(u('uGain'), s.gain);
      gl.uniform1i(u('uAlbedo'), 0);
      gl.uniform1i(u('uHeight'), 1);
      gl.uniform1f(u('uWall'), wallSince === null ? 0 : held !== null ? 1 : ease((now - wallSince) / 600));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      // In the glare, the veil stops covering the door and brightens it instead: the door, over
      // by so many stops, as color-dodge gives it, and clipped where it goes past white.
      if (!glare) {
        glare = true;
        canvas.style.display = 'none';
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        veil.style.mixBlendMode = 'color-dodge';
        if (tint) tint.content = document.documentElement.dataset.edition === 'rubbing' ? RUBBING : PAPER;
      }
      const v = WARM.map((w) => 1 - 2 ** -(s.over * w));
      veil.style.background = `color(srgb ${v.map((x) => x.toFixed(4)).join(' ')})`;
    }

    if (held === null && clock >= T.end) {
      quit.abort();
      done();
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** The wall's colour and relief, into texture units 0 and 1, fetched after everything the door needs. */
async function loadWall(gl: WebGL2RenderingContext): Promise<void> {
  const image = async (name: string) => createImageBitmap(
    await (await fetch(`/door/wall/${name}.webp`, { priority: 'low' } as RequestInit)).blob(),
    { colorSpaceConversion: 'none', premultiplyAlpha: 'none' },
  );
  const [albedo, height] = await Promise.all([image('albedo'), image('height')]);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const maps: [ImageBitmap, number, number][] = [[albedo, gl.SRGB8_ALPHA8, gl.RGBA], [height, gl.R8, gl.RED]];
  maps.forEach(([bitmap, internal, format], unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, gl.UNSIGNED_BYTE, bitmap);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    bitmap.close();
  });
}

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function link(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
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

/** The program's uniforms, by name. */
function locate(gl: WebGL2RenderingContext, p: WebGLProgram): (name: string) => WebGLUniformLocation | null {
  const found = new Map<string, WebGLUniformLocation | null>();
  return (name) => {
    if (!found.has(name)) found.set(name, gl.getUniformLocation(p, name));
    return found.get(name)!;
  };
}
