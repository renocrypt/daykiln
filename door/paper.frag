#version 300 es
// The sheet, made once: a tile of handmade paper that repeats without a seam, uSize CSS pixels
// square. What is in it, from the largest to the smallest: the formation, the clouds a sheet has
// where its pulp settled thicker or thinner; long bast fibres lying loose on the surface, and a
// felt of short ones under them; the grain of the pulp. The laid and chain lines of the screen it
// was lifted on run the length of the album, so they are drawn by the mount itself, not tiled.
//
// Out: the height in 16 bits over R and G, the brightness of the pulp in B.
precision highp float;
precision highp int;
out vec4 outColor;

uniform float uSize; // CSS px
uniform float uRes;  // texels
uniform float uSeed;

uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
vec4 rand4(ivec2 c, int k, int salt) {
  uint h = pcg(uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ uint(k) * 83492791u ^ uint(salt) * 2654435761u ^ uint(uSeed));
  uint a = pcg(h), b = pcg(a), d = pcg(b), e = pcg(d);
  return vec4(a, b, d, e) / 4294967295.0;
}
ivec2 wrap(ivec2 c, int n) { return ((c % n) + n) % n; }

// Value noise; every cell size divides the tile, so it repeats with it.
float vnoise(vec2 p, float cell, int salt) {
  int n = int(uSize / cell + 0.5);
  vec2 q = p / cell;
  ivec2 i = ivec2(floor(q));
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = rand4(wrap(i, n), 0, salt).x, b = rand4(wrap(i + ivec2(1, 0), n), 0, salt).x;
  float c = rand4(wrap(i + ivec2(0, 1), n), 0, salt).x, d = rand4(wrap(i + ivec2(1, 1), n), 0, salt).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fibres scattered cell by cell: each a slightly bent stroke, round in section, tapering to both
// ends. `reach` is how many cells away a fibre can start and still cross this one.
float fibres(vec2 p, float cell, int perCell, vec2 len, vec2 wid, int reach, int salt) {
  int n = int(uSize / cell + 0.5);
  ivec2 c0 = ivec2(floor(p / cell));
  float h = 0.0;
  for (int j = -reach; j <= reach; j++) {
    for (int i = -reach; i <= reach; i++) {
      ivec2 c = c0 + ivec2(i, j);
      ivec2 w = wrap(c, n);
      for (int k = 0; k < perCell; k++) {
        vec4 r = rand4(w, k, salt);
        float l = mix(len.x, len.y, r.w * r.w);
        vec2 centre = (vec2(c) + r.xy) * cell;
        float angle = r.z * 6.2831853;
        vec2 dir = vec2(cos(angle), sin(angle));
        vec2 d = p - centre;
        float t = dot(d, dir) / (0.5 * l);
        if (abs(t) >= 1.0) continue;
        vec4 s = rand4(w, k + 16, salt);
        float bend = (s.z - 0.5) * 0.2 * l;
        float off = dot(d, vec2(-dir.y, dir.x)) - bend * (1.0 - t * t);
        float taper = sqrt(1.0 - t * t);
        float halfWidth = mix(wid.x, wid.y, s.y) * (0.3 + 0.7 * taper) * 0.5;
        float profile = sqrt(max(1.0 - (off * off) / (halfWidth * halfWidth), 0.0));
        h += profile * (0.55 + 0.45 * s.x) * (1.0 - 0.4 * h);
      }
    }
  }
  return h;
}

void main() {
  vec2 p = gl_FragCoord.xy / uRes * uSize;

  float formation = vnoise(p, 128.0, 1) * 0.6 + vnoise(p, 32.0, 2) * 0.4;
  float bast = fibres(p, 64.0, 1, vec2(34.0, 120.0), vec2(0.55, 1.2), 2, 3);
  float felt = fibres(p, 16.0, 2, vec2(7.0, 24.0), vec2(0.35, 0.8), 1, 4);
  float grain = vnoise(p, 1.6, 5) * 0.6 + vnoise(p, 4.0, 6) * 0.4;

  float height = formation * 0.9 + felt * 0.24 + bast * 0.22 + grain * 0.22;
  // The pulp is a little lighter where it lies thick and where a long fibre lies on top of it.
  float albedo = 0.5 + (formation - 0.5) * 0.06 + bast * 0.035 - (grain - 0.5) * 0.024;

  float v = floor(clamp(height / 2.4, 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(v / 256.0);
  outColor = vec4(hi / 255.0, (v - hi * 256.0) / 255.0, albedo, 1.0);
}
