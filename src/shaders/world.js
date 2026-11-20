// Tidally locked rocky worlds.
//
// Every TRAPPIST-1 planet keeps one face to the star, so the surface shader
// works in a frame where the substellar point is fixed: local +x always points
// at the star (scene.js sets the spin so). Climate geometry follows from that —
// an eyeball ocean is open around +x, a cloud deck piles up over it, volatiles
// freeze out around −x.
//
// Surface routines, chosen by #define:
//   WORLD_BAREROCK  dark regolith, craters, smooth volcanic plains
//   WORLD_LAVA      the same with glowing vents and flows (tidal-heating case)
//   WORLD_DRY       Mars-like: dusty plains, frost trapped on the night side
//   WORLD_EYEBALL   ocean open beneath the star, ice beyond, substellar clouds
//   WORLD_SNOWBALL  global ice shell with cracks and a substellar slush zone
//   WORLD_CLOUDY    opaque cloud deck (thick-atmosphere cases)
//
// Thermal mode replaces the visible shading with the temperature field of
// thermal.js — the same T(θ) the info card integrates for its 15 µm numbers —
// on a fixed 0–600 K scale.

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

export const MAX_OCCLUDERS = 6;

const WORLD_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vPosW;
varying vec3 vNormalW;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * vDir);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const WORLD_FRAG = /* glsl */ `
precision highp float;

#define MAX_OCCLUDERS ${MAX_OCCLUDERS}

uniform float uTime;
uniform float uSeed;
uniform float uDetail;
uniform mat3  uModelRot;

uniform vec3  uStarPos;
uniform float uStarRadius;
uniform vec3  uLightColor;
uniform float uIrradiance;
uniform float uExposure;
uniform float uBump;

uniform vec3 uColor0, uColor1, uColor2, uColor3;
uniform float uCraters, uRelief, uPlains, uLava, uDust;
uniform float uOcean, uLand, uCloud, uCracks, uMelt, uBands;

uniform float uThermal;
uniform float uT0, uAlbedo, uEps, uShift, uTFloor, uTMax;

uniform int   uOccCount;
uniform vec3  uOccPos[MAX_OCCLUDERS];
uniform float uOccRadius[MAX_OCCLUDERS];

varying vec3 vDir;
varying vec3 vPosW;
varying vec3 vNormalW;

#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}

// cos of the angle from the substellar point, in the planet's locked frame.
float cosSub(vec3 d) { return d.x; }

// --------------------------------------------------------------- height ----
float plainsMask(vec3 d) {
  return smoothstep(-0.05, 0.12, fbm3(d * 1.7 + uSeed * 0.37) - (0.5 - uPlains));
}

float landField(vec3 d) { return fbm6(d * 2.1 + uSeed); }

float surfaceHeight(vec3 d) {
#if defined(WORLD_BAREROCK) || defined(WORLD_LAVA)
  float pl = plainsMask(d);
  float base = fbm5(d * 3.1 + uSeed) * 0.5 * (1.0 - 0.75 * pl);
  float craters = craterField(d, uCraters, uDetail) * 0.32 * (1.0 - 0.6 * pl);
  return (base + craters + fbm4(d * 30.0) * 0.05) * uRelief;
#elif defined(WORLD_DRY)
  return (fbm6(d * 2.6 + uSeed) * 0.8 + craterField(d, uCraters, uDetail) * 0.18) * uRelief;
#elif defined(WORLD_EYEBALL)
  return max(landField(d) - (0.62 - uLand), 0.0) * 1.4;
#elif defined(WORLD_SNOWBALL)
  float ridges = 1.0 - abs(snoise(d * 9.0 + uSeed));
  return fbm4(d * 3.0 + uSeed) * 0.15 + pow(ridges, 8.0) * 0.12 * uCracks;
#else
  return 0.0;
#endif
}

vec3 bumpNormal(vec3 d, float h0, float scale) {
  if (scale <= 0.0001) return d;
  vec3 up = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, d));
  vec3 B = cross(d, T);
  float e = 0.0035;
  float ht = surfaceHeight(normalize(d + T * e));
  float hb = surfaceHeight(normalize(d + B * e));
  vec3 grad = (T * (ht - h0) + B * (hb - h0)) / e;
  return normalize(d - grad * scale * 0.06);
}

// -------------------------------------------------------------- surfaces ----
void shade(vec3 d, float h, out vec3 albedo, out float spec, out vec3 emissive) {
  albedo = uColor0;
  spec = 0.0;
  emissive = vec3(0.0);
  float cs = cosSub(d);

#if defined(WORLD_BAREROCK) || defined(WORLD_LAVA)
  float pl = plainsMask(d);
  // Broad terrain units first, then crater ejecta and rims picked out by
  // height, then a fine low-contrast regolith grain.
  float tone = smoothstep(-0.55, 0.55, fbm4(d * 2.2 + uSeed * 1.3));
  albedo = mix(uColor1, uColor0, 0.35 + 0.65 * tone);
  float hn = h / max(uRelief, 0.01);
  albedo = mix(albedo, uColor2, smoothstep(0.2, 0.5, hn) * 0.55);
  albedo *= 0.93 + 0.14 * fbm4(d * 48.0);
  #if defined(WORLD_BAREROCK)
    albedo = mix(albedo, uColor3, pl * 0.75);
  #else
    // Young flows: dark basalt in sinuous channels radiating from calderas.
    float flows = pow(1.0 - abs(snoise(d * 6.0 + vec3(0.0, uSeed, 0.0) + 0.4 * fbm3(d * 3.0))), 6.0);
    float vents = pow(max(worley(d * 9.0 + uSeed).x, 0.0), 0.5);
    float hot = smoothstep(0.86, 0.98, flows) * smoothstep(0.1, 0.5, fbm3(d * 2.0 + 4.0))
              + (1.0 - smoothstep(0.0, 0.08, vents)) * 0.9;
    albedo = mix(albedo, uColor1 * 0.6, pl * 0.6 + flows * 0.3);
    emissive = uColor3 * hot * uLava * 1.6;
  #endif

#elif defined(WORLD_DRY)
  float tone = smoothstep(-0.4, 0.5, fbm5(d * 3.0 + uSeed));
  albedo = mix(uColor1, uColor0, tone);
  albedo = mix(albedo, uColor2, uDust * smoothstep(0.1, 0.6, fbm4(d * 5.5 + 9.0)));
  // Thin air cannot hold volatiles on the cold night side: they freeze out
  // into a frost cap centred on the antistellar point.
  float frost = smoothstep(-0.45, -0.8, cs + 0.15 * fbm3(d * 6.0));
  albedo = mix(albedo, vec3(0.86, 0.88, 0.9), frost * 0.85);

#elif defined(WORLD_EYEBALL)
  float land = smoothstep(0.0, 0.01, h);
  float edge = uOcean + 0.06 * fbm4(d * 5.0 + uSeed);      // ragged ice margin
  float open = smoothstep(edge - 0.02, edge + 0.04, cs);
  vec3 ocean = uColor0 * (0.75 + 0.25 * cs);
  vec3 ice = uColor1 * (0.85 + 0.15 * fbm4(d * 14.0));
  // Pack ice breaks up toward the open water.
  float floes = smoothstep(0.2, 0.6, fbm4(d * 22.0)) * (1.0 - open) * smoothstep(edge - 0.25, edge, cs);
  vec3 sea = mix(ice, ocean, max(open, floes * 0.7));
  vec3 ground = mix(uColor2, uColor1, 1.0 - open);          // snow on land beyond the eye
  albedo = mix(sea, ground, land);
  spec = (1.0 - land) * open * 0.55;

  // Convective cloud deck piled up over the substellar point, thinning into
  // streaks toward the terminator.
  // A spiral twist around the substellar axis gives the deck its organised,
  // cyclone-like look rather than random patches.
  float r = acos(clamp(cs, -1.0, 1.0));                 // angle from substellar point
  float az = atan(d.z, d.y);
  vec3 q = vec3(cos(az + r * 2.5), sin(az + r * 2.5), r * 2.0) * 2.2 + vec3(uTime * 0.02);
  float swirl = fbm5(q + 0.8 * vec3(fbm3(q), fbm3(q + 7.0), 0.0));
  float core = smoothstep(0.8, 0.97, cs);
  float deck = max(core * smoothstep(-0.3, 0.15, swirl), smoothstep(0.45, 0.85, cs) * smoothstep(0.2, 0.5, swirl) * 0.85);
  float streaks = smoothstep(0.25, 0.6, fbm4(d * vec3(2.0, 7.0, 2.0) + 3.0)) * 0.25 * smoothstep(-0.2, 0.3, cs);
  float cloud = clamp(deck + streaks, 0.0, 1.0) * uCloud;
  albedo = mix(albedo, uColor3, cloud);
  spec *= 1.0 - cloud;

#elif defined(WORLD_SNOWBALL)
  float tone = fbm4(d * 4.0 + uSeed);
  albedo = mix(uColor1, uColor0, smoothstep(-0.5, 0.4, tone));
  albedo = mix(albedo, uColor2, smoothstep(0.3, 0.7, fbm3(d * 9.0 + 2.0)) * 0.5);
  // Lineae: dark ridged cracks like Europa's.
  float lin = pow(1.0 - abs(snoise(d * 7.0 + uSeed)), 18.0)
            + pow(1.0 - abs(snoise(d * 15.0 + uSeed * 2.0)), 26.0) * 0.6;
  albedo = mix(albedo, uColor3, clamp(lin, 0.0, 1.0) * uCracks);
  // Darker, bluer slush where the star stands overhead.
  float slush = smoothstep(1.0 - 0.35 * uMelt, 1.0, cs) * uMelt * 4.0;
  albedo = mix(albedo, vec3(0.45, 0.6, 0.72), clamp(slush, 0.0, 0.7));
  spec = 0.12 + 0.3 * slush;

#elif defined(WORLD_CLOUDY)
  // Tidally locked thick atmospheres organise around the substellar point,
  // with an equatorial jet shearing the pattern eastward.
  float lat = d.y;
  float lon = atan(d.z, d.x);
  vec3 q = vec3(lon * 0.9 + lat * lat * 2.5 + uTime * 0.05, lat * 4.0, 0.0);
  float bands = fbm4(vec3(q.x * 0.6, q.y * 2.2, uSeed)) * uBands;
  float convect = smoothstep(0.5, 0.95, cs) * fbm4(d * 6.0 + uTime * 0.03);
  float t = 0.5 + 0.5 * bands;
  albedo = mix(uColor1, uColor0, t);
  albedo = mix(albedo, uColor2, convect * 0.6 + smoothstep(0.6, 0.9, t) * 0.3);
  albedo = mix(albedo, uColor3, smoothstep(0.15, -0.3, bands) * 0.3);
#endif
}

// ------------------------------------------------------------ eclipses ----
// Other planets' shadows: compares the occluder's angular radius with the
// star's, giving a penumbra and the annular case.
float eclipseFactor(vec3 P, vec3 L, float starDist) {
  float vis = 1.0;
  for (int i = 0; i < MAX_OCCLUDERS; i++) {
    if (i >= uOccCount) break;
    vec3 rel = uOccPos[i] - P;
    float along = dot(rel, L);
    if (along <= 0.0 || along > starDist) continue;
    float perp = length(rel - along * L);
    float occAng = uOccRadius[i] / along;
    float starAng = uStarRadius / starDist;
    float sep = perp / along;
    float covered = 1.0 - smoothstep(max(occAng - starAng, 0.0), occAng + starAng, sep);
    float maxCover = clamp((occAng * occAng) / max(starAng * starAng, 1e-9), 0.0, 1.0);
    vis *= 1.0 - covered * maxCover;
  }
  return vis;
}

// ---------------------------------------------------------------- thermal --
// Matplotlib "inferno", polynomial fit.
vec3 inferno(float t) {
  const vec3 c0 = vec3(0.0002189403691192265, 0.001651004631001012, -0.01948089843709184);
  const vec3 c1 = vec3(0.1065134194856116, 0.5639564367884091, 3.932712388889277);
  const vec3 c2 = vec3(11.60249308247187, -3.972853965665698, -15.9423941062914);
  const vec3 c3 = vec3(-41.70399613139459, 17.43639888205313, 44.35414519872813);
  const vec3 c4 = vec3(77.162935699427, -33.40235894210092, -81.80730925738993);
  const vec3 c5 = vec3(-71.31942824499214, 32.62606426397723, 73.20951985803202);
  const vec3 c6 = vec3(25.13112622477341, -12.24266895238567, -23.07032500287172);
  t = clamp(t, 0.0, 1.0);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

float surfaceTemp(vec3 d) {
  // Hotspot shifted east (toward local −z, the direction of rotation).
  vec3 s = vec3(cos(uShift), 0.0, -sin(uShift));
  float c = max(dot(d, s), 0.0);
  float t4 = (1.0 - uAlbedo) * pow(uT0, 4.0) * ((1.0 - uEps) * c + uEps * 0.25);
  return max(pow(t4, 0.25), uTFloor);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  float h = surfaceHeight(d);

  vec3 albedo; float specStrength; vec3 emissive;
  shade(d, h, albedo, specStrength, emissive);

  if (uThermal > 0.5) {
    float T = surfaceTemp(d);
  #if defined(WORLD_LAVA)
    T = max(T, 300.0 + 900.0 * clamp(length(emissive) / 1.6, 0.0, 1.0) * uLava);
  #endif
    // The palette is defined in sRGB; the pipeline expects linear light and
    // encodes to sRGB at the end, so decode first or the darks wash out.
    vec3 col = pow(inferno(T / uTMax), vec3(2.2));
    // A hint of relief so the globe still reads as a surface.
    vec3 nb = bumpNormal(d, h, uBump * 0.5);
    col *= 0.88 + 0.12 * dot(nb, d);
    // Kept under the bloom threshold so the legend stays readable.
    gl_FragColor = vec4(col * 0.85, 1.0);
    return;
  }

  vec3 nLocal = bumpNormal(d, h, uBump);
  vec3 N = normalize(uModelRot * nLocal);

  vec3 toStar = uStarPos - vPosW;
  float starDist = length(toStar);
  vec3 L = toStar / starDist;
  vec3 V = normalize(cameraPosition - vPosW);

  float ndl = dot(N, L);
  // The star is 2–5° across from these orbits, so the terminator is soft.
  float lambert = clamp((ndl + 0.05) / 1.05, 0.0, 1.0);
  float shadow = eclipseFactor(vPosW, L, starDist);

  vec3 H = normalize(L + V);
  float spec = specStrength * pow(max(dot(N, H), 0.0), 60.0) * step(0.0, ndl) * shadow;

  vec3 col = albedo * lambert * shadow * uIrradiance * uLightColor;
  col += uLightColor * spec * uIrradiance;
  col += albedo * 0.004;                       // light from neighbouring planets
  float night = 1.0 - smoothstep(-0.1, 0.15, ndl * shadow);
  col += emissive * mix(0.25, 1.0, night);

  gl_FragColor = vec4(col * uExposure, 1.0);
}
`;

