// Background sky: a point-sprite starfield plus a procedural Milky Way band.
//
// Star directions are drawn uniformly over the sphere and then a second,
// larger population is packed into the galactic plane, which sits about 60°
// from the ecliptic — so the band cuts across the scene at a believable angle.

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

// Ecliptic-frame direction of the north galactic pole, converted to the scene's
// y-up axes. Good enough to put the band where it belongs.
const GALACTIC_POLE = new THREE.Vector3(-0.094, 0.4889, -0.8672).normalize();

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aTwinkle;

uniform float uTime;
uniform float uPixelRatio;
uniform float uSizeScale;

varying vec3 vColor;
varying float vBright;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vColor = aColor;
  // Slow, per-star scintillation.
  vBright = 0.72 + 0.28 * sin(uTime * 1.7 + aTwinkle * 6.2831);

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uSizeScale * uPixelRatio;
  #include <logdepthbuf_vertex>
}
`;

const STAR_FRAG = /* glsl */ `
precision highp float;

varying vec3 vColor;
varying float vBright;

#include <common>
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  // Gaussian core with a faint halo, so bright stars bloom convincingly.
  float core = exp(-r2 * 7.0);
  float halo = exp(-r2 * 1.9) * 0.25;
  gl_FragColor = vec4(vColor * (core + halo) * vBright, 1.0);
}
`;

/** Blackbody-ish star colour from a 0..1 temperature parameter. */
function starColor(t) {
  // t = 0 -> cool red dwarf, 1 -> hot blue-white
  const c = new THREE.Color();
  if (t < 0.5) c.setRGB(1.0, 0.55 + 0.7 * t, 0.35 + 0.9 * t);
  else c.setRGB(1.0 - 0.35 * (t - 0.5), 0.9 - 0.05 * (t - 0.5), 0.85 + 0.3 * (t - 0.5));
  return c;
}

export function createStarfield({ count = 12000, radius = 9000 } = {}) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const twk = new Float32Array(count);

  // Build an orthonormal basis with the galactic pole as the z axis.
  const zAxis = GALACTIC_POLE.clone();
  const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
  const yAxis = zAxis.clone().cross(xAxis).normalize();

  const dir = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const inBand = i % 5 !== 0;      // 4 in 5 stars belong to the galactic disc

    if (inBand) {
      // Concentrate toward the galactic plane: |b| falls off exponentially.
      const lon = Math.random() * Math.PI * 2;
      const b = (Math.random() + Math.random() + Math.random() - 1.5) * 0.30;
      const cb = Math.cos(b), sb = Math.sin(b);
      dir.copy(xAxis).multiplyScalar(cb * Math.cos(lon))
        .addScaledVector(yAxis, cb * Math.sin(lon))
        .addScaledVector(zAxis, sb);
    } else {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      dir.set(s * Math.cos(phi), u, s * Math.sin(phi));
    }
    dir.normalize().multiplyScalar(radius);
    pos[i * 3] = dir.x; pos[i * 3 + 1] = dir.y; pos[i * 3 + 2] = dir.z;

    // Luminosity function: many faint, few brilliant.
    const r = Math.random();
    const mag = Math.pow(r, 4.2);
    size[i] = 0.75 + mag * 4.2;

    const c = starColor(Math.pow(Math.random(), 1.4));
    const b = 0.22 + 0.62 * mag;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;

    twk[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aTwinkle', new THREE.BufferAttribute(twk, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uSizeScale: { value: 1 },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -900;
  return points;
}

// ------------------------------------------------------------- Milky Way ----

const MW_VERT = /* glsl */ `
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const MW_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uPole;
uniform float uIntensity;

varying vec3 vDir;

#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}

void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  float b = dot(d, normalize(uPole));          // sin(galactic latitude)

  // The band itself, plus the central bulge toward the galactic centre.
  float band = exp(-pow(b / 0.16, 2.0));
  float clumps = fbm6(d * 5.5) * 0.5 + 0.5;
  float dust = smoothstep(0.30, 0.75, fbm5(d * 9.0 + 21.0));

  float glow = band * (0.35 + 0.85 * clumps);
  glow *= 1.0 - 0.65 * dust * band;            // dark dust lanes

  vec3 warm = vec3(1.00, 0.90, 0.74);
  vec3 cool = vec3(0.62, 0.72, 1.00);
  vec3 col = mix(cool, warm, clumps);

  // A very faint all-sky wash so the background is never a dead flat black.
  float wash = 0.0035 + 0.010 * (fbm4(d * 2.2 + 7.0) * 0.5 + 0.5);

  gl_FragColor = vec4(col * (glow * 0.055 + wash) * uIntensity, 1.0);
}
`;

export function createMilkyWay(radius = 9600) {
  const geo = new THREE.SphereGeometry(radius, 64, 48);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPole: { value: GALACTIC_POLE.clone() },
      uIntensity: { value: 1.0 },
    },
    vertexShader: MW_VERT,
    fragmentShader: MW_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}
