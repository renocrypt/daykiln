#version 300 es
// The sheet's second pass: from its height, the slope of its surface, which is what the light sees.
// Out: the slopes along x and y (CSS px down), scaled by uSlope and centred on 0.5; the height; the
// brightness of the pulp. Mipmapped after, so the sheet goes smooth as it goes small.
precision highp float;
precision highp int;
out vec4 outColor;

uniform sampler2D uHeight;
uniform float uSize; // CSS px
uniform float uSlope;

float height(ivec2 c, int n) {
  vec4 t = texelFetch(uHeight, ((c % n) + n) % n, 0);
  return (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / 65535.0 * 2.4;
}

void main() {
  int n = textureSize(uHeight, 0).x;
  ivec2 c = ivec2(gl_FragCoord.xy);
  float texel = uSize / float(n);
  // Texel rows run the way the document does, down the album, so this is the slope in its space.
  vec2 slope = vec2(height(c + ivec2(1, 0), n) - height(c - ivec2(1, 0), n),
                    height(c + ivec2(0, 1), n) - height(c - ivec2(0, 1), n)) / (2.0 * texel);
  float h = height(c, n) / 2.4;
  float albedo = texelFetch(uHeight, c, 0).b;
  outColor = vec4(clamp(slope * uSlope, -0.25, 0.25) * 2.0 + 0.5, h, albedo);
}
