// Shared GLSL: gradient noise, fractal sums, cellular noise, domain warping.
// Everything the surfaces are made of is generated here on the GPU — there is
// not a single image texture in this project.

export const NOISE_GLSL = /* glsl */ `
// ---------------------------------------------------------------- hashing --
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// ------------------------------------------------- 3D simplex gradient noise
// Ashima Arts / Stefan Gustavson formulation.
vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute289(vec4 x) { return mod289_4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289_3(i);
  vec4 p = permute289(permute289(permute289(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 nrm = taylorInvSqrt4(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= nrm.x; p1 *= nrm.y; p2 *= nrm.z; p3 *= nrm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// ------------------------------------------------------------ fractal sums --
// GLSL ES 1.00 wants constant loop bounds, so the octave counts are baked in.
const mat3 FBM_ROT = mat3( 0.00,  0.80,  0.60,
                          -0.80,  0.36, -0.48,
                          -0.60, -0.48,  0.64);

float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * snoise(p); p = FBM_ROT * p * 2.03; a *= 0.5; }
  return s;
}
float fbm4(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * snoise(p); p = FBM_ROT * p * 2.03; a *= 0.5; }
  return s;
}
float fbm5(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * snoise(p); p = FBM_ROT * p * 2.03; a *= 0.5; }
  return s;
}
float fbm6(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { s += a * snoise(p); p = FBM_ROT * p * 2.03; a *= 0.5; }
  return s;
}
float fbm7(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) { s += a * snoise(p); p = FBM_ROT * p * 2.03; a *= 0.5; }
  return s;
}

// Ridged multifractal — sharp creases, good for filaments and flare arcs.
float ridged4(vec3 p) {
  float s = 0.0, a = 0.5, prev = 1.0;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(snoise(p));
    n *= n;
    s += a * n * prev;
    prev = n;
    p = FBM_ROT * p * 2.07;
    a *= 0.5;
  }
  return s;
}
float ridged5(vec3 p) {
  float s = 0.0, a = 0.5, prev = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = 1.0 - abs(snoise(p));
    n *= n;
    s += a * n * prev;
    prev = n;
    p = FBM_ROT * p * 2.07;
    a *= 0.5;
  }
  return s;
}

// Billowy / turbulent sum — puffy, cloud-like.
float turbulence4(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * abs(snoise(p)); p = FBM_ROT * p * 2.03; a *= 0.5; }
  return s;
}
float turbulence5(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * abs(snoise(p)); p = FBM_ROT * p * 2.03; a *= 0.5; }
  return s;
}

// ----------------------------------------------------------- cellular noise --
// Returns (F1, F2). F2 - F1 draws the cell walls; F1 alone gives crater bowls.
vec2 worley(vec3 p) {
  vec3 b = floor(p);
  vec3 f = p - b;
  float f1 = 8.0, f2 = 8.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = hash33(b + g);
        float d = length(g + o - f);
        if (d < f1) { f2 = f1; f1 = d; }
        else if (d < f2) { f2 = d; }
      }
    }
  }
  return vec2(f1, f2);
}

// A single scale of impact craters: a depressed bowl ringed by a raised rim,
// with roughly half the cells left empty so the field does not look tiled.
float craterLayer(vec3 p, float seed) {
  vec3 b = floor(p);
  vec3 f = p - b;
  float h = 0.0;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 cell = b + g;
        vec3 o = hash33(cell + seed);
        float present = step(0.42, hash13(cell * 1.37 + seed + 4.1));
        float rad = 0.22 + 0.26 * o.z;
        float d = length(g + o - f) / max(rad, 0.02);
        // bowl (negative) inside, rim (positive) at d ~ 1, nothing past 1.35
        float bowl = -smoothstep(1.0, 0.0, d) * 0.85;
        float rim = (1.0 - smoothstep(0.0, 0.35, abs(d - 1.0))) * 0.55;
        h += present * (bowl + rim);
      }
    }
  }
  return h;
}

// Overlapping crater populations — big, medium, and (at full detail) small.
float craterField(vec3 p, float density, float detail) {
  float h = craterLayer(p * density, 0.0)
          + 0.50 * craterLayer(p * density * 2.37, 11.3);
  if (detail > 0.5) h += 0.22 * craterLayer(p * density * 5.61, 27.9);
  return h;
}

// ----------------------------------------------------------- domain warping --
vec3 warp(vec3 p, float amount) {
  return p + amount * vec3(fbm4(p + 11.3), fbm4(p + 47.1), fbm4(p + 83.7));
}

// Rotate a point about the +Y axis. Used for differential rotation and for
// spinning cloud decks independently of the surface below them.
vec3 spinY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
`;
