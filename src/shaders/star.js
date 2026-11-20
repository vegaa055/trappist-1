// TRAPPIST-1's photosphere: an M8 dwarf at 2566 K.
//
// The shader builds a *temperature* map and converts it to colour with
// Planck's law at three effective wavelengths (R 0.61, G 0.55, B 0.465 µm),
// relative to the quiet photosphere. Nothing is hand-coloured: a spot 500 K
// cooler comes out dark red-brown because B_λ falls steeply on the Wien side,
// faculae 110 K hotter come out brighter and slightly yellower, and a 9000 K
// flare kernel comes out blue-white and hundreds of times brighter than its
// surroundings in the blue — which is what M-dwarf flares do.
//
// Layers:
//   * granulation — on a fully convective M dwarf granules are tens of km
//     across, far below what any view here resolves, so they appear only as a
//     faint high-frequency mottle (±1 % in T), faded out where it would alias
//   * facular network — a noise-gated bright network plus halos around spots
//   * starspots — discrete, from the CPU list in activity.js: umbra/penumbra
//     with ragged edges
//   * flares — compact kernel at flare temperature plus two separating ribbons,
//     amplitude normalised so the disc-integrated light matches the energy
//     the CPU model assigned to the event
//   * quadratic limb darkening, I(μ) = 1 − u₁(1−μ) − u₂(1−μ)²
//
// The star rotates rigidly (fully convective dwarfs show little differential
// rotation); spots and flares ride on the rotating mesh.

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';
import { MAX_SPOTS, MAX_FLARES, CHANNEL_LAMBDA } from '../activity.js';

const STAR_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vNormalW;
varying vec3 vPosW;
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

