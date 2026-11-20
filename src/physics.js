// Direct N-body gravitational integrator.
//
// Every body pulls on every other body. TRAPPIST-1's transit-timing variations
// — the way the planets tug each other early and late — are exactly what this
// captures and a Keplerian model cannot.
//
// The step is a fourth-order Yoshida composition of kick-drift-kick leapfrog:
// three leapfrog substeps with weights w1, w0, w1. It is symplectic like plain
// Verlet (energy error bounded, no secular drift) but its error falls as dt^4,
// which matters here because transit times are measured to seconds.

import { G, SOFTENING2 } from './constants.js';

const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2);
const W0 = -CBRT2 / (2 - CBRT2);
const YOSHIDA = [W1, W0, W1];

export class NBodySystem {
  /**
   * @param {Array<{id:string, mass:number, r:number[], v:number[]}>} bodies
   */
  constructor(bodies) {
    this.n = bodies.length;
    this.ids = bodies.map((b) => b.id);
    this.index = Object.fromEntries(this.ids.map((id, i) => [id, i]));
    this.mass = new Float64Array(this.n);
    this.pos = new Float64Array(this.n * 3);
    this.vel = new Float64Array(this.n * 3);
    this.acc = new Float64Array(this.n * 3);

    bodies.forEach((b, i) => {
      this.mass[i] = b.mass;
      for (let k = 0; k < 3; k++) {
        this.pos[i * 3 + k] = b.r[k];
        this.vel[i * 3 + k] = b.v[k];
      }
    });

    this.time = 0;                  // days since the integrator's epoch
    this.removeBarycentreDrift();
    this.computeAccelerations();
    this.initialEnergy = this.totalEnergy();
  }

  totalMass() {
    let m = 0;
    for (let i = 0; i < this.n; i++) m += this.mass[i];
    return m;
  }

  /** Shift into the barycentric frame so the system does not drift off-screen. */
  removeBarycentreDrift() {
    const { n, mass, pos, vel } = this;
    const total = this.totalMass();
    const cm = [0, 0, 0];
    const cv = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        cm[k] += mass[i] * pos[i * 3 + k];
        cv[k] += mass[i] * vel[i * 3 + k];
      }
    }
    for (let k = 0; k < 3; k++) { cm[k] /= total; cv[k] /= total; }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        pos[i * 3 + k] -= cm[k];
        vel[i * 3 + k] -= cv[k];
      }
    }
  }

  /** Pairwise Newtonian gravity, O(n^2) with Newton's third law halving the work. */
  computeAccelerations() {
    const { n, mass, pos, acc } = this;
    acc.fill(0);

    for (let i = 0; i < n; i++) {
      const xi = pos[i * 3], yi = pos[i * 3 + 1], zi = pos[i * 3 + 2];
      const mi = mass[i];
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j * 3] - xi;
        const dy = pos[j * 3 + 1] - yi;
        const dz = pos[j * 3 + 2] - zi;

        const d2 = dx * dx + dy * dy + dz * dz + SOFTENING2;
        const invD = 1 / Math.sqrt(d2);
        const s = G * invD * invD * invD;
        const si = s * mass[j];
        const sj = s * mi;

        acc[i * 3] += dx * si;
        acc[i * 3 + 1] += dy * si;
        acc[i * 3 + 2] += dz * si;

        acc[j * 3] -= dx * sj;
        acc[j * 3 + 1] -= dy * sj;
        acc[j * 3 + 2] -= dz * sj;
      }
    }
  }

  /** One kick-drift-kick leapfrog substep. Assumes `acc` is current on entry. */
  _leapfrog(h) {
    const { n, pos, vel, acc } = this;
    const half = h * 0.5;
    const m = n * 3;
    for (let i = 0; i < m; i++) {
      vel[i] += acc[i] * half;
      pos[i] += vel[i] * h;
    }
    this.computeAccelerations();
    for (let i = 0; i < m; i++) vel[i] += acc[i] * half;
  }

  /** One fourth-order Yoshida step of `dt` days (three force evaluations). */
  step(dt) {
    this._leapfrog(YOSHIDA[0] * dt);
    this._leapfrog(YOSHIDA[1] * dt);
    this._leapfrog(YOSHIDA[2] * dt);
    this.time += dt;
  }

  /**
   * Advance by `days`, splitting into substeps no larger than dtMax.
   * Returns the number of substeps actually taken.
   */
  advance(days, dtMax, maxSubsteps = Infinity) {
    if (days === 0) return 0;
    const steps = Math.min(maxSubsteps, Math.max(1, Math.ceil(Math.abs(days) / dtMax)));
    const dt = days / steps;
    for (let s = 0; s < steps; s++) this.step(dt);
    return steps;
  }

  totalEnergy() {
    const { n, mass, pos, vel } = this;
    let kinetic = 0;
    for (let i = 0; i < n; i++) {
      const vx = vel[i * 3], vy = vel[i * 3 + 1], vz = vel[i * 3 + 2];
      kinetic += 0.5 * mass[i] * (vx * vx + vy * vy + vz * vz);
    }
    let potential = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j * 3] - pos[i * 3];
        const dy = pos[j * 3 + 1] - pos[i * 3 + 1];
        const dz = pos[j * 3 + 2] - pos[i * 3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz + SOFTENING2);
        potential -= G * mass[i] * mass[j] / d;
      }
    }
    return kinetic + potential;
  }

  /** Fractional energy drift since construction — the honest accuracy readout. */
  energyDrift() {
    const e = this.totalEnergy();
    return Math.abs((e - this.initialEnergy) / this.initialEnergy);
  }

  getPosition(id, out = [0, 0, 0]) {
    const i = this.index[id] * 3;
    out[0] = this.pos[i]; out[1] = this.pos[i + 1]; out[2] = this.pos[i + 2];
    return out;
  }

  getVelocity(id, out = [0, 0, 0]) {
    const i = this.index[id] * 3;
    out[0] = this.vel[i]; out[1] = this.vel[i + 1]; out[2] = this.vel[i + 2];
    return out;
  }

  relativePosition(id, refId, out = [0, 0, 0]) {
    const i = this.index[id] * 3, j = this.index[refId] * 3;
    out[0] = this.pos[i] - this.pos[j];
    out[1] = this.pos[i + 1] - this.pos[j + 1];
    out[2] = this.pos[i + 2] - this.pos[j + 2];
    return out;
  }

  relativeVelocity(id, refId, out = [0, 0, 0]) {
    const i = this.index[id] * 3, j = this.index[refId] * 3;
    out[0] = this.vel[i] - this.vel[j];
    out[1] = this.vel[i + 1] - this.vel[j + 1];
    out[2] = this.vel[i + 2] - this.vel[j + 2];
    return out;
  }

  /** Snapshot for rewinding / cloning (e.g. the transit verifier). */
  clone() {
    const c = Object.create(NBodySystem.prototype);
    c.n = this.n;
    c.ids = this.ids;
    c.index = this.index;
    c.mass = this.mass.slice();
    c.pos = this.pos.slice();
    c.vel = this.vel.slice();
    c.acc = this.acc.slice();
    c.time = this.time;
    c.initialEnergy = this.initialEnergy;
    return c;
  }
}
