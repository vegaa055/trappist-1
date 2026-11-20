// Transit geometry in the system frame, where Earth lies along +y.
//
// A planet is in front of the star when its y relative to the star is positive;
// its sky-projected separation is then the distance in the x–z plane. Mid-
// transit is the minimum of that separation, i.e. the zero of
//     g(t) = x·vx + z·vz,
// crossing from negative to positive (the same criterion TTVFast uses).
// Refining one Newton step with g' ≈ vx² + vz² puts the time to well under a
// second.

import { AU_KM } from './constants.js';
import { STAR, PLANETS } from './data.js';

const R_STAR_AU = STAR.radiusKm / AU_KM;

/** Sky-plane state of planet `id` relative to the star. */
export function skyState(nbody, id, out = {}) {
  const i = nbody.index[id] * 3;
  const s = nbody.index[STAR.id] * 3;
  const x = nbody.pos[i] - nbody.pos[s];
  const y = nbody.pos[i + 1] - nbody.pos[s + 1];
  const z = nbody.pos[i + 2] - nbody.pos[s + 2];
  const vx = nbody.vel[i] - nbody.vel[s];
  const vz = nbody.vel[i + 2] - nbody.vel[s + 2];
  out.front = y > 0;
  out.sep = Math.hypot(x, z);
  out.g = x * vx + z * vz;
  out.gdot = vx * vx + vz * vz;
  return out;
}

/**
 * Watches the integrator step by step and records mid-transit times.
 * Call `sample(nbody)` after every integrator step.
 */
export class TransitDetector {
  constructor(planets = PLANETS) {
    this.planets = planets;
    this.prevG = new Map();
    this.times = new Map(planets.map((p) => [p.id, []]));
    this.listeners = [];
    this._s = {};
  }

  sample(nbody, epochJD = 0) {
    for (const p of this.planets) {
      const st = skyState(nbody, p.id, this._s);
      const prev = this.prevG.get(p.id);
      this.prevG.set(p.id, st.g);
      if (prev === undefined || !st.front) continue;
      if (prev < 0 && st.g >= 0) {
        // Must actually cross the disc (grazing included).
        const rp = p.radiusKm / AU_KM;
        if (st.sep > R_STAR_AU + rp) continue;
        const t = nbody.time - st.g / st.gdot;
        this.times.get(p.id).push(t);
        for (const fn of this.listeners) fn(p.id, t + epochJD);
      }
    }
  }
}

/** Least-squares linear ephemeris through a list of transit times. */
export function fitEphemeris(times) {
  const n = times.length;
  if (n < 2) return null;
  // Epoch numbers from the first transit and a rough period.
  const P0 = (times[n - 1] - times[0]) / Math.max(1, n - 1);
  const E = times.map((t) => Math.round((t - times[0]) / P0));
  let sE = 0, sT = 0, sEE = 0, sET = 0;
  for (let i = 0; i < n; i++) { sE += E[i]; sT += times[i]; sEE += E[i] * E[i]; sET += E[i] * times[i]; }
  const P = (n * sET - sE * sT) / (n * sEE - sE * sE);
  const T0 = (sT - P * sE) / n;
  const resid = times.map((t, i) => t - (T0 + P * E[i]));
  const amp = (Math.max(...resid) - Math.min(...resid)) / 2;
  return { P, T0, epochs: E, resid, amplitude: amp };
}

export { R_STAR_AU };
