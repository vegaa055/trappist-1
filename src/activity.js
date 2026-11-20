// Stellar activity on the CPU: the spot population and the flare scheduler.
//
// Both live here rather than in the shader so they are *quantities*, not just
// pictures: spot coverage and the brightness dip they cause toward Earth are
// computed exactly, and each flare's energy sets how much extra (and how much
// bluer) light reaches the planets. The shader receives the results as
// uniform arrays.
//
// Spots and flares are attached to the star's rotating frame ("local"
// directions), so they turn with it every 3.3 days.

import { STAR } from './data.js';

export const MAX_SPOTS = 48;
export const MAX_FLARES = 8;

const C2 = 14388;                              // second radiation constant, µm·K
export const CHANNEL_LAMBDA = [0.61, 0.55, 0.465];   // effective R, G, B (µm)
const K2_LAMBDA = 0.8;   // effective wavelength of Kepler/K2 for a star this red

/** B_λ(T) / B_λ(T0) — how much brighter T is than T0 at wavelength λ. */
export function planckRatio(T, T0, lambda) {
  return Math.expm1(C2 / (lambda * T0)) / Math.expm1(C2 / (lambda * T));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const capArea = (r) => (1 - Math.cos(r)) / 2;   // fraction of the whole sphere

function dirFromLatLon(lat, lon) {
  const c = Math.cos(lat);
  return [c * Math.cos(lon), Math.sin(lat), c * Math.sin(lon)];
}

/** Smooth birth → peak → decay. Area ∝ r², so mean area ≈ 0.6 of peak. */
const spotProfile = (x) => (x <= 0 || x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * x), 0.6));
const MEAN_AREA_FACTOR = 0.6;

export class StellarActivity {
  constructor({ seed = 20170222 } = {}) {
    this.rand = mulberry32(seed);
    this.params = STAR.activity;
    this.spots = [];
    this.flares = [];
    this.log = [];                 // most recent first
    this.physFlares = [];          // every flare, with real (unstretched) timing
    this.flareCount = 0;
    this.observedDays = 0;
    this.time = 0;                 // sim days seen by the activity model
    this.targetCoverage = this.params.spotCoverage;
    this.flareRateScale = 1;

    // Output state, refreshed by update().
    this.coverage = 0;
    this.channelBoost = [0, 0, 0];     // extra starlight per R,G,B channel
    this.bolometricBoost = 0;
    this.modulation = { deficit: 0, history: [], p2p: 0 };
    // Extra blue-channel light per unit of bolometric flare fraction.
    this.blueBoostPerFrac = Math.pow(STAR.teff / this.params.flareTemp, 4)
      * planckRatio(this.params.flareTemp, STAR.teff, CHANNEL_LAMBDA[2]);

    this._populate(true);
  }

  // ------------------------------------------------------------- spots ----

  _newSpot(age = 0) {
    const r = this.rand;
    // Peak radius: lognormal around 3.2°, clipped to 1.2°–10°. Many small spots
    // keep the rotational modulation near the observed ~1 %. Above ~2.5 %
    // coverage the 48-spot budget would run out, so spots grow instead.
    const g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
    const grow = Math.sqrt(Math.max(1, this.targetCoverage / 0.025));
    const peak = Math.min(10 * grow, Math.max(1.2, 3.2 * grow * Math.exp(0.45 * g))) * Math.PI / 180;
    // Fully convective dwarfs show spots at high latitudes as well as low.
    let lat;
    if (r() < 0.35) lat = (55 + 30 * r()) * (r() < 0.5 ? -1 : 1);
    else lat = Math.asin(2 * r() - 1) * 180 / Math.PI * 0.75;
    const life = 12 + 60 * r();   // days
    return {
      dir: dirFromLatLon(lat * Math.PI / 180, r() * Math.PI * 2),
      peak,
      life,
      age: age * life,
      radius: 0,
      seed: r() * 100,
    };
  }

  _expectedCoverage() {
    let c = 0;
    for (const s of this.spots) if (!s.dying && s.age < s.life) c += capArea(s.peak) * MEAN_AREA_FACTOR;
    return c;
  }

