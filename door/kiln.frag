#version 300 es
// The kiln's eye, the door's entrance (entrance.ts): the spy-hole through a kiln's bricked door,
// with the fire beyond it and a ware in the fire. The view comes up to the eye and through it, into
// the fire. Lengths are in the hole's radius; the view looks along −z at the wall's face, z = 0,
// and y is down, as on the page.
precision highp float;

uniform vec2 uView;   // CSS px
uniform float uDpr;
uniform float uTime;  // s: the flames move with it
uniform float uHeat;  // how far the fire has come up, 0…1
uniform vec3 uEye;    // where the view is: off the hole's axis (x, y), and its distance from the face
uniform float uGain;  // exposure above the resting one, in stops
uniform sampler2D uAlbedo; // the wall's colour, sRGB, centred on the hole
uniform sampler2D uHeight; // the wall's relief
uniform float uWall;       // how far the wall has come in, 0…1: its textures arrive after the fire

out vec4 outColor;

const float DEPTH = 1.2;              // the tube through the wall
const vec2 CENTRE = vec2(0.5, 0.46);  // the hole's place in the view, of its width and height
const float GLOW = 0.05;              // the fire's radiance for its temperature, as seen through the eye

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p, int octaves) {
  float t = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    t += a * noise(p);
    n += a;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 17.0;
    a *= 0.5;
  }
  return t / n;
}

/** What a body at T kelvin gives off, linear, against one at 1300 K. */
vec3 blackbody(float T) {
  const vec3 l = vec3(610.0, 550.0, 465.0);  // nm, about where sRGB's primaries are
  const float c2 = 14388e3;                   // nm·K
  return pow(550.0 / l, vec3(5.0)) * (exp(c2 / (550.0 * 1300.0)) - 1.0) / (exp(c2 / (l * T)) - 1.0);
}

/** As hot as the fire has come up to: `T` at full heat. */
float heated(float T) { return mix(620.0, T, uHeat); }

// As the door's shaders: a shoulder above 0.85, and very bright light going to white.
vec3 shoulder(vec3 v) { return mix(v, 0.85 + 0.15 * (1.0 - exp(-(v - 0.85) / 0.15)), step(0.85, v)); }
vec3 tone(vec3 v) {
  float m = max(max(v.r, v.g), v.b);
  if (m <= 0.85) return v;
  return mix(v * shoulder(vec3(m)).r / m, shoulder(v), smoothstep(1.0, 3.0, m));
}
vec3 encode(vec3 v) {
  v = clamp(v, 0.0, 1.0);
  return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v));
}

/** The hole's edge, at the angle of `P`: bored through the brick, and chipped where it broke. */
float rimAt(vec2 P) {
  vec2 a = P / max(length(P), 1e-4);
  return 1.0 + 0.07 * (fbm(a * 1.6 + 3.0, 3) - 0.5) + 0.05 * max(fbm(a * 5.0 + 11.0, 3) - 0.45, 0.0);
}

// The kiln's door, bricked up with old handmade brick: photographed brick (door/tools/wall.ts),
// 75 texels to the hole's radius, the hole bored through the middle of one brick. It is lit by the
// shed, dimly, and by the fire: the glow in the hole throws its light out across the face at a
// low angle, so near the hole the bricks' tops and arrises catch it and the joints are in shadow.
const float SPAN = 1536.0 / 75.0; // the wall's texture, across, in hole radii
const float RELIEF = 0.6;         // from the deepest joint to the proudest brick, in hole radii
const float LAMP = 0.45;          // how far in front of the face the hole's glow seems to be

float heightAt(vec2 P) { return texture(uHeight, 0.5 + P / SPAN).r * RELIEF; }
/** The same, softened by about a texel: what the brick's slope is taken from, clear of the texture's grain. */
float softAt(vec2 P) { return textureLod(uHeight, 0.5 + P / SPAN, 0.8).r * RELIEF; }

