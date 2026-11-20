// Synthetic photometry: the light curve an observer on Earth would record.
//
// Sampled once per integrator step (every 5.76 simulated minutes), so even
// b's 36-minute transit is resolved at any time rate. Each sample is
//
//     F = 1 − Σ transits − spot dimming + flare light
//
//   transits  true planet and star radii (never the enlarged drawn ones),
//             sky-plane separation from the N-body state, exact circle-overlap
//             area at ingress/egress, quadratic limb darkening at the chord.
//   spots     the visible spot population at the star's rotation angle then.
//   flares    every flare (including ones not drawn) with its physical time
//             profile, weighted by how squarely it faces Earth.
//
// Flares are added one frame late: the activity model spawns this frame's
// flares after the integrator has stepped, so samples wait in `pending` until
// commit() can include them.

import { AU_KM } from './constants.js';
import { STAR, PLANETS } from './data.js';

export const BANDS = {
  vis: { id: 'vis', label: 'visible · 0.6 µm', lambda: 0.6, ld: [0.55, 0.25] },
  nir: { id: 'nir', label: 'near-IR · 1.5 µm', lambda: 1.5, ld: [0.30, 0.25] },
};

const R_STAR = STAR.radiusKm / AU_KM;
const P_RATIO = PLANETS.map((p) => p.radiusKm / AU_KM / R_STAR);

/** Fraction of a disc of radius p, centred z from the origin, inside the unit disc. */
export function overlapFraction(z, p) {
  if (z >= 1 + p) return 0;
  if (z <= 1 - p) return 1;
  const k0 = Math.acos(Math.min(1, Math.max(-1, (z * z + p * p - 1) / (2 * z * p))));
  const k1 = Math.acos(Math.min(1, Math.max(-1, (z * z + 1 - p * p) / (2 * z))));
  const sq = Math.sqrt(Math.max(0, (-z + p + 1) * (z + p - 1) * (z - p + 1) * (z + p + 1)));
  return (p * p * k0 + k1 - 0.5 * sq) / (Math.PI * p * p);
}

/** Depth of one transit: blocked area × local / mean surface brightness. */
export function transitDepth(z, p, [u1, u2]) {
  const f = overlapFraction(z, p);
  if (f <= 0) return 0;
  // Evaluate limb darkening at the middle of the covered chord.
  const r = f >= 1 ? z : Math.min(z, 1 - 0.5 * p * f);
  const mu = Math.sqrt(Math.max(0, 1 - r * r));
  const om = 1 - mu;
  const I = 1 - u1 * om - u2 * om * om;
  return p * p * f * I / (1 - u1 / 3 - u2 / 6);
}

export class Photometer {
  constructor({ capacity = 40000, band = 'vis' } = {}) {
    this.capacity = capacity;
    this.t = new Float64Array(capacity);
    this.flux = new Float32Array(capacity);
    this.transit = new Float32Array(capacity);
    this.spot = new Float32Array(capacity);
    this.flare = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.head = 0;            // next write index
    this.count = 0;
    this.pending = [];
    this.setBand(band);
  }

  setBand(id) {
    this.band = BANDS[id];
    this.clear();
  }

  clear() {
    this.head = 0;
    this.count = 0;
    this.pending.length = 0;
  }

  /** Call after every integrator step. */
  sample(nbody, activity) {
    const t = nbody.time;
    const spin = (t / STAR.rotPeriod) * Math.PI * 2;
    const s = nbody.index[STAR.id] * 3;
    const pos = nbody.pos;
    const ld = this.band.ld;

    let transit = 0;
    for (let k = 0; k < PLANETS.length; k++) {
      const i = nbody.index[PLANETS[k].id] * 3;
      const y = pos[i + 1] - pos[s + 1];            // toward Earth
      if (y <= 0) continue;
      const z = Math.hypot(pos[i] - pos[s], pos[i + 2] - pos[s + 2]) / R_STAR;
      if (z >= 1 + P_RATIO[k]) continue;
      transit += transitDepth(z, P_RATIO[k], ld);
    }

    const spot = activity.spotDeficit([-Math.sin(spin), 0, Math.cos(spin)], this.band.lambda, ld);

    const j = this.head;
    this.t[j] = t;
    this.transit[j] = transit;
    this.spot[j] = spot;
    this.flare[j] = 0;
    this.spin[j] = spin;
    this.flux[j] = 1 - transit - spot;
    this.pending.push(j);
    this.head = (j + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /** Add flare light to this frame's samples, once the activity model has run. */
  commit(activity) {
    for (const j of this.pending) {
      const f = activity.flareExcess(this.t[j], this.spin[j], this.band.lambda);
      this.flare[j] = f;
      this.flux[j] = 1 - this.transit[j] - this.spot[j] + f;
    }
    this.pending.length = 0;
    if (this.count) activity.prunePhysFlares(this.t[(this.head - 1 + this.capacity) % this.capacity]);
  }

  /** Iterate samples (oldest first) with t ≥ tMin. */
  *since(tMin) {
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let n = 0; n < this.count; n++) {
      const j = (start + n) % this.capacity;
      if (this.t[j] >= tMin) yield j;
    }
  }

  latest() {
    if (!this.count) return null;
    const j = (this.head - 1 + this.capacity) % this.capacity;
    return { t: this.t[j], flux: this.flux[j], transit: this.transit[j], spot: this.spot[j], flare: this.flare[j] };
  }
}

/** Expected full-transit depths at disc centre, for the readout. */
export function centralDepths(bandId) {
  const ld = BANDS[bandId].ld;
  return PLANETS.map((p, k) => ({ id: p.id, depth: transitDepth(0, P_RATIO[k], ld) }));
}
