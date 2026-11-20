// The Sun: photosphere, chromosphere, corona and outer glow.
//
// The photosphere is built entirely from mathematical noise evaluated per
// fragment on the GPU:
//   * granulation      — domain-warped cellular noise; bright convection cell
//                        interiors separated by dark intergranular lanes
//   * supergranulation — the same idea two orders of magnitude larger
//   * sunspots         — slow low-frequency noise gated to two latitude belts,
//                        with a dark umbra inside a filamentary penumbra
//   * faculae          — bright magnetic network, visible mostly near the limb
//   * flares           — ridged noise regions driven by a sharp temporal
//                        envelope, which also physically displaces the mesh
//   * limb darkening   — the classic I(mu) = 0.3 + 0.7*mu profile
// The surface also rotates differentially: the equator laps the poles.

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

const SOLAR_COMMON = /* glsl */ `
// Differential rotation. The Sun's equator turns in ~25 days and latitude 60
// in ~31, so the shear is roughly (1 - 0.36 sin^2(lat)).
vec3 solarFrame(vec3 d, float t) {
  float lat = clamp(d.y, -1.0, 1.0);
  float omega = 1.0 - 0.36 * lat * lat;
  return spinY(d, t * omega);
}

// Where and when the surface erupts. A low-frequency field sets the phase so
// neighbouring patches fire at different times; the steep power on sin() makes
// each event a brief flash rather than a steady glow. This part is smooth, so
// it is safe to displace geometry with.
float eruptionEnvelope(vec3 d, float t, float rate) {
  float phaseNoise = fbm3(d * 1.7);
  float envelope = pow(max(sin(t * rate + phaseNoise * 24.0), 0.0), 9.0);
  float region = smoothstep(0.30, 0.85, fbm4(d * 2.9 + 13.0));
  return envelope * region;
}

// The filamentary structure inside an eruption. Fragment stage only — feeding
// this into the vertex displacement would spike the mesh.
float eruptionDetail(vec3 d, float t) {
  return ridged4(d * 6.0 + vec3(0.0, t * 0.08, 0.0));
}
`;

