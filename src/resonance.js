// Live diagnostics of the resonant chain, read from the integrated state.
//
// Mean longitudes are astrocentric osculating values in the system frame.
// The Laplace angles φ = p·λ₁ − (p+q)·λ₂ + q·λ₃ are what librate in a resonant
// chain; plotting them over time (Phase 5) shows the chain holding together.
//
// Period ratios use the *osculating* periods, so they wobble on the ~500-day
// TTV cycle — that wobble is the resonance at work, not noise.

import { PLANETS, LAPLACE_TRIPLETS, PERIOD_RATIO_NOMINAL } from './data.js';
import { stateToElements } from './orbital.js';
import { primaryMu } from './system.js';

const wrap180 = (deg) => ((deg % 360) + 540) % 360 - 180;

export function osculating(nbody) {
  const out = {};
  const r = [0, 0, 0], v = [0, 0, 0];
  for (const p of PLANETS) {
    nbody.relativePosition(p.id, 'star', r);
    nbody.relativeVelocity(p.id, 'star', v);
    // The orbit normal is ≈ −z in the system frame; rotate 180° about x so the
    // orbits are prograde and λ increases along the motion.
    r[1] = -r[1]; r[2] = -r[2];
    v[1] = -v[1]; v[2] = -v[2];
    const el = stateToElements(primaryMu(p), r, v);
    out[p.id] = {
      ...el,
      lambda: (el.node + el.argp + el.M) * 180 / Math.PI,
    };
  }
  return out;
}

/**
 * The conjunction pattern speed. No pair sits exactly on its commensurability,
 * so the longitudes where neighbours line up creep forward — and for every
 * pair at nearly the same rate, once per ~491 days (measured from this
 * integration: 484–501 d across the six pairs; Agol+ 2021 give the TTV
 * super-period as 491 ± 5 d). In a frame turning at this rate each pair's
 * conjunctions fall on fixed spokes.
 */
export const PATTERN_PERIOD = 491;

/**
 * Watches neighbouring pairs for conjunctions (inner planet overtaking the
 * outer one, as seen from the star). For a pair near p:q, successive
 * conjunctions land at only p − q longitudes — 3 for b–c (8:5), 2 for c–d
 * (5:3), 1 for the 3:2 and 4:3 pairs — and those longitudes all drift
 * together at the pattern speed. Call sample() after every integrator step.
 */
export class ConjunctionTracker {
  constructor(onConjunction) {
    this.onConjunction = onConjunction;
    this.prev = new Array(PLANETS.length - 1).fill(null);
  }

  sample(nbody) {
    const s = nbody.index.star * 3;
    const pos = nbody.pos;
    const az = PLANETS.map((p) => {
      const i = nbody.index[p.id] * 3;
      return Math.atan2(pos[i + 1] - pos[s + 1], pos[i] - pos[s]);
    });
    for (let k = 0; k < PLANETS.length - 1; k++) {
      let d = az[k] - az[k + 1];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const prev = this.prev[k];
      this.prev[k] = d;
      // Orbits run clockwise about +z in the system frame, so the faster
      // inner planet's lead goes from positive through zero at conjunction.
      if (prev !== null && prev > 0 && d <= 0 && prev < 1) {
        const i = nbody.index[PLANETS[k].id] * 3;
        // Direction in scene coordinates: scene (x, z) = system (x, y).
        this.onConjunction(k, pos[i] - pos[s], pos[i + 1] - pos[s + 1], nbody.time);
      }
    }
  }
}

export function resonanceState(nbody) {
  const el = osculating(nbody);
  const ratios = PERIOD_RATIO_NOMINAL.map(({ ids: [a, b], label, value }) => {
    const r = el[b].period / el[a].period;
    return { pair: `${a}–${b}`, label, nominal: value, ratio: r, offset: r / value - 1 };
  });
  const laplace = LAPLACE_TRIPLETS.map(({ ids: [i, j, k], p, q }) => ({
    triplet: `${i}${j}${k}`,
    p, q,
    phi: wrap180(p * el[i].lambda - (p + q) * el[j].lambda + q * el[k].lambda),
  }));
  return { elements: el, ratios, laplace };
}