/** The wall's face at P: the brick, fired and sooted, in the shed's light and the fire's. */
vec3 face(vec2 P, float r, float rim, float px) {
  vec2 uv = 0.5 + P / SPAN;
  float e = 2.0 / 75.0;
  float h = heightAt(P);
  vec2 slope = vec2(softAt(P + vec2(e, 0.0)) - softAt(P - vec2(e, 0.0)), softAt(P + vec2(0.0, e)) - softAt(P - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-slope.x, slope.y, 1.0));  // y is down on the wall, up in the light's frame
  float around = textureLod(uHeight, uv, 4.0).r * RELIEF;
  float cavity = clamp(0.62 + 1.6 * (h - around) / RELIEF, 0.25, 1.0);
  float joint = 1.0 - smoothstep(0.3, 0.46, h / RELIEF);

  // The brick as fired, then darkened by years of the kiln's smoke, most in the joints and above the hole.
  vec3 albedo = texture(uAlbedo, uv).rgb;
  albedo = mix(vec3(dot(albedo, vec3(0.2126, 0.7152, 0.0722))), albedo, 0.7) * 0.62;
  albedo *= mix(1.0, 0.3, joint);
  float up = -P.y;
  float spread = 0.9 + 0.9 * max(up, 0.0);
  float soot = exp(-pow(P.x / spread, 2.0)) * smoothstep(-0.4, 1.0, up) * (0.55 + 0.6 * fbm(P * vec2(0.9, 0.5) + 5.0, 4));
  soot += 0.5 * exp(-max(r - 1.0, 0.0) / 1.2);
  albedo *= 1.0 - 0.72 * min(soot, 1.0);

  // The shed: a little cool light from above.
  vec3 c = albedo * vec3(0.03, 0.031, 0.036) * cavity * (0.55 + 0.45 * max(dot(n, normalize(vec3(0.0, 0.7, 1.0))), 0.0));

  // The fire, from the hole: its light, where the brick faces it and is not shaded from it.
  vec3 toLamp = vec3(-P, LAMP - (h - 0.63 * RELIEF));
  float d = length(toLamp);
  vec3 L = toLamp / d;
  float facing = max(dot(n * vec3(1.0, -1.0, 1.0), L), 0.0);
  float lit = 1.0;
  vec2 toward = -P / max(r, 1e-3);
  for (int i = 1; i <= 10; i++) {
    float s = min(r - 1.0, 1.6) * float(i) / 10.0;
    if (s <= 0.0) break;
    float ray = h + s * (LAMP + 0.63 * RELIEF - h) / r;
    lit = min(lit, clamp(1.0 - (heightAt(P + toward * s) - ray) / (0.08 * s + 0.02), 0.0, 1.0));
  }
  float flicker = 1.0 + 0.06 * sin(uTime * 1.9 + 1.3) + 0.03 * sin(uTime * 6.9 + 0.4);
  c += albedo * blackbody(heated(1350.0)) * 0.16 * flicker * facing * lit * cavity / (1.0 + pow(max(r - 1.0, 0.0) / 1.8, 2.0));

  // Before the wall's textures have come: the same dark, without its brick.
  vec3 bare = vec3(0.16, 0.085, 0.05) * 0.55 * (0.8 + 0.4 * fbm(P * 1.3, 4)) * (1.0 - 0.72 * min(soot, 1.0))
            * (vec3(0.016, 0.017, 0.02) + blackbody(heated(1350.0)) * 0.012 / (1.0 + pow(max(r - 1.0, 0.0) / 1.1, 2.0)));
  c = mix(bare, c, uWall);

  // The chamfer round the hole, facing into it, lit by the fire and hottest at the edge.
  float bevel = smoothstep(rim + 0.09 + px, rim + 0.09 - px, r + 0.04 * (fbm(P * 9.0, 3) - 0.5));
  c += albedo * blackbody(heated(1250.0)) * 0.9 * bevel * (0.4 + 0.8 * cavity) * pow(smoothstep(rim + 0.09, rim, r), 1.5);
  return c;
}

/**
 * The tube's inner wall, `s` into it from the face, at the angle of `P`: as hot as the chamber at
 * its far end and cooling through the wall toward the face, and lit by the fire it looks onto.
 */
vec3 tube(vec2 P, float s) {
  float a = atan(P.y, P.x);
  vec3 brick = texture(uAlbedo, vec2(a / 6.2832 * 0.4 + 0.3, 0.55 + s * 0.06)).rgb;
  float clay = mix(0.8 + 0.4 * fbm(vec2(a * 3.0, s * 2.5) + 7.0, 3), 2.2 * dot(brick, vec3(0.2126, 0.7152, 0.0722)) + 0.3, uWall);
  float deep = s / DEPTH;
  vec3 own = blackbody(heated(mix(850.0, 1460.0, deep)));
  vec3 lit = blackbody(heated(1450.0)) * 0.3 * pow(deep, 1.8);
  return (own + lit) * GLOW * clay;
}

