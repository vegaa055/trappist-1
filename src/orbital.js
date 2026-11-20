// Two-body orbital mechanics: elements <-> state vectors.
//
// Everything here works in the heliocentric ecliptic frame with x toward the
// vernal equinox and z toward ecliptic north. `sceneFromEcliptic` rotates that
// into three.js' y-up convention at the very end.

import { DEG } from './constants.js';

/** Solve Kepler's equation M = E - e sin E by Newton-Raphson. */
export function solveKepler(M, e) {
  // Wrap to [-pi, pi] so the starting guess is always in the right basin.
  let m = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = e < 0.8 ? m + e * Math.sin(m) : Math.PI * Math.sign(m || 1);
  for (let k = 0; k < 80; k++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/**
 * Rotation matrix taking perifocal coordinates into the reference plane.
 * R = Rz(node) * Rx(inc) * Rz(argp), returned as the two columns we need.
 */
export function perifocalBasis(incRad, nodeRad, argpRad) {
  const cO = Math.cos(nodeRad), sO = Math.sin(nodeRad);
  const ci = Math.cos(incRad), si = Math.sin(incRad);
  const cw = Math.cos(argpRad), sw = Math.sin(argpRad);
  return {
    // unit vector toward periapsis
    p: [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si],
    // unit vector 90° ahead of periapsis in the orbit plane
    q: [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si],
  };
}

/**
 * Classical elements -> position and velocity.
 * @param {number} mu  G*(M_central + M_body), AU^3/day^2
 * @returns {{r: number[], v: number[]}} in AU and AU/day
 */
export function elementsToState(mu, a, e, incDeg, nodeDeg, argpDeg, meanAnomDeg) {
  const E = solveKepler(meanAnomDeg * DEG, e);
  const cosE = Math.cos(E), sinE = Math.sin(E);
  const beta = Math.sqrt(1 - e * e);

  // Perifocal position
  const xp = a * (cosE - e);
  const yp = a * beta * sinE;

  // Perifocal velocity: differentiate with dE/dt = n / (1 - e cos E)
  const n = Math.sqrt(mu / (a * a * a));
  const Edot = n / (1 - e * cosE);
  const vxp = -a * sinE * Edot;
  const vyp = a * beta * cosE * Edot;

  const { p, q } = perifocalBasis(incDeg * DEG, nodeDeg * DEG, argpDeg * DEG);
  return {
    r: [p[0] * xp + q[0] * yp, p[1] * xp + q[1] * yp, p[2] * xp + q[2] * yp],
    v: [p[0] * vxp + q[0] * vyp, p[1] * vxp + q[1] * vyp, p[2] * vxp + q[2] * vyp],
  };
}

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.sqrt(dot(a, a));

/**
 * State vector -> osculating elements. Used for the drawn orbit ellipses and
 * for the readouts in the info panel, so it reflects the *integrated* state
 * including perturbations, not the static J2000 values.
 */
export function stateToElements(mu, rv, vv) {
  const r = norm(rv);
  const v2 = dot(vv, vv);
  const h = cross(rv, vv);
  const hMag = norm(h);

  const energy = v2 / 2 - mu / r;
  const a = -mu / (2 * energy);

  // Eccentricity vector
  const rDotV = dot(rv, vv);
  const ev = [
    (v2 - mu / r) * rv[0] / mu - rDotV * vv[0] / mu,
    (v2 - mu / r) * rv[1] / mu - rDotV * vv[1] / mu,
    (v2 - mu / r) * rv[2] / mu - rDotV * vv[2] / mu,
  ];
  const e = norm(ev);

  const inc = Math.acos(Math.min(1, Math.max(-1, h[2] / hMag)));

  // Node vector n = z_hat x h
  const nv = [-h[1], h[0], 0];
  const nMag = norm(nv);

  let node = 0;
  if (nMag > 1e-12) {
    node = Math.acos(Math.min(1, Math.max(-1, nv[0] / nMag)));
    if (nv[1] < 0) node = 2 * Math.PI - node;
  }

  let argp = 0;
  if (nMag > 1e-12 && e > 1e-9) {
    argp = Math.acos(Math.min(1, Math.max(-1, dot(nv, ev) / (nMag * e))));
    if (ev[2] < 0) argp = 2 * Math.PI - argp;
  } else if (e > 1e-9) {
    argp = Math.atan2(ev[1], ev[0]);
  }

  // True anomaly -> eccentric -> mean. Near-circular orbits have no defined
  // periapsis, so fall back to the argument of latitude (argp is 0 there).
  let nu;
  if (e > 1e-9) {
    nu = Math.acos(Math.min(1, Math.max(-1, dot(ev, rv) / (e * r))));
    if (rDotV < 0) nu = 2 * Math.PI - nu;
  } else if (nMag > 1e-12) {
    nu = Math.acos(Math.min(1, Math.max(-1, dot(nv, rv) / (nMag * r))));
    if (rv[2] < 0) nu = 2 * Math.PI - nu;
  } else {
    nu = Math.atan2(rv[1], rv[0]);
  }

  let M = 0;
  if (e < 1) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    M = E - e * Math.sin(E);
  }

  const period = a > 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;

  return {
    a, e, inc, node, argp, nu, M, period,
    periapsis: a * (1 - e),
    apoapsis: a * (1 + e),
    speed: Math.sqrt(v2),
    radius: r,
  };
}

/**
 * Sample a full osculating ellipse as a flat Float32Array of xyz triples,
 * relative to the focus. Returns null for unbound orbits.
 */
export function sampleOrbitEllipse(mu, rv, vv, segments = 512) {
  const el = stateToElements(mu, rv, vv);
  if (!(el.a > 0) || el.e >= 1 || !isFinite(el.a)) return null;

  const { p, q } = perifocalBasis(el.inc, el.node, el.argp);
  const beta = Math.sqrt(1 - el.e * el.e);
  const out = new Float32Array((segments + 1) * 3);

  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * 2 * Math.PI;
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = el.a * beta * Math.sin(E);
    out[i * 3 + 0] = p[0] * xp + q[0] * yp;
    out[i * 3 + 1] = p[1] * xp + q[1] * yp;
    out[i * 3 + 2] = p[2] * xp + q[2] * yp;
  }
  return { points: out, elements: el };
}