  /**
   * Top the population up to the target. At start-up spots get random ages so
   * the star begins in a steady state; afterwards they are born at age 0 and
   * grow in.
   */
  _populate(randomAge = false) {
    let guard = 0;
    while (this._expectedCoverage() < this.targetCoverage && this.spots.length < MAX_SPOTS && guard++ < 200) {
      this.spots.push(this._newSpot(randomAge ? this.rand() : 0));
    }
    this._updateSpotRadii();
  }

  _updateSpotRadii() {
    let cov = 0;
    for (const s of this.spots) {
      s.radius = s.peak * spotProfile(s.age / s.life);
      cov += capArea(s.radius);
    }
    this.coverage = cov;
  }

  setSpotCoverage(c) {
    this.targetCoverage = c;
    // Shrinking: bring forward the decay of spots until the budget fits.
    // Doomed spots stop counting toward the budget and fade out over ~1 day:
    // their remaining life is compressed so the decay phase plays quickly.
    while (this._expectedCoverage() > c * 1.05) {
      const alive = this.spots.filter((s) => !s.dying && s.age < s.life);
      if (!alive.length) break;
      const s = alive[Math.floor(this.rand() * alive.length)];
      s.dying = true;
      let x = s.age / s.life;
      if (x < 0.5) x = 1 - x;                    // same size, now shrinking
      const remaining = 0.5 + this.rand();
      s.life = remaining / (1 - x);
      s.age = x * s.life;
    }
    this._populate(true);
  }

  // ------------------------------------------------------------ flares ----

  /** Rate (per day) of flares above E_min, from the K2 frequency distribution. */
  flareRate() {
    const p = this.params;
    return p.flareRateRef * Math.pow(p.flareEMin / p.flareERef, -p.ffdBeta) * this.flareRateScale;
  }

  _sampleEnergy() {
    const p = this.params;
    const span = 1 - Math.pow(p.flareEMax / p.flareEMin, -p.ffdBeta);
    return p.flareEMin * Math.pow(1 - this.rand() * span, -1 / p.ffdBeta);
  }