/**
 * The ware being fired, in the chamber, as the eye sees it against the fire: a meiping standing on
 * a kiln shelf, a little cooler than the flame round it. 1 where it is, at X in its plane.
 */
float ware(vec2 X, float px) {
  float shelf = smoothstep(0.5 - px, 0.5 + px, X.y) * (1.0 - smoothstep(0.66 - px, 0.66 + px, X.y));
  vec2 q = X - vec2(-0.22, 0.5);                  // from the middle of its foot
  float t = -q.y / 1.1;                           // up it, foot to lip
  float r = t < 0.7 ? mix(0.2, 0.37, sin(t / 0.7 * 1.5708))
          : t < 0.92 ? mix(0.37, 0.075, smoothstep(0.7, 0.92, t))
          : 0.1;
  float body = smoothstep(r + px, r - px, abs(q.x)) * smoothstep(-px, px, t) * smoothstep(1.0 + px, 1.0 - px, t);
  return max(shelf, body);
}

/** The chamber beyond, seen along the ray from E by q: the fire, its flames licking up. */
vec3 chamber(vec2 E, float z, vec2 q) {
  // Two sheets of it, one behind the other, so it has depth as the view comes through.
  vec3 c = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float at = -DEPTH - (k == 0 ? 1.1 : 2.8);
    vec2 X = E + (z - at) * q + (k == 0 ? 0.0 : 3.1);
    float rise = uTime * (k == 0 ? 1.3 : 0.7);
    vec2 w = vec2(fbm(X * 0.8 + vec2(0.0, rise * 0.6), 3), fbm(X * 0.8 + vec2(5.2, rise * 0.6 + 1.3), 3));
    float f = fbm(X * vec2(1.3, 0.75) + 1.6 * w + vec2(0.0, rise), 5);
    float T = 1450.0 + 560.0 * (f - 0.5);
    if (k == 1) {
      // Behind the nearer flames, the ware: the heat round it, less the little it lags.
      vec2 Y = E + (z - (-DEPTH - 2.2)) * q;
      T -= 330.0 * ware(Y, 0.012 * max(z + DEPTH + 2.2, 0.5));
    }
    c += (k == 0 ? 0.3 : 0.7) * blackbody(heated(T));
  }
  return c * GLOW;
}

void main() {
  vec2 view = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  float F = min(uView.x, uView.y);
  vec2 E = uEye.xy;
  float z = uEye.z;
  // The ray: q across, −1 along z; the view is turned to keep the eye where it is.
  vec2 q = (view - CENTRE * uView) / F - E / max(z, 0.6);
  float px = max(abs(z), 0.05) / (F * uDpr);     // a device pixel, at the face

  vec3 c;
  float into = 1.0;                               // how much of the pixel goes into the hole
  vec3 wall = vec3(0.0);
  if (z > 0.0) {
    vec2 P = E + z * q;
    float r = length(P), rim = rimAt(P);
    into = 1.0 - smoothstep(rim - px, rim + px, r);
    if (into < 1.0) wall = face(P, r, rim, px);
  }
  if (into > 0.0) {
    // Into the tube: where the ray leaves its circle, if that is before its far end.
    float a = dot(q, q), b = dot(E, q), k = dot(E, E) - 1.0;
    float d = b * b - a * k;
    float out_ = a > 1e-8 && d >= 0.0 ? (-b + sqrt(d)) / a : 1e9;  // along the ray, from the eye
    float s = out_ - z;                                              // how far into the tube, there
    float from = max(z, 0.0);
    vec3 hole;
    if (out_ < from) hole = tube(E + from * q, 0.0);                 // at the lip, outside the circle
    else {
      float end = smoothstep(DEPTH - px * 4.0, DEPTH + px * 4.0, s);
      hole = mix(tube(E + out_ * q, s), chamber(E, z, q), end);
    }
    c = mix(wall, hole, into);
  } else c = wall;

  c *= exp2(uGain);
  vec3 dither = vec3(hash(gl_FragCoord.xy) + hash(gl_FragCoord.yx + 17.0) - 1.0) / 255.0;
  outColor = vec4(encode(tone(c)) + dither, 1.0);
}
