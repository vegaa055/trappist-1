// Planetary rings.
//
// The radial optical-depth profile is procedural, not a texture: broad C/B/A
// structure with the Cassini division between B and A, the narrow Encke and
// Keeler gaps carved out of the A ring, and fbm ringlet structure on top.
// The same density function is shared with the planet shader so the rings can
// cast a correctly-structured shadow onto the globe below them.

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

export const RING_DENSITY_GLSL = /* glsl */ `
// t: normalised radius across the ring span, 0 at the inner edge, 1 at the
// outer. uSaturnProfile blends between Saturn's structure and a plain,
// featureless band used for the faint Jovian and Uranian rings.
float ringDensity(float t, float saturnProfile) {
  if (t < 0.0 || t > 1.0) return 0.0;

  float d = 0.30 * smoothstep(0.00, 0.05, t) * (1.0 - smoothstep(0.15, 0.23, t)); // C ring
  d += 1.00 * smoothstep(0.21, 0.27, t) * (1.0 - smoothstep(0.59, 0.655, t));     // B ring
  d += 0.07 * smoothstep(0.60, 0.63, t) * (1.0 - smoothstep(0.68, 0.70, t));      // Cassini division
  d += 0.58 * smoothstep(0.70, 0.735, t) * (1.0 - smoothstep(0.955, 0.99, t));    // A ring
  d += 0.05 * smoothstep(0.99, 1.00, t) * (1.0 - smoothstep(1.00, 1.02, t));      // F ring

  // Encke and Keeler gaps, swept clear by embedded moonlets.
  d *= 1.0 - 0.92 * exp(-pow((t - 0.885) / 0.009, 2.0));
  d *= 1.0 - 0.80 * exp(-pow((t - 0.945) / 0.004, 2.0));

  // Ringlet banding at two scales.
  d *= 0.70 + 0.55 * fbm5(vec3(t * 240.0, 3.0, 0.0));
  d *= 0.82 + 0.34 * fbm4(vec3(t * 41.0, 17.0, 0.0));

  float plain = smoothstep(0.02, 0.10, t) * (1.0 - smoothstep(0.90, 0.99, t))
              * (0.55 + 0.5 * fbm4(vec3(t * 90.0, 5.0, 0.0)));

  return clamp(mix(plain, d, saturnProfile), 0.0, 1.5);
}
`;

const RING_VERT = /* glsl */ `
varying float vRadius;
varying vec3 vPosW;
varying vec3 vNormalW;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  // RingGeometry lies in the local XY plane; the mesh is rotated into the
  // planet's equatorial plane by the scene graph.
  vRadius = length(position.xy);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const RING_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uSunPos;
uniform vec3 uPlanetPos;
uniform float uPlanetRadius;    // scene units, equatorial
uniform float uInner;           // scene units
uniform float uOuter;
uniform float uOpacity;
uniform float uSaturnProfile;
uniform vec3 uColorIn;
uniform vec3 uColorOut;
uniform float uSunFalloff;
uniform float uUnitsPerAU;

varying float vRadius;
varying vec3 vPosW;
varying vec3 vNormalW;

#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
${RING_DENSITY_GLSL}

void main() {
  #include <logdepthbuf_fragment>

  float t = (vRadius - uInner) / max(uOuter - uInner, 1e-6);
  float density = ringDensity(t, uSaturnProfile);
  if (density <= 0.001) discard;

  vec3 V = normalize(cameraPosition - vPosW);
  vec3 N = normalize(vNormalW);
  vec3 toSun = uSunPos - vPosW;
  float sunDist = length(toSun);
  vec3 L = toSun / sunDist;

  // Grazing views look through more material, so the sheet thickens.
  float ndv = max(abs(dot(N, V)), 0.06);
  float tau = density / ndv;
  float alpha = 1.0 - exp(-tau * 2.2);

  // --- shadow of the planet on the rings -----------------------------------
  vec3 rel = uPlanetPos - vPosW;
  float along = dot(rel, L);
  float shadow = 1.0;
  if (along > 0.0) {
    float perp = length(rel - along * L);
    shadow = smoothstep(uPlanetRadius * 0.92, uPlanetRadius * 1.10, perp);
  }

  // --- illumination --------------------------------------------------------
  // Ring particles both reflect toward the Sun and forward-scatter, so the
  // unlit face still glows where you look through the ring toward the Sun.
  float lambert = abs(dot(N, L));
  float forward = pow(max(dot(-V, L), 0.0), 8.0);
  float lit = shadow * (0.55 * lambert + 0.9 * forward * (1.0 - exp(-tau)));

  float au = sunDist / uUnitsPerAU;
  lit *= pow(1.0 / max(au, 0.05), uSunFalloff);

  vec3 col = mix(uColorIn, uColorOut, clamp(t * 1.15, 0.0, 1.0));
  col = mix(col, col * vec3(1.08, 1.02, 0.92), fbm4(vec3(t * 60.0, 7.0, 0.0)) * 0.5 + 0.5);

  gl_FragColor = vec4(col * lit * 2.0, clamp(alpha * uOpacity, 0.0, 1.0));
}
`;

export function createRingMaterial(opts) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPos: { value: new THREE.Vector3() },
      uPlanetPos: { value: new THREE.Vector3() },
      uPlanetRadius: { value: 1 },
      uInner: { value: opts.inner },
      uOuter: { value: opts.outer },
      uOpacity: { value: opts.opacity ?? 1 },
      uSaturnProfile: { value: opts.saturnProfile ?? 0 },
      uColorIn: { value: new THREE.Color(opts.colorIn) },
      uColorOut: { value: new THREE.Color(opts.colorOut) },
      uSunFalloff: { value: 0.35 },
      uUnitsPerAU: { value: 50 },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
