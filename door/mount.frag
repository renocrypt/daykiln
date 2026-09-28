#version 300 es
// The mount: one sheet of paper with its windows cut in it, and the light on it.
//
// Everything is placed on the sheet, CSS pixels from its top left, y down. The canvas is multiplied
// onto the pictures lying behind it, so in a window this draws only the light the picture lies in,
// and the shadow the window's edge casts on it; the pictures it carries itself (uCarried) it draws.
//
// Mostly the sheet lies flat before the eye, and a pixel is a point of it. But Plates II and III are
// folding plates, leaves tipped in and folded back behind the page, that are unfolded to be seen,
// and the eye draws back to watch: then each pixel is a ray, from an eye set back before the sheet,
// to whichever face it meets first, the page, a leaf turning on its fold, or the board beyond.
precision highp float;
out vec4 outColor;

uniform vec2 uView;     // CSS px
uniform float uDpr;
uniform vec3 uCamera;   // the middle of the view on the sheet, on the device pixel grid; and how far back the eye is, 1 at rest
uniform float uFocal;   // how far the eye is from the sheet at rest, CSS px
uniform vec2 uFold;     // how far each folding plate is turned back from flat: 0 flat, π folded behind
uniform vec4 uFlap[2];  // the folding plates, as they lie unfolded: the first hinged on its left edge, the second on its top
uniform float uTime;
uniform float uFade;    // 0: the flat paper the page showed before this drew
uniform vec3 uFlat;     // that paper, encoded

// The sheet.
uniform sampler2D uPaper; // slope x, slope y, height, pulp
uniform float uTile;      // CSS px
uniform float uSlope;     // the scale the slopes were stored at
uniform float uRelief;
uniform vec3 uAlbedo, uCore, uBacking, uScorch, uChar;
uniform vec3 uInk, uRule;
uniform float uRubbing;   // 0 the plain sheet; 1 the sheet taken as a rubbing, inked on what stands up

// The windows.
uniform vec4 uWin[6];    // x, y, w, h
uniform float uRound[6]; // 1 where the window is round: the circle filling its (square) rect
// The kiln's eye is a lens, and Yaobian's three pictures lie behind it on one strip; the plates lie
// in their windows. Once they have come (uCarried) they are drawn here, through the glass or on the
// leaves as they turn, instead of lying under the mount.
uniform sampler2D uLeaf0, uLeaf1, uLeaf2, uPlate0, uPlate1, uPlate2;
uniform float uCarried[6];
uniform float uStrip;   // which picture lies behind the lens: 0 KILN, 1 RULE, 2 PLUMB, and between
uniform float uSettled; // 1 while the strip is at rest
uniform vec4 uState[6];  // laid, lifted, hover, reached by the keyboard
uniform float uBevel, uDepth;

// Daylight, and the shadow of what gathers it.
uniform vec3 uDay;
uniform vec3 uSunDir;    // toward the light, normalized
uniform float uSunKey;
uniform vec3 uShade;     // full within x of the focus, none beyond y; z, the sky left in it
uniform float uOpen;     // how far that shadow has lifted, once the day is open

// The fire, and where it dies away.
uniform vec3 uFire, uEmbers, uAmbient;
uniform vec3 uKiln;      // x, y in the document, height above the sheet
uniform vec4 uKilnLight; // key, fill, falloff, distance to the foot of the view
uniform vec2 uFireSpan;  // the fire is full above x, and gone below y
uniform float uKindled;  // the fire is burning, 0 to 1, and breathes

// The focus: gathered daylight, then what it did to the sheet.
uniform vec2 uFocus;
uniform vec4 uDisk;      // radius, intensity, preheat
uniform vec4 uBurn;      // radius, glow, seed
uniform vec3 uGlow, uHeat; // what a burning edge gives off, dull and at its hottest

// The impression at the foot of the album.
uniform sampler2D uGlyph;  // the last word (word.ts): where it lies, blurred; when the brush comes; how much is fire
uniform vec4 uGlyphRect;
uniform float uGlyphDepth;
uniform float uWrite;      // how far it is written: 0 not begun, 1 whole

const float TAU = 6.2831853;
const mat2 TURN = mat2(0.7986355, 0.6018150, -0.6018150, 0.7986355); // 37°

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}

