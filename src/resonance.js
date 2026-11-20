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