  /** Spawn a flare. Most erupt from an existing active region. */
  trigger(energy = this._sampleEnergy(), { simTime = this.time } = {}) {
    const p = this.params;
    const r = this.rand;

    let dir;
    const big = this.spots.filter((s) => s.radius > 0.02);
    if (big.length && r() < 0.75) {
      const s = big[Math.floor(r() * big.length)];
      const off = s.radius * (0.6 + 0.8 * r());
      const a = r() * Math.PI * 2;
      // Offset from the spot centre in its tangent plane.
      const up = Math.abs(s.dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const t1 = normalize(cross(up, s.dir));
      const t2 = cross(s.dir, t1);
      dir = normalize([0, 1, 2].map((k) => s.dir[k] + off * (Math.cos(a) * t1[k] + Math.sin(a) * t2[k])));
    } else {
      dir = dirFromLatLon(Math.asin(2 * r() - 1), r() * Math.PI * 2);
    }

    const tauD = p.flareTauRef * Math.pow(energy / 1e30, p.flareTauIndex);
    const tauR = Math.max(0.6 / 1440, 0.12 * tauD);
    const lifetime = tauR + 5 * tauD;
    const effective = 0.5 * tauR + tauD * (0.8 + 0.2 * 3);     // ∫ envelope dt
    const peakFrac = energy / (STAR.luminosityErg * effective * 86400);

    const flare = {
      dir, energy, tauR, tauD, lifetime, peakFrac,
      t: 0,
      angle: r() * Math.PI,
      seed: r() * 100,
      startedAt: simTime,
      envelope: 0,
    };

    this.flareCount++;
    this.log.unshift({ simTime, energy, peakFrac, shown: false });
    this.physFlares.push({ start: simTime, dir, tauR, tauD, lifetime, peakFrac });
    if (this.log.length > 14) this.log.pop();

    if (this.flares.length < MAX_FLARES) {
      this.flares.push(flare);
      this.log[0].shown = true;
    } else {
      // Keep the most energetic events on screen when slots run out.
      let weakest = 0;
      for (let i = 1; i < this.flares.length; i++) {
        if (this.flares[i].energy < this.flares[weakest].energy) weakest = i;
      }
      if (this.flares[weakest].energy < energy) {
        this.flares[weakest] = flare;
        this.log[0].shown = true;
      }
    }
    return flare;
  }

  static envelope(f) {
    if (f.t <= 0) return 0;
    if (f.t < f.tauR) return 0.5 * (1 - Math.cos(Math.PI * f.t / f.tauR));
    const x = f.t - f.tauR;
    return 0.8 * Math.exp(-x / f.tauD) + 0.2 * Math.exp(-x / (3 * f.tauD));
  }

  _poisson(lambda) {
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= this.rand(); } while (p > L);
      return k - 1;
    }
    const g = Math.sqrt(-2 * Math.log(this.rand() + 1e-9)) * Math.cos(2 * Math.PI * this.rand());
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * g));
  }

  // ------------------------------------------------------------ update ----

  /**
   * @param dtSim   simulated days elapsed this frame
   * @param dtWall  wall seconds elapsed this frame
   * @param minFlareSeconds  shortest on-screen flare life. At high time rates a
   *        real flare would last a fraction of a frame; it is stretched to stay
   *        visible. Its *timing* and *energy* are unchanged.
   */
  update(dtSim, dtWall, { minFlareSeconds = 2.5 } = {}) {
    if (dtSim > 0) {
      this.time += dtSim;
      this.observedDays += dtSim;

      // Spots age; dead ones are replaced to hold the target coverage.
      for (const s of this.spots) s.age += dtSim;
      this.spots = this.spots.filter((s) => s.age < s.life);
      this._populate();

      // Flares arrive as a Poisson process in simulated time.
      const n = this._poisson(this.flareRate() * dtSim);
      for (let i = 0; i < n; i++) this.trigger(undefined, { simTime: this.time - this.rand() * dtSim });
    }
    this._updateSpotRadii();

    // Advance each flare at the slower of real time and a rate that keeps it
    // on screen for at least minFlareSeconds.
    const p = this.params;
    const tStar4 = Math.pow(STAR.teff / p.flareTemp, 4);
    const boost = [0, 0, 0];
    let bol = 0;
    for (const f of this.flares) {
      const maxRate = f.lifetime / minFlareSeconds;
      f.t += Math.min(dtSim, dtWall * maxRate);
      f.envelope = StellarActivity.envelope(f);
      const frac = f.peakFrac * f.envelope;
      bol += frac;
      // Blackbody at flareTemp with total power frac·L★:
      // its share in each channel is frac·(T★/Tf)⁴·B_λ(Tf)/B_λ(T★).
      for (let c = 0; c < 3; c++) {
        boost[c] += frac * tStar4 * planckRatio(p.flareTemp, STAR.teff, CHANNEL_LAMBDA[c]);
      }
    }
    this.flares = this.flares.filter((f) => f.t < f.lifetime);
    this.channelBoost = boost;
    this.bolometricBoost = bol;
    this._chanFactor ||= CHANNEL_LAMBDA.map((l) => tStar4 * planckRatio(p.flareTemp, STAR.teff, l));
  }

  /**
   * Flare light reaching a particular direction (unit vector in the star's
   * rotating frame), per R,G,B channel. A flare is a small Lambertian patch:
   * it sends flux ∝ μ toward a direction at angle acos μ from its normal.
   * Normalised so that the average over all directions equals the global
   * fraction — so planets facing the flare get up to 4× the mean boost and
   * planets on the far side get none.
   */
  boostToward(dirLocal, out = [0, 0, 0]) {
    out[0] = out[1] = out[2] = 0;
    if (!this._chanFactor) return out;
    for (const f of this.flares) {
      const mu = f.dir[0] * dirLocal[0] + f.dir[1] * dirLocal[1] + f.dir[2] * dirLocal[2];
      if (mu <= 0) continue;
      const frac = f.peakFrac * f.envelope * 4 * mu;
      for (let c = 0; c < 3; c++) out[c] += frac * this._chanFactor[c];
    }
    return out;
  }

  /**
   * Fractional dimming toward Earth from spots, in the K2 band, with the
   * quadratic limb darkening. `toLocal` maps a world direction into the
   * star's rotating frame (inverse spin).
   */
  updateModulation(earthLocal) {
    const p = this.params;
    const [u1, u2] = p.limbDarkening;
    const ldNorm = 1 - u1 / 3 - u2 / 6;
    const umbra = planckRatio(STAR.teff + p.umbraDT, STAR.teff, K2_LAMBDA);
    const pen = planckRatio(STAR.teff + p.penumbraDT, STAR.teff, K2_LAMBDA);
    // Umbra is ~30 % of the spot area (radius 0.55).
    const contrast = 1 - (0.3 * umbra + 0.7 * pen);
    let deficit = 0;
    for (const s of this.spots) {
      const mu = s.dir[0] * earthLocal[0] + s.dir[1] * earthLocal[1] + s.dir[2] * earthLocal[2];
      if (mu <= 0) continue;
      const ld = 1 - u1 * (1 - mu) - u2 * (1 - mu) * (1 - mu);
      deficit += contrast * s.radius * s.radius * mu * ld / ldNorm;
    }
    const m = this.modulation;
    m.deficit = deficit;
    m.history.push([this.time, deficit]);
    while (m.history.length && m.history[0][0] < this.time - STAR.rotPeriod) m.history.shift();
    if (m.history.length > 600) m.history.splice(0, m.history.length - 600);
    let lo = Infinity, hi = -Infinity;
    for (const [, d] of m.history) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    m.p2p = m.history.length > 1 ? hi - lo : 0;
    return deficit;
  }

  // ------------------------------------------------- photometry toward Earth

  /**
   * Fractional dimming from spots seen from direction `earthLocal` at
   * wavelength λ with quadratic limb darkening (u1, u2).
   */
  spotDeficit(earthLocal, lambda, [u1, u2]) {
    const p = this.params;
    const ldNorm = 1 - u1 / 3 - u2 / 6;
    const umbra = planckRatio(STAR.teff + p.umbraDT, STAR.teff, lambda);
    const pen = planckRatio(STAR.teff + p.penumbraDT, STAR.teff, lambda);
    const contrast = 1 - (0.3 * umbra + 0.7 * pen);
    let deficit = 0;
    for (const s of this.spots) {
      const mu = s.dir[0] * earthLocal[0] + s.dir[1] * earthLocal[1] + s.dir[2] * earthLocal[2];
      if (mu <= 0) continue;
      const om = 1 - mu;
      deficit += contrast * s.radius * s.radius * mu * (1 - u1 * om - u2 * om * om) / ldNorm;
    }
    return deficit;
  }

  /**
   * Fractional brightening from flares toward Earth at simulated time t and
   * wavelength λ, using each flare's *physical* time profile (the on-screen
   * stretch does not apply here). `spin` is the star's rotation angle at t.
   */
  flareExcess(t, spin, lambda) {
    const factor = Math.pow(STAR.teff / this.params.flareTemp, 4)
      * planckRatio(this.params.flareTemp, STAR.teff, lambda);
    const sn = Math.sin(spin), cs = Math.cos(spin);
    let total = 0;
    for (const f of this.physFlares) {
      const age = t - f.start;
      if (age <= 0 || age > f.lifetime) continue;
      const mu = -f.dir[0] * sn + f.dir[2] * cs;       // toward Earth (scene +z)
      if (mu <= 0) continue;
      total += f.peakFrac * StellarActivity.envelope({ t: age, tauR: f.tauR, tauD: f.tauD }) * 4 * mu;
    }
    return total * factor;
  }

  prunePhysFlares(t) {
    if (this.physFlares.length > 400) this.physFlares.splice(0, this.physFlares.length - 400);
    this.physFlares = this.physFlares.filter((f) => t - f.start <= f.lifetime);
  }

  observedFlareRate() {
    return this.observedDays > 0.5 ? this.flareCount / this.observedDays : NaN;
  }
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
