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
uniform float uFill;      // (capacity − 1) / (filled − 1): fade over what exists
varying float vAge;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float a = pow(clamp(vAge * uFill, 0.0, 1.0), 2.0) * uOpacity;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

// ------------------------------------------------------------------- sky --
// Sky dome for standing on a planet with air: a small inverted sphere around
// the camera, a little beyond the horizon so the ground hides its lower half.
// Brighter toward the horizon (longer path through the air), a glow around
// the star, and a twilight tint when the star is low.

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uUp;
uniform vec3 uStarDir;
uniform vec3 uColor;
uniform vec3 uSunset;
uniform float uStrength;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vWorld - cameraPosition);
  float h = dot(d, uUp);
  float s = dot(uStarDir, uUp);
  float day = smoothstep(-0.12, 0.3, s);
  float air = pow(1.0 - max(h, 0.0), 3.0);
  float around = pow(max(dot(d, uStarDir), 0.0), 10.0);
  float low = smoothstep(-0.2, 0.05, s) * (1.0 - smoothstep(0.0, 0.5, s));
  vec3 col = uColor * (0.22 + 0.78 * air) * day
           + uColor * around * 0.7 * day
           + uSunset * (around * 1.5 + air * 0.4) * low;
  // No cut at the horizon: from a few km up the true horizon dips ~0.04 rad, and
  // the ground (nearer than the dome) hides everything below it anyway.
  gl_FragColor = vec4(col * uStrength, 1.0);
}
`;

export function createSkyDome() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uStarDir: { value: new THREE.Vector3(1, 0, 0) },
      uColor: { value: new THREE.Color() },
      uSunset: { value: new THREE.Color() },
      uStrength: { value: 1 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.visible = false;
  return mesh;
}

// --------------------------------------------------------- conjunction spokes --
// One radial segment per conjunction, from the inner planet's orbit to the
// outer one's, fading over `uLife` simulated days.

const SPOKE_VERT = /* glsl */ `
attribute float aBirth;
attribute vec3 aColor;
uniform float uNow;
uniform float uLife;
varying float vFade;
varying vec3 vColor;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vFade = 1.0 - clamp((uNow - aBirth) / uLife, 0.0, 1.0);
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const SPOKE_FRAG = /* glsl */ `
precision highp float;
varying float vFade;
varying vec3 vColor;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  if (vFade <= 0.0) discard;
  float a = vFade * vFade * 0.85;
  gl_FragColor = vec4(vColor * a, a);
}
`;

export function createConjunctionSpokes(capacity = 3000) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(capacity * 6), 3));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(new Float32Array(capacity * 2).fill(-1e9), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNow: { value: 0 }, uLife: { value: 491 } },
    vertexShader: SPOKE_VERT,
    fragmentShader: SPOKE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.userData = { capacity, next: 0 };
  return lines;
}

// ------------------------------------------------------------- Sun marker --
// The Sun as seen from TRAPPIST-1: a faint (V ≈ 5.3) yellow-white star lying
// exactly along our line of sight — toward Earth.

export function createSunMarker() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(1.0, 0.95, 0.82), size: 3, sizeAttenuation: false,
    transparent: true, opacity: 0.9, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}