const SUN_VERT = /* glsl */ `
uniform float uTime;
uniform float uDisplace;
uniform float uFlareRate;

varying vec3 vDir;
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vErupt;

#include <common>
#include <logdepthbuf_pars_vertex>
${NOISE_GLSL}
${SOLAR_COMMON}

void main() {
  vec3 d = normalize(position);
  vDir = d;

  vec3 sp = solarFrame(d, uTime * 0.055);
  float erupt = eruptionEnvelope(sp, uTime, uFlareRate);
  vErupt = erupt;

  // Eruptions physically lift the surface. Kept small — a large displacement
  // on a finite mesh reads as a polygon spike rather than a prominence.
  float bulge = 0.055 * erupt + 0.006 * fbm3(sp * 11.0 + uTime * 0.2);
  vec3 displaced = position * (1.0 + uDisplace * bulge);

  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * d);

  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const SUN_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uBrightness;
uniform float uSpotAmount;
uniform float uFlareGain;
uniform float uFlareRate;
uniform float uDetail;          // 1.0 = full quality, 0.0 = cheap
uniform vec3 uColorDeep;
uniform vec3 uColorMid;
uniform vec3 uColorHot;
uniform vec3 uColorFlare;

varying vec3 vDir;
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vErupt;

#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
${SOLAR_COMMON}

void main() {
  #include <logdepthbuf_fragment>

  vec3 d = normalize(vDir);
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float t = uTime;

  vec3 sp = solarFrame(d, t * 0.055);

  // ---------------------------------------------------------- granulation --
  // Convection cells: cellular noise whose sample point is dragged around by a
  // slow fbm flow, so granules stretch, merge and dissolve instead of sitting
  // still. F2-F1 lights the cell interiors and leaves the lanes dark.
  vec3 g = sp * 15.0;
  vec3 flow = vec3(fbm3(g * 0.55 + t * 0.09),
                   fbm3(g * 0.55 + 19.0 - t * 0.07),
                   fbm3(g * 0.55 + 41.0 + t * 0.05));
  vec2 cell = worley(g + 0.85 * flow + vec3(0.0, 0.0, t * 0.22));
  float granule = smoothstep(0.02, 0.55, cell.y - cell.x);
  float lanes = 1.0 - granule;

  float supergran = 0.0;
  if (uDetail > 0.5) {
    vec2 sg = worley(sp * 3.2 + vec3(0.0, 0.0, t * 0.035));
    supergran = smoothstep(0.0, 0.75, sg.y - sg.x);
  }

  float fine = fbm5(sp * 30.0 + vec3(0.0, 0.0, t * 0.5));
  float surface = 0.30 + 0.46 * granule + 0.14 * supergran + 0.22 * fine;

  // ------------------------------------------------------------- sunspots --
  // Active regions cluster in two belts either side of the equator (the
  // butterfly diagram), so a latitude window gates the spot noise. The field
  // is remapped to 0..1 and then thresholded high, which leaves a handful of
  // isolated groups rather than a general mottling.
  float lat = asin(clamp(sp.y, -1.0, 1.0));
  float belt = exp(-pow((abs(lat) - 0.30) / 0.22, 2.0));

  float raw = fbm4(sp * 2.6 + vec3(0.0, 0.0, t * 0.012)) * 1.9 + 0.5
            + 0.22 * fbm3(sp * 6.5 + 5.0);
  float spotN = clamp(raw, 0.0, 1.0) * belt * uSpotAmount;

  float penumbra = smoothstep(0.54, 0.68, spotN);
  float umbra = smoothstep(0.73, 0.86, spotN);

  // Penumbral filaments stream radially out of the umbra.
  float filaments = ridged4(sp * 46.0 + vec3(0.0, 0.0, t * 0.05));
  float penTex = mix(0.38, 0.60, filaments);

  // Umbra runs near 4000 K against a 5800 K photosphere; by Stefan-Boltzmann
  // that is roughly a fifth of the surrounding brightness.
  surface *= mix(1.0, penTex, penumbra - umbra * 0.85);
  surface *= mix(1.0, 0.09, umbra);

  // -------------------------------------------------------- limb darkening --
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float limb = 0.32 + 0.68 * pow(mu, 0.55);

  // ----------------------------------------------------------------- color --
  // The ramp deliberately reaches white only in the hottest granule cores, so
  // the disc keeps its orange body instead of clipping to a flat white ball.
  vec3 col = mix(uColorDeep, uColorMid, smoothstep(0.06, 0.66, surface));
  col = mix(col, uColorHot, smoothstep(0.74, 1.20, surface));
  col *= limb;

  // Faculae: the bright magnetic network in the lanes, whose contrast reverses
  // near the limb and becomes visible there.
  float facula = lanes * pow(1.0 - mu, 1.7) * (0.35 + 0.65 * smoothstep(0.2, 0.6, spotN));
  col += uColorHot * facula * 0.30;

  // ---------------------------------------------------------------- flares --
  float erupt = eruptionEnvelope(sp, t, uFlareRate);
  float flare = pow(erupt, 1.2) * (0.30 + 0.9 * eruptionDetail(sp, t))
              * (0.55 + 0.55 * ridged5(sp * 6.5 + vec3(0.0, t * 0.4, 0.0)));
  col += uColorFlare * flare * uFlareGain * 6.0;

  // Hot floor so the disc never reads as flat black anywhere.
  col = max(col, uColorDeep * 0.25 * limb);

  gl_FragColor = vec4(col * uBrightness, 1.0);
}
`;

export function createSunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDisplace: { value: 1.0 },
      uBrightness: { value: 2.4 },
      uSpotAmount: { value: 1.0 },
      uFlareGain: { value: 1.0 },
      uFlareRate: { value: 0.45 },
      uDetail: { value: 1.0 },
      uColorDeep: { value: new THREE.Color(0.22, 0.045, 0.006) },
      uColorMid: { value: new THREE.Color(1.0, 0.46, 0.06) },
      uColorHot: { value: new THREE.Color(1.0, 0.88, 0.55) },
      uColorFlare: { value: new THREE.Color(1.0, 0.82, 0.5) },
    },
    vertexShader: SUN_VERT,
    fragmentShader: SUN_FRAG,
  });
}