// ------------------------------------------------------------ atmosphere --

const ATMO_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uStarPos;
uniform vec3 uColor;
uniform vec3 uSunsetColor;
uniform vec3 uLightColor;
uniform float uIntensity;
varying vec3 vPosW;
varying vec3 vNormalW;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uStarPos - vPosW);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float depth = pow(1.0 - ndv, 2.6);
  float ndl = dot(N, L);
  float lit = smoothstep(-0.3, 0.35, ndl);
  float forward = pow(max(-dot(V, L), 0.0), 7.0);
  float twilight = exp(-pow(ndl / 0.26, 2.0));
  vec3 col = mix(uColor, uSunsetColor, twilight * 0.9) * uLightColor;
  float a = depth * uIntensity * (lit + 1.1 * forward * (0.25 + 0.75 * lit));
  gl_FragColor = vec4(col * a, 1.0);
}
`;

const ATMO_VERT = /* glsl */ `
varying vec3 vPosW;
varying vec3 vNormalW;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normalize(position));
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

export function createAtmosphereMaterial(atmo) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uStarPos: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(atmo.color) },
      uSunsetColor: { value: new THREE.Color(atmo.sunset || atmo.color) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uIntensity: { value: atmo.intensity },
    },
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// ------------------------------------------------------------- factory ----