// How much light a surface with this slope takes from a light, relative to a flat one.
float lambert(vec2 grad, vec3 L, float zMin) {
  vec3 n = normalize(vec3(-grad, 1.0));
  return max(dot(n, L), 0.0) / max(L.z, zMin);
}
// The same for the sun, relative to the page lying flat: a leaf turned from it takes less, down to none.
float sunOn(vec2 grad, vec3 sun) {
  return max(dot(normalize(vec3(-grad, 1.0)), sun), 0.0) / max(uSunDir.z, 0.05);
}

// Light falling on the picture past the window's edge: 1 where it reaches, 0 in the edge's shadow.
// `s` is how far the picture's point is from the edge's foot, toward the light.
float reached(vec2 p, vec4 r, float circle, vec3 L, float depth) {
  vec2 dir = L.xy / max(length(L.xy), 1e-4);
  float s;
  if (circle > 0.5) {
    vec2 o = p - (r.xy + 0.5 * r.zw);
    float R = 0.5 * min(r.z, r.w) + uBevel, b = dot(o, dir);
    s = -b + sqrt(max(b * b - dot(o, o) + R * R, 0.0));
  } else {
    vec2 lo = r.xy - uBevel, hi = r.xy + r.zw + uBevel;
    vec2 t = vec2(1e6);
    if (dir.x > 1e-4) t.x = (hi.x - p.x) / dir.x; else if (dir.x < -1e-4) t.x = (lo.x - p.x) / dir.x;
    if (dir.y > 1e-4) t.y = (hi.y - p.y) / dir.y; else if (dir.y < -1e-4) t.y = (lo.y - p.y) / dir.y;
    s = min(t.x, t.y);
  }
  float reach = depth * length(L.xy) / max(L.z, 1e-3);
  float soft = 0.45 + 0.22 * reach;
  return smoothstep(reach - soft, reach + soft, s);
}

// The kiln's eye. Behind it the three pictures lie side by side on a strip, each a square as wide
// as the lens, with the board showing between them; the strip is slid along behind the glass. The
// glass is convex: it magnifies the middle a little and gathers the picture's edge into its rim,
// and, being one glass, bends red and blue each its own way, the more the further out, so whatever
// crosses it moving is fringed red and blue, and its straight edges bow. Brought to rest (or
// attended to, by the pointer or the keyboard) it is corrected as an achromat is: red and blue come
// together, and only the faint green and purple of the secondary spectrum is left. Pictures are
// sampled as they are displayed, encoded, as the mount multiplies the others.
vec3 encode(vec3 v);
const float LEAF_BIAS = -0.6; // the picture has little more than a texel to a pixel: keep to its sharper level
const float PITCH = 2.16;     // from one picture's middle to the next, in lens radii
const float LENS_MIDDLE = 0.9;  // how much of the picture the middle of the lens takes in, per unit: a 1.11× magnifier
const float LENS_BULGE = 1.0;   // how far the glass's face leans at the rim: its normal is (u·bulge, 1)

vec3 leafAt(int k, vec2 uv, float lod) {
  if (k == 0) return textureLod(uLeaf0, uv, lod).rgb;
  if (k == 1) return textureLod(uLeaf1, uv, lod).rgb;
  return textureLod(uLeaf2, uv, lod).rgb;
}

// What lies behind the lens at `at`, in lens radii from its middle: a picture of the strip, or the
// board between two. `px` is a device pixel there, for the pictures' edges.
vec3 stripAt(vec2 at, float lod, float px) {
  float x = at.x + uStrip * PITCH;
  float k = clamp(floor(x / PITCH + 0.5), 0.0, 2.0);
  vec2 local = vec2(x - k * PITCH, at.y);
  int i = int(k);
  float inside = smoothstep(1.0 + px, 1.0 - px, max(abs(local.x), abs(local.y))) * step(0.5, uCarried[i]);
  vec3 board = encode(uBacking);
  if (inside <= 0.0) return board;
  return mix(board, leafAt(i, 0.5 + 0.5 * clamp(local, -1.0, 1.0), lod), inside);
}

vec3 throughLens(vec2 u, float corrected, float lod, float px) {
  float r = length(u);
  // Out to the circle's edge, which the rim reaches: the last of the picture is gathered into it,
  // where the glass is steepest.
  float e = smoothstep(0.8, 1.0, r);
  vec2 at = u * (LENS_MIDDLE + (0.94 - LENS_MIDDLE) * r * r * r + 0.06 * e * e);
  float lateral = mix(0.022, 0.0, corrected) * r * r;         // red wide, blue narrow
  float secondary = mix(0.0, 0.0035, corrected) * r * r;      // green apart from red and blue together
  vec3 c = vec3(stripAt(at * (1.0 + lateral + secondary), lod, px).r,
                stripAt(at * (1.0 - secondary), lod, px).g,
                stripAt(at * (1.0 - lateral + secondary), lod, px).b);
  return c * (1.0 - 0.25 * pow(r, 4.0));                      // and it passes less at the rim
}