// ------------------------------------------------------- chromosphere shell --

const SHELL_VERT = /* glsl */ `
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

const CHROMO_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;

varying vec3 vDir;
varying vec3 vNormalW;
varying vec3 vPosW;

#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
${SOLAR_COMMON}

void main() {
  #include <logdepthbuf_fragment>

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.6);

  // Spicules: a dense forest of thin jets, so high-frequency ridged noise.
  vec3 sp = solarFrame(normalize(vDir), uTime * 0.055);
  float spicules = ridged4(sp * 60.0 + vec3(0.0, uTime * 0.9, 0.0));

  // Prominences arch off the limb and last far longer than a flare.
  float loops = pow(ridged5(sp * 7.0 + vec3(0.0, uTime * 0.05, 0.0)), 3.0);
  float promEnv = smoothstep(0.35, 0.9, fbm3(sp * 2.2 + uTime * 0.02));

  float a = rim * (0.35 + 0.6 * spicules + 2.4 * loops * promEnv) * uIntensity;
  gl_FragColor = vec4(uColor * a, 1.0);
}
`;

export function createChromosphereMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uColor: { value: new THREE.Color(1.0, 0.24, 0.10) },
    },
    vertexShader: SHELL_VERT,
    fragmentShader: CHROMO_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// ------------------------------------------------------------------ corona --
//
// Drawn as a camera-facing quad rather than a shell. A shell large enough to
// hold a realistic corona ends up enclosing the camera as soon as you fly in
// close, and back-face culling then makes it vanish. The quad has no inside,
// and since the corona is optically thin a view-aligned sheet is a fair model
// of it anyway. Radius and latitude are still computed from world positions,
// so polar coronal holes stay locked to the Sun's real rotation axis.

const CORONA_VERT = /* glsl */ `
varying vec3 vPosW;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const CORONA_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uIntensity;
uniform vec3 uColorInner;
uniform vec3 uColorOuter;
uniform vec3 uCenter;
uniform float uSunRadius;
uniform vec3 uAxis;

varying vec3 vPosW;

#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}

void main() {
  #include <logdepthbuf_fragment>

  vec3 rel = vPosW - uCenter;
  float dist = length(rel);
  float r = dist / max(uSunRadius, 1e-9);        // radius in solar radii
  if (r < 1.002) discard;                        // never paint over the disc

  vec3 dir = rel / max(dist, 1e-9);
  float sinLat = dot(dir, normalize(uAxis));

  // K + F corona brightness profile: steep near the limb, with a shallow tail
  // that carries the outer streamers.
  float base = 0.9 * pow(1.0 / r, 3.2) + 0.05 * pow(1.0 / r, 1.3);

  // Streamers. Using log(r) as the third noise coordinate stretches structure
  // radially, the way magnetic field lines draw plasma outward.
  vec3 q = dir * 3.4 + vec3(0.0, 0.0, log(r) * 0.7 + uTime * 0.02);
  float fil = pow(ridged5(q), 2.4);

  // Helmet streamers crowd the equator; coronal holes open over the poles.
  float eq = mix(0.20, 1.0, 1.0 - abs(sinLat));
  float holes = 1.0 - 0.72 * smoothstep(0.55, 0.92, abs(sinLat));

  float a = base * (0.30 + 1.5 * fil * eq) * holes;
  a *= 1.0 - smoothstep(0.80, 1.0, r / 8.0);     // fade out at the quad edge

  vec3 col = mix(uColorInner, uColorOuter, clamp((r - 1.0) / 4.0, 0.0, 1.0));
  gl_FragColor = vec4(col * a * uIntensity, 1.0);
}
`;

/** Half-width of the corona quad, in solar radii. */
export const CORONA_EXTENT = 8;

export function createCoronaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.0 },
      uColorInner: { value: new THREE.Color(1.0, 0.72, 0.40) },
      uColorOuter: { value: new THREE.Color(0.85, 0.66, 0.55) },
      uCenter: { value: new THREE.Vector3() },
      uSunRadius: { value: 1 },
      uAxis: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: CORONA_VERT,
    fragmentShader: CORONA_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
