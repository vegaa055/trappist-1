// Integrates the system from the Agol et al. 2021 epoch and checks it against
// published numbers:
//   * Agol Table 15 posterior transit-time forecasts for b
//   * Agol Table 14 observed transit times for b, c, d
//   * Agol Table 5 transit durations
// and reports mean periods, TTV half-amplitudes and energy drift.
//
//   node tools/verify-transits.mjs [days=1500]

import { DT_MAX, AU_KM } from '../src/constants.js';
import { PLANETS, STAR, LAPLACE_TRIPLETS } from '../src/data.js';
import { buildSystem } from '../src/system.js';
import { TransitDetector, fitEphemeris, skyState, R_STAR_AU } from '../src/transits.js';
import { resonanceState } from '../src/resonance.js';

const DAYS = Number(process.argv[2] || 1500);
const MIN = 1440;

const sim = buildSystem();
const nb = sim.nbody;
const det = new TransitDetector();

// Laplace angles sampled through the run: min / max show the libration.
const laplaceTrack = new Map();
const trackLaplace = () => {
  for (const l of resonanceState(nb).laplace) {
    const r = laplaceTrack.get(l.triplet) || { first: l.phi, min: Infinity, max: -Infinity, unwrapped: l.phi };
    // Unwrap relative to the first value so ±180° crossings don't fake a range.
    const v = r.first + ((l.phi - r.first + 540) % 360 - 180);
    r.min = Math.min(r.min, v); r.max = Math.max(r.max, v);
    laplaceTrack.set(l.triplet, r);
  }
};
trackLaplace();

// Duration bookkeeping: total time with sky separation < R* + Rp, in front.
const inTransit = new Map(PLANETS.map((p) => [p.id, { on: false, start: 0, durations: [] }]));
const st = {};

const t0 = performance.now();
const steps = Math.ceil(DAYS / DT_MAX);
for (let k = 0; k < steps; k++) {
  nb.step(DT_MAX);
  det.sample(nb);
  if (k % 2500 === 0) trackLaplace();
  for (const p of PLANETS) {
    skyState(nb, p.id, st);
    const rec = inTransit.get(p.id);
    const touching = st.front && st.sep < R_STAR_AU + p.radiusKm / AU_KM;
    if (touching && !rec.on) { rec.on = true; rec.start = nb.time; }
    if (!touching && rec.on) { rec.on = false; rec.durations.push(nb.time - rec.start); }
  }
}
const elapsed = performance.now() - t0;

const EPOCH = 7257.93115525;
const toBJD = (t) => t + EPOCH;

console.log(`Integrated ${DAYS} d in ${steps.toLocaleString()} Yoshida-4 steps (${(elapsed / 1000).toFixed(2)} s)`);
console.log(`Energy drift: ${nb.energyDrift().toExponential(2)}\n`);

// ----------------------------------------------------- published checks --
const nearest = (id, bjd) => {
  const list = det.times.get(id).map(toBJD);
  let best = Infinity;
  for (const t of list) if (Math.abs(t - bjd) < Math.abs(best - bjd)) best = t;
  return best;
};

const checks = [
  { id: 'b', bjd: 7259.061221, sigma: 0.000152, src: 'Agol T15 forecast, epoch 1' },
  { id: 'b', bjd: 7260.572662, sigma: 0.000163, src: 'Agol T15 forecast, epoch 2' },
  { id: 'b', bjd: 7322.515310, sigma: 0.000710, src: 'Agol T14 observed' },
  { id: 'c', bjd: 7282.805700, sigma: 0.001400, src: 'Agol T14 observed' },
  { id: 'd', bjd: 7560.797300, sigma: 0.002300, src: 'Agol T14 observed' },
];
console.log('Transit times vs Agol et al. 2021 (BJD_TDB − 2,450,000)');
console.log('planet  published        simulated        Δ (min)   σ (min)   source');
for (const c of checks) {
  const sim = nearest(c.id, c.bjd);
  const d = (sim - c.bjd) * MIN;
  console.log(`  ${c.id}     ${c.bjd.toFixed(6)}    ${sim.toFixed(6)}    ${d.toFixed(2).padStart(7)}   ${(c.sigma * MIN).toFixed(2).padStart(6)}    ${c.src}`);
}

// ---------------------------------------------------------- ephemerides --
const AGOL_DURATION = { b: 36.06, c: 42.03, d: 48.87, e: 55.76, f: 62.85, g: 68.24, h: 76.16 };
console.log('\nPer planet over the run');
console.log('planet  transits  mean P (d)      osc. P (Agol)   TTV ½-amp (min)   duration (min)  Agol T5');
const fits = {};
for (const p of PLANETS) {
  const times = det.times.get(p.id);
  const fit = fitEphemeris(times);
  fits[p.id] = fit;
  const durs = inTransit.get(p.id).durations;
  const meanDur = durs.reduce((a, b) => a + b, 0) / Math.max(1, durs.length) * MIN;
  console.log(`  ${p.id}     ${String(times.length).padStart(5)}    ${fit.P.toFixed(6)}      ${p.agol.P.toFixed(6)}       ${(fit.amplitude * MIN).toFixed(2).padStart(7)}          ${meanDur.toFixed(2).padStart(6)}       ${AGOL_DURATION[p.id]}`);
}

// ---------------------------------------------------- resonance checks --
console.log('\nPeriod ratios (from mean periods)');
for (let i = 0; i < PLANETS.length - 1; i++) {
  const a = PLANETS[i].id, b = PLANETS[i + 1].id;
  console.log(`  P_${b}/P_${a} = ${(fits[b].P / fits[a].P).toFixed(5)}`);
}
console.log('\nGeneralized Laplace relations  p/P1 − (p+q)/P2 + q/P3  (should be ≈ 0)');
for (const { ids, p, q } of LAPLACE_TRIPLETS) {
  const [P1, P2, P3] = ids.map((id) => fits[id].P);
  const v = p / P1 - (p + q) / P2 + q / P3;
  console.log(`  ${ids.join('')}  (p=${p}, q=${q}):  ${v.toExponential(2)} /d   →  super-period ${(1 / Math.abs(v)).toFixed(0)} d`);
}

console.log('\nLaplace angles φ = pλ₁ − (p+q)λ₂ + qλ₃ (librating, so bounded)');
for (const [triplet, r] of laplaceTrack) {
  console.log(`  φ_${triplet}: at epoch ${r.first.toFixed(1).padStart(7)}°   range over run ${r.min.toFixed(1)}° … ${r.max.toFixed(1)}°`);
}