const DEFINES = {
  barerock: 'WORLD_BAREROCK',
  lava: 'WORLD_LAVA',
  dry: 'WORLD_DRY',
  eyeball: 'WORLD_EYEBALL',
  snowball: 'WORLD_SNOWBALL',
  cloudy: 'WORLD_CLOUDY',
};

const BUMP = { barerock: 0.5, lava: 0.4, dry: 0.45, eyeball: 0.35, snowball: 0.25, cloudy: 0 };

export function createWorldMaterial(planet, scenario, seed) {
  const define = DEFINES[scenario.world];
  if (!define) throw new Error(`unknown world type "${scenario.world}"`);
  const p = scenario.params || {};
  const c = scenario.colors;
  const occPos = Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector3());
  return new THREE.ShaderMaterial({
    defines: { [define]: '' },
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uDetail: { value: 1 },
      uModelRot: { value: new THREE.Matrix3() },
      uStarPos: { value: new THREE.Vector3() },
      uStarRadius: { value: 1 },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uIrradiance: { value: 1 },
      uExposure: { value: 1 },
      uBump: { value: BUMP[scenario.world] },
      uColor0: { value: new THREE.Color(c[0]) },
      uColor1: { value: new THREE.Color(c[1]) },
      uColor2: { value: new THREE.Color(c[2]) },
      uColor3: { value: new THREE.Color(c[3]) },
      uCraters: { value: p.craters ?? 16 },
      uRelief: { value: p.relief ?? 0.5 },
      uPlains: { value: p.plains ?? 0.25 },
      uLava: { value: p.lava ?? 0 },
      uDust: { value: p.dust ?? 0 },
      uOcean: { value: Math.cos(((p.ocean ?? 50) * Math.PI) / 180) },
      uLand: { value: p.land ?? 0.1 },
      uCloud: { value: p.cloud ?? 0 },
      uCracks: { value: p.cracks ?? 0.5 },
      uMelt: { value: p.melt ?? 0 },
      uBands: { value: p.bands ?? 0.6 },
      uThermal: { value: 0 },
      uT0: { value: 300 },
      uAlbedo: { value: scenario.albedo },
      uEps: { value: scenario.redistribution },
      uShift: { value: ((scenario.hotspotShift ?? 0) * Math.PI) / 180 },
      uTFloor: { value: 40 },
      uTMax: { value: 600 },
      uOccCount: { value: 0 },
      uOccPos: { value: occPos },
      uOccRadius: { value: new Array(MAX_OCCLUDERS).fill(0) },
    },
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
  });
}

export const DEFAULT_BUMP = BUMP;
