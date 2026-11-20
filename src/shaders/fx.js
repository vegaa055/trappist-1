// Small effect materials: the star's glow, the habitable-zone band, trails.

import * as THREE from 'three';

// ------------------------------------------------------------------ glow --
// Camera-facing quad around the star. An ultracool dwarf has no solar-type
// white corona to speak of; this is the scattered-light halo the eye (and the
// bloom pass) would add, kept deliberately tight and red.

const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const GLOW_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uExtent;      // quad half-size in stellar radii
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vUv) * uExtent;       // in stellar radii
  if (r < 0.98) discard;                 // the disc itself is drawn by the star
  float x = r - 1.0;
  float halo = 0.55 * exp(-x * 6.0) + 0.22 * exp(-x * 1.2) + 0.05 / (1.0 + x * x);
  halo *= smoothstep(uExtent, uExtent * 0.7, r);
  vec3 col = uColor * halo * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const GLOW_EXTENT = 7;

export function createGlowMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 1 },
      uExtent: { value: GLOW_EXTENT },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// --------------------------------------------------------- habitable zone --
// A flat annulus in the orbital plane. Radii are in AU; the mesh is scaled to
// scene units. The conservative zone (runaway → maximum greenhouse) is drawn
// solid, the optimistic extension (recent Venus, early Mars) as faint wings.

const HZ_VERT = /* glsl */ `
varying vec2 vLocal;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vLocal = position.xy;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const HZ_FRAG = /* glsl */ `
precision highp float;
uniform float uOptIn, uConsIn, uConsOut, uOptOut;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vLocal;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  // e, f and g orbit inside the band; fade it near the camera so it does not
  // slice across a planet you are looking at up close.
  float near = smoothstep(1.5, 9.0, distance(cameraPosition, vWorld));
  float r = length(vLocal);
  float w = fwidth(r);
  float cons = smoothstep(uConsIn - w, uConsIn + w, r) * (1.0 - smoothstep(uConsOut - w, uConsOut + w, r));
  float opt = smoothstep(uOptIn - w, uOptIn + w, r) * (1.0 - smoothstep(uOptOut - w, uOptOut + w, r));
  // Bright rims at the conservative edges so the boundary reads at any zoom.
  float rim = exp(-pow((r - uConsIn) / (w * 2.5), 2.0)) + exp(-pow((r - uConsOut) / (w * 2.5), 2.0));
  float a = (cons * 0.16 + (opt - cons) * 0.06 + rim * 0.35) * uOpacity * near;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

export function createHabitableZone(hz) {
  const geo = new THREE.RingGeometry(hz.recentVenus.au * 0.98, hz.earlyMars.au * 1.02, 256, 4);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uOptIn: { value: hz.recentVenus.au },
      uConsIn: { value: hz.runawayGreenhouse.au },
      uConsOut: { value: hz.maxGreenhouse.au },
      uOptOut: { value: hz.earlyMars.au },
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color('#5fe0a0') },
    },
    vertexShader: HZ_VERT,
    fragmentShader: HZ_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    extensions: { derivatives: true },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;       // into the horizontal orbital plane
  mesh.renderOrder = 2;
  return mesh;
}

// ----------------------------------------------------------------- trails --

export const TRAIL_VERT = /* glsl */ `
attribute float aAge;
varying float vAge;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vAge = aAge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const TRAIL_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAge;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float a = pow(clamp(vAge, 0.0, 1.0), 2.0) * uOpacity;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;
