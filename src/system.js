// Initial conditions for the N-body integrator, from Agol et al. 2021.
//
// Agol's Table 2 gives, per planet, an osculating *Jacobi* orbit at the epoch
// BJD 2457257.93115525: period P, the time t0 of a transit near the epoch,
// and e·cos ω, e·sin ω. Jacobi coordinates put each planet on an orbit about
// the barycentre of the star plus every planet inside it, with
// μ = G·(M★ + Σ inner masses + m). Turning those into Cartesian states is a
// running barycentre walk outward through the chain.
//
// Frames. The elements live in the sky frame: X, Y in the plane of the sky,
// Z AWAY from the observer, so a planet transits at ω + f = −90°. Node
// longitudes are not constrained by transits; Agol treats the orbits as
// aligned, so Ω = 0 for all. We then rotate so the orbital plane is horizontal:
//     x_sys = X_sky,  y_sys = −Z_sky (toward Earth),  z_sys = Y_sky
// Earth's direction is exactly +y_sys, and the 0.1–0.3° spread in inclination
// survives as genuine tilt between the orbits.

import { G, DEG, AGOL_EPOCH, AGOL_EPOCH_JD, AU_KM } from './constants.js';
import { STAR, PLANETS, BODY_BY_ID } from './data.js';
import { elementsToState } from './orbital.js';
import { NBodySystem } from './physics.js';

/** Direction toward the Solar System, in the system frame. */
export const EARTH_DIR = [0, 1, 0];

export function julianDayNow() {
  return Date.now() / 86400000 + 2440587.5;
}

const skyToSystem = (v) => [v[0], -v[2], v[1]];

/**
 * Mean anomaly at the epoch from a transit time t0.
 *
 * Convention check: with the observer on +Z (Winn 2010) the outer planets show
 * TTVs of several hours and d misses its observed transit by 4 h. With the
 * observer on −Z — equivalent to ω → ω + 180° — TTVs fall to the observed tens
 * of minutes and d lands within 2σ. tools/verify-transits.mjs runs that check.
 */
function meanAnomalyAtEpoch(P, t0, e, w) {
  const fTransit = -Math.PI / 2 - w;
  const E = 2 * Math.atan2(
    Math.sqrt(1 - e) * Math.sin(fTransit / 2),
    Math.sqrt(1 + e) * Math.cos(fTransit / 2),
  );
  const Mtr = E - e * Math.sin(E);
  return Mtr + (2 * Math.PI / P) * (AGOL_EPOCH - t0);
}

/** Cartesian states for star + planets at the Agol epoch, in the system frame. */
export function agolInitialStates() {
  const states = [{ id: STAR.id, mass: STAR.mass, r: [0, 0, 0], v: [0, 0, 0] }];

  // Barycentre of everything interior to the planet being placed.
  let mIn = STAR.mass;
  const com = [0, 0, 0];
  const comV = [0, 0, 0];

  for (const p of PLANETS) {
    const { P, t0, ecosw, esinw } = p.agol;
    const m = p.mass;
    const mu = G * (mIn + m);
    const a = Math.cbrt(mu * P * P / (4 * Math.PI * Math.PI));
    const e = Math.hypot(ecosw, esinw);
    const w = Math.atan2(esinw, ecosw);
    const M = meanAnomalyAtEpoch(P, t0, e, w);

    const s = elementsToState(mu, a, e, p.inc, 0, w / DEG, M / DEG);
    const r = [com[0] + s.r[0], com[1] + s.r[1], com[2] + s.r[2]];
    const v = [comV[0] + s.v[0], comV[1] + s.v[1], comV[2] + s.v[2]];

    states.push({ id: p.id, mass: m, r, v });

    for (let k = 0; k < 3; k++) {
      com[k] = (mIn * com[k] + m * r[k]) / (mIn + m);
      comV[k] = (mIn * comV[k] + m * v[k]) / (mIn + m);
    }
    mIn += m;
  }

  return states.map((s) => ({ ...s, r: skyToSystem(s.r), v: skyToSystem(s.v) }));
}

/** A fresh integrator at the Agol epoch. `nbody.time` counts days from it. */
export function buildSystem() {
  const nbody = new NBodySystem(agolInitialStates());
  return { nbody, epochJD: AGOL_EPOCH_JD, bodies: [STAR, ...PLANETS] };
}

/**
 * Integrate forward to `targetJD` in slices, yielding to the browser between
 * them so a progress bar can update. There is no Keplerian shortcut here: the
 * planets' mutual tugs over the intervening years are part of the state.
 */
export async function advanceTo(sim, targetJD, { dt, onProgress, budgetMs = 120 } = {}) {
  const total = targetJD - (sim.epochJD + sim.nbody.time);
  if (total <= 0) return;
  let done = 0;
  // Work in small pieces against a wall-clock budget, then yield once. Yields
  // are what browsers throttle (to ~1 s in background tabs), so there should
  // be few of them, not one per fixed slice of simulated time.
  while (done < total) {
    const start = performance.now();
    while (done < total && performance.now() - start < budgetMs) {
      const chunk = Math.min(5, total - done);
      sim.nbody.advance(chunk, dt);
      done += chunk;
    }
    onProgress?.(done / total);
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** μ for a planet's two-body orbit about the star (astrocentric elements). */
export function primaryMu(body) {
  return G * (STAR.mass + body.mass);
}

export function radiusAU(body) {
  return body.radiusKm / AU_KM;
}

export { BODY_BY_ID };