// What a lens's face gives back of a light: its image in the convex glass, the reflected share rising
// toward the grazing rim (Schlick, for glass). The polished face gives a small, sharp image of the
// light, brightest in its middle, and a faint sheen round it.
float glint(vec3 n, vec3 L) {
  float h = max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - n.z, 5.0);
  return fresnel * (18.0 * pow(h, 3000.0) + 0.04 * pow(h, 120.0));
}

// The mount's tone curve, as in light.ts: a shoulder into white, laid on the brightest channel so
// a bright fire keeps its colour; only what is far past white is bleached by it, as the eye bleaches.
vec3 shoulder(vec3 v) {
  return mix(v, 0.85 + 0.15 * (1.0 - exp(-(v - 0.85) / 0.15)), step(0.85, v));
}
vec3 tone(vec3 v) {
  float m = max(max(v.r, v.g), v.b);
  if (m <= 0.85) return v;
  return mix(v * shoulder(vec3(m)).r / m, shoulder(v), smoothstep(1.0, 3.0, m));
}
vec3 encode(vec3 v) {
  v = clamp(v, 0.0, 1.0);
  return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v));
}

// How deep the last word is pressed at a point of its texture: as far as the brush has come, and not
// where it is fire, which is burnt in instead.
float impressed(vec4 c) {
  return c.r * (1.0 - c.b) * smoothstep(-0.006, 0.006, uWrite - c.g);
}

// The folding plates. The page is the sheet's own column, from its left edge to the first plate's
// hinge, as long as the album; a plate lies in the page's plane once it is unfolded flat.
const float PI = 3.1415927;
const float PLATE_ASPECT = 1.6; // the plates' own shape
const float SUN_WIDTH = 0.0093; // the sun's breadth, in radians: how soft a shadow's edge is per px it falls

float rectSd(vec2 c, vec4 r) {
  vec2 q = abs(c - (r.xy + 0.5 * r.zw)) - 0.5 * r.zw;
  return max(q.x, q.y);
}
// How far a point of the sheet's plane lies outside whatever of the sheet is flat in it: negative inside.
float flatSd(vec2 c) {
  float d = max(-c.x, c.x - uFlap[0].x);
  if (uFold.x < 1e-4) d = min(d, rectSd(c, uFlap[0]));
  if (uFold.x < 1e-4 && uFold.y < 1e-4) d = min(d, rectSd(c, uFlap[1]));
  return d;
}

vec3 plateAt(int k, vec2 uv, float lod) {
  if (k == 0) return textureLod(uPlate0, uv, lod).rgb;
  if (k == 1) return textureLod(uPlate1, uv, lod).rgb;
  return textureLod(uPlate2, uv, lod).rgb;
}

// Beyond the album: the board it lies before, a long way back, in the day, with the album's shadow.
vec3 board(vec3 eye, vec3 ray) {
  float back = 1.6 * uFocal;
  vec3 b = eye + ray * ((eye.z + back) / -ray.z);
  float tau = back / max(uSunDir.z, 0.05);
  float pen = 1.0 + SUN_WIDTH * tau;
  float lit = smoothstep(-pen, pen, flatSd(b.xy + uSunDir.xy * tau));
  vec3 light = uDay * (uSunKey * uSunDir.z * lit + (1.0 - uSunKey) * 0.75) + uAmbient;
  return uBacking * light * (0.94 + 0.12 * noise(b.xy / 150.0));
}