const STAR_FRAG = /* glsl */ `
precision highp float;

#define MAX_SPOTS ${MAX_SPOTS}
#define MAX_FLARES ${MAX_FLARES}

uniform float uTime;          // wall-clock seconds — granular shimmer only
uniform float uTeff;
uniform vec3  uLambda;        // µm
uniform vec3  uPhotColor;     // display colour of the quiet photosphere
uniform float uBrightness;
uniform vec2  uLimb;
uniform float uDetail;

uniform int   uSpotCount;
uniform vec4  uSpot[MAX_SPOTS];       // xyz local direction, w angular radius
uniform float uUmbraDT;
uniform float uPenumbraDT;

uniform float uFaculae;       // network strength, 0..2
uniform float uFaculaDT;

uniform int   uFlareCount;
uniform vec4  uFlare[MAX_FLARES];     // xyz local direction, w kernel radius
uniform vec4  uFlareInfo[MAX_FLARES]; // x amplitude, y progress 0..1, z ribbon angle, w seed
uniform float uFlareTemp;

varying vec3 vDir;
varying vec3 vNormalW;
varying vec3 vPosW;

#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}

// B_λ(T) / B_λ(Teff) per channel.
vec3 planckRatio(float T) {
  vec3 x0 = 14388.0 / (uLambda * uTeff);
  vec3 x  = 14388.0 / (uLambda * max(T, 800.0));
  return (exp(x0) - 1.0) / (exp(x) - 1.0);
}

// Great-circle angle, accurate at the small angles spots and flares live at.
float angleBetween(vec3 a, vec3 b) {
  return 2.0 * asin(clamp(length(a - b) * 0.5, 0.0, 1.0));
}

void main() {
  #include <logdepthbuf_fragment>

  vec3 d = normalize(vDir);
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float mu = clamp(dot(N, V), 0.0, 1.0);

  float T = uTeff;

  // ----------------------------------------------------------- granulation --
  // Fade the finest layer out as it approaches the pixel scale.
  float px = length(fwidth(d));
  float fineFade = 1.0 - smoothstep(0.004, 0.02, px);
  float midFade  = 1.0 - smoothstep(0.02, 0.08, px);
  float mottle = 0.0;
  if (uDetail > 0.5) {
    mottle += fineFade * fbm4(d * 160.0 + vec3(0.0, uTime * 0.05, 0.0)) * 0.6;
  }
  mottle += midFade * fbm4(d * 34.0 + vec3(uTime * 0.01)) * 0.4;
  T += uTeff * 0.011 * mottle;

  // --------------------------------------------------------------- faculae --
  // A thin bright network along the boundaries of large convective cells,
  // concentrated into patchy active ("plage") regions, and more visible
  // toward the limb as on the Sun.
  vec3 q = d * 13.0 + 3.7;
  q += 0.35 * vec3(fbm3(q * 0.5), fbm3(q * 0.5 + 11.0), fbm3(q * 0.5 + 23.0));
  vec2 cells = worley(q);
  float lanes = 1.0 - smoothstep(0.0, 0.09, cells.y - cells.x);
  // Break the cell outline into fragments so it reads as a network, not tiles.
  lanes *= smoothstep(-0.1, 0.35, fbm3(d * 31.0 + 5.0));
  float plage = smoothstep(0.0, 0.5, fbm4(d * 2.4 + 8.1));
  float net = plage;
  float facula = lanes * (0.08 + 0.92 * plage) * (0.5 + 0.9 * (1.0 - mu)) * uFaculae;
  // Diffuse plage brightening under the network.
  facula += 0.18 * plage * uFaculae;

  // ----------------------------------------------------------------- spots --
  float spotDT = 0.0;
  for (int i = 0; i < MAX_SPOTS; i++) {
    if (i >= uSpotCount) break;
    float r = uSpot[i].w;
    if (r < 1e-4) continue;
    float ang = angleBetween(d, uSpot[i].xyz);
    if (ang > r * 2.6) continue;
    // Ragged edges, scaled to the spot so small and large spots look alike.
    float edge = 1.0 + 0.28 * fbm4(d * (3.5 / r) + uSpot[i].xyz * 17.0);
    float x = ang / (r * edge);
    float pen = 1.0 - smoothstep(0.88, 1.02, x);
    float umb = 1.0 - smoothstep(0.42, 0.58, x);
    // Radial penumbral filaments.
    float fil = 0.75 + 0.25 * ridged4(d * (14.0 / r));
    spotDT = min(spotDT, mix(uPenumbraDT * fil * pen, uUmbraDT, umb));
    // Bright facular halo around the spot.
    float halo = smoothstep(1.0, 1.3, x) * (1.0 - smoothstep(1.5, 2.4, x));
    facula = max(facula, halo * (0.25 + 0.5 * lanes + 0.2 * net) * uFaculae);
  }
  T += facula * uFaculaDT * (1.0 - step(0.0001, -spotDT));
  T += spotDT;

  vec3 I = planckRatio(T);

  // --------------------------------------------------------------- limb ----
  float om = 1.0 - mu;
  float limb = max(1.0 - uLimb.x * om - uLimb.y * om * om, 0.0);
  I *= limb;

  // ---------------------------------------------------------------- flares --
  // Only the kernel is energy-normalised. Ribbons and the post-flare arcade are
  // cooler, larger structures; they scale sub-linearly with the flare so a
  // superflare reads as intense without the bloom pass flooding the frame.
  vec3 flareI = vec3(0.0);
  vec3 ribbonRatio = planckRatio(4500.0);
  vec3 arcadeRatio = planckRatio(3500.0);
  vec3 kernelRatio = planckRatio(uFlareTemp);
  for (int i = 0; i < MAX_FLARES; i++) {
    if (i >= uFlareCount) break;
    vec3 c = uFlare[i].xyz;
    float rk = uFlare[i].w;
    float amp = uFlareInfo[i].x;
    if (amp <= 0.0) continue;
    vec3 rel = d - c;
    if (dot(rel, rel) > rk * rk * 400.0) continue;

    // Tangent frame at the flare, rotated by its ribbon angle.
    vec3 up = abs(c.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t1 = normalize(cross(up, c));
    vec3 t2 = cross(c, t1);
    float a = uFlareInfo[i].z;
    vec3 e1 = cos(a) * t1 + sin(a) * t2;
    vec3 e2 = -sin(a) * t1 + cos(a) * t2;
    float u = dot(rel, e1) / rk;
    float v = dot(rel, e2) / rk;

    float kernel = exp(-(u * u + v * v) * 2.2);

    // Two ribbons drifting apart as the flare evolves.
    float prog = uFlareInfo[i].y;
    float sep = 1.2 + 4.0 * prog;
    float n = 0.55 + 0.45 * fbm3(vec3(u * 1.3, v * 0.4, uFlareInfo[i].w));
    float ribbons = exp(-pow((abs(v) - sep) / 0.7, 2.0)) * exp(-u * u / 20.0) * n;

    // Broad warm glow of the post-flare arcade.
    float arcade = exp(-(u * u + v * v) / 45.0) * prog;

    float side = sqrt(amp);
    flareI += amp * kernel * kernelRatio
            + side * (ribbons * 0.05 * ribbonRatio + arcade * 0.03 * arcadeRatio);
  }
  // Flare emission is optically thin-ish chromospheric light: weaker limb
  // darkening than the photosphere.
  I += flareI * (0.55 + 0.45 * sqrt(mu));

  vec3 col = uPhotColor * I * uBrightness;
  // Soft shoulder on extreme flare highlights so bloom stays well-behaved.
  col = col / (1.0 + max(col - 4.0, 0.0) / 8.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createStarMaterial({ teff, activity }) {
  const spots = Array.from({ length: MAX_SPOTS }, () => new THREE.Vector4());
  const flares = Array.from({ length: MAX_FLARES }, () => new THREE.Vector4());
  const flareInfo = Array.from({ length: MAX_FLARES }, () => new THREE.Vector4());
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTeff: { value: teff },
      uLambda: { value: new THREE.Vector3(...CHANNEL_LAMBDA) },
      // The quiet photosphere's display colour. A 2566 K blackbody is orange
      // (#ffa14a); TiO and VO absorption carve the green-yellow out of a real
      // M8 spectrum, so the star itself reads deeper and redder than that.
      uPhotColor: { value: new THREE.Color(1.0, 0.23, 0.045) },
      uBrightness: { value: 1 },
      uLimb: { value: new THREE.Vector2(...activity.limbDarkening) },
      uDetail: { value: 1 },
      uSpotCount: { value: 0 },
      uSpot: { value: spots },
      uUmbraDT: { value: activity.umbraDT },
      uPenumbraDT: { value: activity.penumbraDT },
      uFaculae: { value: 1 },
      uFaculaDT: { value: activity.faculaDT },
      uFlareCount: { value: 0 },
      uFlare: { value: flares },
      uFlareInfo: { value: flareInfo },
      uFlareTemp: { value: activity.flareTemp },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
  });
}

/** Visual kernel radius (radians on the star). Physical kernels are far smaller. */
export const FLARE_KERNEL_RADIUS = 0.022;