/**
 * Basis of a planet's equatorial plane expressed in ecliptic coordinates:
 * M = Rz(node) * Rx(obliquity). Column 3 is the spin axis.
 */
export function equatorialBasis(nodeDeg, tiltDeg) {
  const cO = Math.cos(nodeDeg * DEG), sO = Math.sin(nodeDeg * DEG);
  const ct = Math.cos(tiltDeg * DEG), st = Math.sin(tiltDeg * DEG);
  return {
    x: [cO, sO, 0],
    y: [-sO * ct, cO * ct, st],
    z: [sO * st, -cO * st, ct],   // spin axis / orbital pole of regular moons
  };
}

/** Apply a 3x3 basis (as column vectors) to an ecliptic-frame triple. */
export function applyBasis(basis, v) {
  return [
    basis.x[0] * v[0] + basis.y[0] * v[1] + basis.z[0] * v[2],
    basis.x[1] * v[0] + basis.y[1] * v[1] + basis.z[1] * v[2],
    basis.x[2] * v[0] + basis.y[2] * v[1] + basis.z[2] * v[2],
  ];
}

/**
 * Ecliptic (z-up) -> three.js scene (y-up). This is a pure rotation of -90°
 * about x, so it preserves handedness and therefore orbital direction.
 */
export function sceneFromEcliptic(v, out) {
  const x = v[0], y = v[1], z = v[2];
  if (out) { out.set(x, z, -y); return out; }
  return [x, z, -y];
}