void main() {
  vec2 view = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  vec3 dither = vec3(hash(gl_FragCoord.xy) + hash(gl_FragCoord.yx + 17.0) - 1.0) / 255.0;
  vec2 fromMiddle = view - 0.5 * uView;

  // Where this pixel meets the album, and in what frame: the sun as the face it meets has it, how
  // many px of the sheet a px of the view spans there, and how much of the sun's key the album
  // itself leaves it. Flat and at rest, a pixel is simply a point of the sheet.
  vec2 p = uCamera.xy + fromMiddle;
  vec3 sun = uSunDir;
  float spans = 1.0;
  float sunlit = 1.0;
  // Where the face met is an edge of the sheet, over the board: how much of the pixel it covers.
  float cover = 1.0;
  vec3 behind = vec3(0.0);
  if (max(abs(uCamera.z - 1.0), max(uFold.x, uFold.y)) > 1e-4) {
    vec3 eye = vec3(uCamera.xy, uFocal * uCamera.z);
    vec3 ray = normalize(vec3(fromMiddle, -uFocal));
    float best = eye.z / -ray.z;
    vec3 h = eye + best * ray;
    float edge = flatSd(h.xy);
    int face = edge < 0.0 ? 0 : -1; // 0 the sheet's plane, 1 or 2 a plate turning, -1 nothing
    if (face < 0) best = 1e9;
    vec3 X = vec3(1.0, 0.0, 0.0), Y = vec3(0.0, 1.0, 0.0), N = vec3(0.0, 0.0, 1.0);
    vec2 at = h.xy;
    // The first plate turns on its left edge; the second, once the first is open, on its top.
    for (int k = 0; k < 2; k++) {
      float a = k == 0 ? uFold.x : uFold.y;
      if (a < 1e-4 || a > PI - 1e-4 || (k == 1 && uFold.x > 1e-4)) continue;
      vec4 f = uFlap[k];
      vec3 T = k == 0 ? vec3(cos(a), 0.0, -sin(a)) : vec3(0.0, cos(a), -sin(a));
      vec3 Nk = k == 0 ? vec3(sin(a), 0.0, cos(a)) : vec3(0.0, sin(a), cos(a));
      vec3 hinge = vec3(f.xy, 0.0);
      float dn = dot(ray, Nk);
      if (abs(dn) < 1e-5) continue;
      float t = dot(hinge - eye, Nk) / dn;
      vec3 hk = eye + t * ray;
      float s = dot(hk - hinge, T);
      vec2 on = k == 0 ? vec2(f.x + s, hk.y) : vec2(hk.x, f.y + s);
      // Its edges, but for the fold it turns on, which is never seen against the board.
      vec2 q = abs(on - (f.xy + 0.5 * f.zw)) - 0.5 * f.zw;
      float sd = k == 0 ? max(q.y, on.x - f.x - f.z) : max(q.x, on.y - f.y - f.w);
      if (t > 0.0 && t < best && s >= 0.0 && sd < 0.0) {
        best = t; face = k + 1; at = on; h = hk; N = Nk; edge = sd;
        X = k == 0 ? T : vec3(1.0, 0.0, 0.0);
        Y = k == 0 ? vec3(0.0, 1.0, 0.0) : T;
      }
    }
    behind = encode(tone(board(eye, ray)));
    if (face < 0) {
      outColor = vec4(mix(uFlat, behind + dither, uFade), 1.0);
      return;
    }
    p = at;
    sun = vec3(dot(uSunDir, X), dot(uSunDir, Y), dot(uSunDir, N));
    spans = min(best * ray.z * ray.z / (uFocal * max(abs(dot(ray, N)), 0.05)), 12.0);
    cover = clamp(0.5 - edge * uDpr / spans, 0.0, 1.0);
    // What lies behind the page is shaded by it where the page stands between it and the sun.
    if (h.z < -0.5) {
      float tau = -h.z / max(uSunDir.z, 0.05);
      float pen = 1.0 + SUN_WIDTH * tau;
      sunlit = smoothstep(-pen, pen, flatSd(h.xy + uSunDir.xy * tau));
    }
    // A plate seen from behind: the sheet's back, unprinted and never rubbed, lit as it faces.
    if (dot(ray, N) > 0.0) {
      vec4 a = textureLod(uPaper, p / uTile, log2(max(float(textureSize(uPaper, 0).x) / uTile * spans / uDpr, 1e-3)));
      vec2 g = (a.rg - 0.5) * 0.5 / uSlope * uRelief;
      vec3 turned = vec3(-sun.x, sun.y, -sun.z);
      vec3 light = uDay * (uSunKey * sunlit * sunOn(g, turned) + (1.0 - uSunKey) * 0.8) + uAmbient;
      vec3 backColour = uAlbedo * 0.92 * (1.0 + (a.a - 0.5) * 0.2) * light;
      outColor = vec4(mix(uFlat, mix(behind, encode(tone(backColour)), cover) + dither, uFade), 1.0);
      return;
    }
  }
  float key = uSunKey * sunlit;
  float aa = 0.5 / uDpr * spans;

  // The sheet, read twice, the second turned and larger, so its repeat is never seen. Its detail is
  // taken for how much of the sheet a pixel spans, worked out rather than left to the pixel's
  // neighbours, which at an edge of the sheet may lie on the board.
  float grain = log2(max(float(textureSize(uPaper, 0).x) / uTile * spans / uDpr, 1e-3));
  vec4 a = textureLod(uPaper, p / uTile, grain);
  vec4 b = textureLod(uPaper, TURN * p / (uTile * 1.37) + vec2(0.31, 0.77), grain - log2(1.37));
  vec2 grad = ((a.rg - 0.5) + transpose(TURN) * (b.rg - 0.5) / 1.37) * 0.5 / uSlope * 0.72;
  float height = (a.b + b.b) * 0.5;
  float pulp = 1.0 + (a.a + b.a - 1.0) * 1.2;

  // The laid and chain lines of the screen it was made on, a little out of true.
  float wander = 0.9 * sin(p.x / 173.0 + p.y / 911.0) + 0.5 * sin(p.x / 61.0 - 1.7);
  float laid = TAU * (p.y + wander) / 5.12;
  grad.y -= sin(laid) * TAU / 5.12 * 0.022;
  float chainX = mod(p.x + 3.0 * sin(p.y / 397.0), 1024.0 / 12.0) - 42.0;
  float chain = exp(-chainX * chainX / 2.2);
  grad.x -= chainX / 1.1 * chain * 0.05;
  pulp *= 1.0 - chain * 0.008;

  // The last word, written into the sheet as the reader comes to it, stroke by stroke as the brush
  // writes it. 日 and 召 are pressed blind, with walls, and a floor smoother than paper. The four dots
  // of 灬, fire, are burnt in, each along its stroke: an ember where the burning has got to, char
  // behind it, and the paper scorched round.
  float pressed = 0.0, scorched = 0.0, charred = 0.0;
  vec3 wordGlow = vec3(0.0);
  vec2 gu = (p - uGlyphRect.xy) / uGlyphRect.zw;
  if (uWrite > 0.0 && all(greaterThan(gu, vec2(-0.02))) && all(lessThan(gu, vec2(1.02)))) {
    vec2 e = 1.0 / vec2(textureSize(uGlyph, 0));
    vec4 c = textureLod(uGlyph, gu, 0.0);
    pressed = impressed(c);
    vec2 dg = vec2(impressed(textureLod(uGlyph, gu + vec2(e.x, 0.0), 0.0)) - impressed(textureLod(uGlyph, gu - vec2(e.x, 0.0), 0.0)),
                   impressed(textureLod(uGlyph, gu + vec2(0.0, e.y), 0.0)) - impressed(textureLod(uGlyph, gu - vec2(0.0, e.y), 0.0)))
              / (2.0 * e * uGlyphRect.zw);
    grad = grad * (1.0 - 0.6 * pressed) - dg * uGlyphDepth;
    pulp *= 1.0 - 0.035 * pressed;
    float age = uWrite - c.g; // how long since the burning reached here, in the word's own time
    float since = max(age, 0.0);
    float caught = c.b * smoothstep(-0.002, 0.003, age);
    scorched = caught * smoothstep(0.04, 0.5, c.r);
    charred = caught * smoothstep(0.7, 0.98, c.r) * 0.75;
    float flicker = 0.7 + 0.6 * noise(p * 0.45 + vec2(uTime * 1.3, -uTime * 0.9));
    float ember = c.b * smoothstep(0.25, 0.6, c.r) * step(0.0, age) * exp(-since / 0.012) * flicker;
    wordGlow = mix(uGlow, uHeat, exp(-since / 0.004)) * ember * 1.4;
  }
  grad *= uRelief;

  // Where a folding plate lies unfolded its fold is still in the paper: a crease, a little sunk, lit
  // on the side it faces the sun from.
  for (int k = 0; k < 2; k++) {
    vec4 f = uFlap[k];
    float open = k == 0 ? step(uFold.x, 1e-4) : step(max(uFold.x, uFold.y), 1e-4);
    float d = k == 0 ? p.x - f.x : p.y - f.y;
    vec2 span = k == 0 ? vec2(p.y - f.y, f.y + f.w - p.y) : vec2(p.x - f.x, f.x + f.z - p.x);
    float g = 0.28 * d / 1.44 * exp(-d * d / 2.88) * open * step(0.0, min(span.x, span.y));
    if (k == 0) grad.x += g; else grad.y += g;
  }

  // The nearest window: Chebyshev distance to its edge, so the bevel meets itself in a mitre; or,
  // where the window is round, the distance to its circle.
  float dist = 1e9; vec2 q = vec2(0.0); int w = 0;
  for (int i = 0; i < 6; i++) {
    vec4 r = uWin[i];
    vec2 qi = abs(p - (r.xy + 0.5 * r.zw)) - 0.5 * r.zw;
    float di = uRound[i] > 0.5 ? length(p - (r.xy + 0.5 * r.zw)) - 0.5 * min(r.z, r.w) : max(qi.x, qi.y);
    if (di < dist) { dist = di; q = qi; w = i; }
  }
  vec4 win = uWin[w];
  float circle = uRound[w];
  vec4 state = uState[w];
  vec2 side = sign(p - (win.xy + 0.5 * win.zw));
  float opening = smoothstep(aa, -aa, dist);
  float face = smoothstep(uBevel - aa, uBevel + aa, dist);
  float bevel = 1.0 - opening - face;

  // The lights at this point. The shadow is round below the focus and runs straight up above it.
  vec2 fromFocus = p - uFocus;
  float fd = length(fromFocus);
  float lit = smoothstep(uShade.x, uShade.y, length(vec2(fromFocus.x, max(fromFocus.y, 0.0))));
  float sky = uShade.z * smoothstep(uFireSpan.x, uFocus.y, p.y);
  float day = mix(sky + (1.0 - sky) * lit, 1.0, uOpen);
  float fire = (1.0 - smoothstep(uFireSpan.x, uFireSpan.y, p.y)) * uKindled;
  vec3 toKiln = vec3(uKiln.xy - p, uKiln.z);
  float kd = length(toKiln);
  vec3 Lk = toKiln / kd;
  float kiln = uKilnLight.x * pow(uKilnLight.w / kd, uKilnLight.z);
  vec3 fill = uEmbers * fire * uKilnLight.y + uAmbient;

  // The sheet's face.
  vec3 onFace = uDay * day * (key * sunOn(grad, sun) + 1.0 - uSunKey)
              + uFire * fire * kiln * lambert(grad, Lk, 0.3)
              + fill * (1.0 - 0.25 * pressed);
  vec3 albedo = uAlbedo * pulp;

  // The rubbing: the sheet inked with a pad, as a stone is. The pad lays ink on what stands up and
  // cannot reach what is sunk, the pores between the fibres, the lines of the screen, a character
  // pressed into the sheet: those stay paper. As the rubbing is taken, the ink goes down from the
  // tops. It dries with a lustre, which gives back the lights as they are, uncoloured by the ink.
  float rubbed = 0.0;
  vec3 lustre = vec3(0.0);
  if (uRubbing > 0.0) {
    float around = 0.5 * (textureLod(uPaper, p / uTile, 4.0).b + textureLod(uPaper, TURN * p / (uTile * 1.37) + vec2(0.31, 0.77), 4.0).b);
    float stands = height - around + 0.008 * cos(laid) + 0.006 * chain - 0.25 * pressed - 0.3 * scorched; // what is burnt in is sunk, too
    float reach = mix(0.08, -0.065, uRubbing);
    rubbed = smoothstep(reach - 0.012, reach + 0.006, stands);
    albedo = mix(albedo, uInk * (0.9 + 0.2 * noise(p / 90.0 + 3.7)), rubbed);
    vec3 n = normalize(vec3(-grad, 1.0));
    float gloss = pow(max(dot(n, normalize(sun + vec3(0.0, 0.0, 1.0))), 0.0), 14.0);
    float glossK = pow(max(dot(n, normalize(Lk + vec3(0.0, 0.0, 1.0))), 0.0), 14.0);
    lustre = 0.05 * rubbed * (uDay * day * key * gloss + uFire * fire * kiln * glossK);
  }

  // Reached by the keyboard, a leaf is ruled round, as a mount's window is: in ink on the plain
  // sheet; cut, and so left paper, in the rubbing.
  float ruled = state.w * smoothstep(0.5 + aa, 0.5 - aa, abs(dist - 13.5));
  albedo = mix(albedo, mix(uRule, uAlbedo * pulp, uRubbing), ruled);
  rubbed *= 1.0 - ruled;

  // The gathered daylight, in the middle of the shadow: a disk that narrows to a point as the point
  // comes to the middle of the view. Its edge is as soft as the sun is wide, and softer the further
  // it is from focus. A round mirror sends more to the rim of the disk than to its middle, and a
  // hand-polished one is not true, so the disk is mottled; both shrink with it. A little of the
  // light is scattered past the rim, and a little runs on inside the paper.
  float r = uDisk.x;
  float edge = 1.2 + 0.05 * r;
  float disk = smoothstep(r + edge, r - edge, fd);
  float u = fd / r;
  float caustic = 1.0 + 0.4 * exp(-pow((u - 0.91) / 0.07, 2.0)) * smoothstep(10.0, 40.0, r);
  vec2 m = fromFocus / r;
  float mottle = 1.0 + 0.2 * (noise(m * 2.3 + 7.1) - 0.5) + 0.1 * (noise(m * 5.3 + 1.9) - 0.5);
  float outside = max(fd - r, 0.0);
  float skirt = (0.045 * exp(-outside / (4.0 + 0.4 * r)) + 0.18 * exp(-outside / 1.6)) * (1.0 - disk);
  const vec3 MIRROR = vec3(0.29, 0.4, 0.87); // held low and to the right, in front of the sheet
  float gathered = disk * caustic * mottle;
  onFace += uDay * uDisk.y * (gathered * lambert(grad, MIRROR, 0.0) + skirt);
  if (rubbed > 0.0) {
    float gloss = pow(max(dot(normalize(vec3(-grad, 1.0)), normalize(MIRROR + vec3(0.0, 0.0, 1.0))), 0.0), 14.0);
    lustre += 0.05 * rubbed * uDay * uDisk.y * gathered * gloss;
  }

  // Before it catches, the paper under the point yellows; that does not go back.
  albedo *= mix(vec3(1.0), vec3(0.93, 0.8, 0.6), uDisk.z * exp(-fd * fd / 380.0));

  // The burn: a hole, its charred lip, the line where it is burning, and the scorch ahead of it. The
  // sheet does not burn evenly: how far the burn has to go to reach a point is its distance, stretched
  // by the lie of the fibres, so the line finds its own way. It is a string of embers, each a fibre
  // that glows and goes out on its own, hottest where it has just caught and dull red behind; they
  // light the paper around them while they last.
  vec3 glow = vec3(0.0);
  float hole = 0.0;
  if (uBurn.x > 0.0) {
    float s = uBurn.z;
    // Lobes as large as the burn, meanders of some tens of px, and the fibres' own few px.
    float near = min(fd, 40.0);
    float ragged = fd * 0.2 * (noise(normalize(fromFocus + 1e-4) * 1.4 + s * 9.0) - 0.5)
                 + min(fd, 400.0) * 0.12 * (noise(fromFocus / 60.0 + s * 3.0) - 0.5)
                 + near * (0.2 * (noise(fromFocus / 7.0 + s * 17.0) - 0.5) + 0.1 * (noise(fromFocus / 2.6 + s * 5.0) - 0.5) + 0.25 * (height - 0.45));
    float b = fd + ragged - uBurn.x; // px ahead of the line; behind it, negative
    // The scorch ahead of the line, and the char behind it, are as wide as a sheet's are.
    float scorch = pow(1.0 - smoothstep(-1.0, min(0.8 * uBurn.x + 5.0, 24.0 + 0.1 * uBurn.x), b), 1.6);
    float charred = smoothstep(aa, -aa, b + 0.5);
    float ash = exp(-pow((b + 1.2) / 0.7, 2.0)) * (1.0 - uBurn.y);
    hole = smoothstep(aa, -aa, b + min(0.5 * uBurn.x, 5.0 + 0.012 * uBurn.x)) * step(3.0, uBurn.x);
    albedo = mix(albedo, uScorch * pulp, scorch * 0.9 * (1.0 - rubbed)); // the paper browns; the ink does not
    albedo = mix(albedo, uChar * (0.75 + 0.6 * height), charred);
    albedo = mix(albedo, vec3(0.2, 0.19, 0.18) * pulp, ash * 0.5);
    float lead = exp(-pow((b + 0.35) / 0.55, 2.0));
    float trail = 0.45 * exp(-pow((b + 1.5) / 1.0, 2.0));
    float n = 0.75 * noise(p * 0.55 + s * 31.0) + 0.25 * noise(p * 1.3 + vec2(uTime * 0.7, -uTime * 0.5));
    float fading = mix(0.75, 0.25, uBurn.y);
    float alive = smoothstep(fading, fading + 0.16, n);
    glow = mix(uGlow, uHeat, lead) * (1.3 * lead + trail) * alive * sqrt(uBurn.y) * 1.2;
    onFace += mix(uGlow, uHeat, 0.4) * 0.3 * uBurn.y * exp(-abs(b) / 3.5);
  }

  // Where the last word's fire has burnt: scorch round each dot, char in it, the ember at its end.
  albedo = mix(albedo, uScorch * pulp, scorched * 0.85 * (1.0 - rubbed));
  albedo = mix(albedo, uChar * (0.75 + 0.6 * height), charred);
  glow += wordGlow;

  vec3 faceColour = albedo * onFace + lustre * (1.0 - hole);
  faceColour = mix(faceColour, uBacking * (fill + uDay * day * 0.3), hole);

  // The bevel: the sheet's cut edge, sloping down to the picture, facing into the window; round
  // windows are cut as a cone, facing the middle.
  float mitre = smoothstep(-aa, aa, q.x - q.y);
  vec2 inward = circle > 0.5
    ? normalize(win.xy + 0.5 * win.zw - p + 1e-5)
    : normalize(mix(vec2(0.0, -side.y), vec2(-side.x, 0.0), mitre) + 1e-5);
  vec2 slope = -inward * (uDepth / uBevel);
  // Its fill is the sky and what the picture and the facing bevel send back.
  vec3 onBevel = uDay * day * (key * sunOn(slope, sun) + (1.0 - uSunKey) * 1.35)
               + uFire * fire * kiln * lambert(slope, Lk, 0.3)
               + fill * 0.85;
  vec3 bevelColour = uCore * onBevel;

  // The window: the light on the picture, less the edge's shadow; the backing where nothing lies.
  float depth = uDepth * (1.0 - 0.35 * state.z);
  float near = smoothstep(0.0, 7.0, -dist);
  float occluded = mix(0.7, 1.0, near);
  vec3 onPicture = uDay * day * (key * reached(p, win, circle, sun, depth) + (1.0 - uSunKey) * occluded)
                 + uFire * fire * kiln * reached(p, win, circle, Lk, depth)
                 + fill * occluded;
  float present = state.x * (1.0 - state.y);
  vec3 windowColour = onPicture * mix(uBacking, vec3(1.0), present);

  vec3 colour = windowColour * opening + bevelColour * bevel + faceColour * face;
  colour = tone(colour + glow * face);
  vec3 shown = encode(colour);

  // A round window's lens: the picture through it, and what the glass itself gives back, the
  // images of the lights in its convex face: the fire below the view, low in it; the sky, high on
  // the side it comes from. At the rim, the glass's ground edge, seen through the glass, is dark.
  if (circle > 0.5 && uCarried[0] > 0.5 && opening > 0.0) {
    float R = 0.5 * min(win.z, win.w);
    vec2 u = (p - (win.xy + 0.5 * win.zw)) / R;
    float r = min(length(u), 1.0);
    float corrected = smoothstep(0.0, 1.0, max(uSettled, max(state.z, state.w)));
    float px = 1.0 / (R * uDpr);
    float lod = log2(float(textureSize(uLeaf0, 0).x) * 0.5 * LENS_MIDDLE * px) + LEAF_BIAS;
    vec3 picture = mix(vec3(1.0), throughLens(u, corrected, lod, px), present);
    picture *= 1.0 - 0.55 * smoothstep(1.0 - 3.5 / R, 1.0 - 1.0 / R, r);
    vec3 n = normalize(vec3(u * LENS_BULGE, 1.0));
    vec3 glass = uFire * fire * kiln * glint(n, Lk)
               + uDay * day * key * glint(n, sun)
               + (fill + uDay * day * (1.0 - uSunKey)) * (0.04 + 0.96 * pow(1.0 - n.z, 5.0)) * 0.6;
    vec3 lensed = 1.0 - (1.0 - shown * picture) * (1.0 - encode(tone(glass)));
    shown = mix(shown, lensed, opening);
  }

  // A plate, once the mount carries it, fitted to its window as a picture covers its frame.
  if (circle < 0.5 && w >= 3 && uCarried[w] > 0.5 && opening > 0.0) {
    float fit = (win.z / win.w) / PLATE_ASPECT;
    vec2 uv = 0.5 + ((p - win.xy) / win.zw - 0.5) * (fit < 1.0 ? vec2(fit, 1.0) : vec2(1.0, 1.0 / fit));
    float lod = log2(float(textureSize(uPlate0, 0).x) * min(fit, 1.0) * spans / (win.z * uDpr)) + LEAF_BIAS;
    vec3 picture = mix(vec3(1.0), plateAt(w - 3, uv, lod), present);
    shown = mix(shown, shown * picture, opening);
  }

  shown = mix(behind, shown, cover);
  outColor = vec4(mix(uFlat, shown + dither, uFade), 1.0);
}
