// Body catalogue for TRAPPIST-1.
//
// Dynamical parameters are Agol et al. 2021 (PSJ 2, 1; arXiv:2010.01074):
//   * Table 2 — osculating Jacobi elements at BJD_TDB 2457257.93115525:
//     period P, initial transit time t0 (BJD - 2,450,000), e cos ω, e sin ω,
//     and the planet/star mass ratio μ in units of 1e-5.
//   * Table 6 — inclination, radius, density, irradiation.
// Star: Agol 2021 Tables 5/7 (mass from Mann+ 2019, luminosity from Ducrot+ 2020).
//
// Appearance comes from scenarios.js: each planet has several JWST-graded
// possibilities, and the `findings` block summarises what was measured.

import { MEARTH_MSUN, REARTH_KM, RSUN_KM } from './constants.js';
import { SCENARIOS } from './scenarios.js';

export const STAR = {
  id: 'star',
  name: 'TRAPPIST-1',
  kind: 'star',
  spectralType: 'M8 V',
  massSun: 0.0898,
  radiusSun: 0.1192,
  teff: 2566,
  luminositySun: 5.53e-4,
  rotPeriod: 3.295,          // days — K2 photometry (Luger+ 2017)
  ageGyr: 7.6,
  distanceLy: 40.66,
  color: '#ffa14a',          // 2566 K blackbody in sRGB
};
STAR.mass = STAR.massSun;
STAR.radiusKm = STAR.radiusSun * RSUN_KM;
STAR.luminosityErg = STAR.luminositySun * 3.828e33;   // erg/s

/**
 * Magnetic activity. These numbers set the *statistics* the simulation draws
 * from; individual spots and flares are random.
 *
 * Flares — K2 photometry: 42 flares in ~80 days with energies 1.3×10³⁰ to
 * 1.2×10³³ erg, and a cumulative frequency distribution N(>E) ∝ E^−β with
 * β ≈ 0.6 (Vida+ 2017; Paudel+ 2018 find similar). Below the K2 limit the same
 * power law is extended to 10²⁹ erg, consistent with JWST catching at least one
 * flare in every TRAPPIST-1 f visit (Lim+ 2026). Durations scale weakly with
 * energy (minutes for small events, about an hour for the largest).
 *
 * Spots — K2 shows ~1 % rotational modulation on the 3.3-day period. Both dark
 * spots and bright faculae are needed to fit the HST/JWST transit spectra; the
 * temperature contrasts here are representative, not measured.
 */
STAR.activity = {
  flareRateRef: 0.53,        // flares per day above flareERef (42 in ~80 d)
  flareERef: 1.26e30,        // erg
  ffdBeta: 0.59,             // cumulative FFD index
  flareEMin: 1e29,
  flareEMax: 1e34,
  flareTemp: 9000,           // K — white-light flare continuum
  flareTauRef: 6 / 1440,     // decay time (d) at 1e30 erg ...
  flareTauIndex: 0.35,       // ... scaling as E^0.35
  spotCoverage: 0.02,        // default: gives ~1–2 % rotational modulation in the K2 band
  umbraDT: -500,             // K
  penumbraDT: -220,          // K
  faculaDT: 110,             // K
  limbDarkening: [0.55, 0.25], // quadratic u1, u2 — red-optical, approximate
};

/** μ in Agol's Table 2 is (Mp / M*) × 1e5. */
const fromMu = (mu) => mu * 1e-5 * STAR.massSun;

const RAW = [
  {
    letter: 'b',
    agol: { P: 1.510826, t0: 7257.55044, ecosw: -0.00215, esinw: 0.00217, mu: 4.596 },
    inc: 89.728, radiusEarth: 1.116, densityGcc: 5.425, aAU: 0.01154, irradiation: 4.153,
    findings: {
      status: 'No thick atmosphere',
      summary: 'Dayside ≈ 500 K at 15 µm — what a dark bare rock with no heat redistribution should emit. No CO₂ absorption. A 2026 phase curve finds the night side below −200 °C.',
      sources: 'Greene+ 2023 (Nature, MIRI); Gillon+ 2026 (Nature Astronomy)',
    },
  },
  {
    letter: 'c',
    agol: { P: 2.421937, t0: 7258.58728, ecosw: 0.00055, esinw: 0.00001, mu: 4.374 },
    inc: 89.778, radiusEarth: 1.097, densityGcc: 5.447, aAU: 0.01580, irradiation: 2.214,
    findings: {
      status: 'No thick atmosphere',
      summary: 'Dayside ≈ 380 K at 15 µm. A Venus-like CO₂ atmosphere with clouds is ruled out; bare rock or a thin cloud-free CO₂ layer remain. The 2026 phase curve shows no heat reaching the night side.',
      sources: 'Zieba+ 2023 (Nature, MIRI); Gillon+ 2026 (Nature Astronomy)',
    },
  },
  {
    letter: 'd',
    agol: { P: 4.049219, t0: 7257.06768, ecosw: -0.00496, esinw: 0.00267, mu: 1.297 },
    inc: 89.896, radiusEarth: 0.788, densityGcc: 4.354, aAU: 0.02227, irradiation: 1.115,
    findings: {
      status: 'Earth-like atmosphere unlikely',
      summary: 'No water, methane or CO₂ features in the transmission spectrum. Remaining options: bare rock, a very thin Mars-like atmosphere, or high-altitude clouds.',
      sources: 'Piaulet-Ghorayeb+ 2025 (ApJ, NIRSpec)',
    },
  },
  {
    letter: 'e',
    agol: { P: 6.101013, t0: 7257.82771, ecosw: 0.00433, esinw: -0.00461, mu: 2.313 },
    inc: 89.793, radiusEarth: 0.920, densityGcc: 4.885, aAU: 0.02925, irradiation: 0.646,
    findings: {
      status: 'Open — 50/50',
      summary: 'Hydrogen-rich and CO₂-dominated atmospheres are ruled out. A nitrogen-dominated atmosphere with traces of methane remains possible, as does bare rock. Fifteen more transits are scheduled. The ocean shown here is a hypothesis.',
      sources: 'Espinoza+ 2025, Glidden+ 2025 (ApJL, NIRSpec)',
    },
  },
  {
    letter: 'f',
    agol: { P: 9.207540, t0: 7257.07426, ecosw: -0.00840, esinw: -0.00051, mu: 3.475 },
    inc: 89.740, radiusEarth: 1.045, densityGcc: 5.009, aAU: 0.03849, irradiation: 0.373,
    findings: {
      status: 'No thick H₂ atmosphere',
      summary: 'Five NIRISS transits rule out hydrogen/helium atmospheres thicker than ~20 mbar. Flares hit every visit, but no starspot contamination was found. Heavier atmospheres are not yet constrained.',
      sources: 'Lim+ 2026 (accepted AJ, NIRISS SOSS)',
    },
  },
  {
    letter: 'g',
    agol: { P: 12.352446, t0: 7257.71462, ecosw: 0.00380, esinw: 0.00128, mu: 4.418 },
    inc: 89.742, radiusEarth: 1.129, densityGcc: 5.042, aAU: 0.04683, irradiation: 0.252,
    findings: {
      status: 'Not yet constrained',
      summary: 'Inside the habitable zone but far enough out that it may be ice-covered. Current JWST data are insufficient to say whether it has an atmosphere.',
      sources: 'Archival re-analyses, 2026',
    },
  },
  {
    letter: 'h',
    agol: { P: 18.772866, t0: 7249.60676, ecosw: -0.00365, esinw: -0.00002, mu: 1.088 },
    inc: 89.805, radiusEarth: 0.755, densityGcc: 4.147, aAU: 0.06189, irradiation: 0.144,
    findings: {
      status: 'Not yet constrained',
      summary: 'Outside the habitable zone and receiving about a seventh of Earth\'s sunlight — likely a frozen world. Its period was pinned down by the resonance chain before it was confirmed (Luger+ 2017).',
      sources: 'Luger+ 2017 (Nature Astronomy); archival re-analyses, 2026',
    },
  },
];

export const PLANET_COLORS = {
  b: '#ff7a59', c: '#ffb04d', d: '#e8d36a', e: '#6fd3a0',
  f: '#5ec5e8', g: '#8b9cff', h: '#c78bff',
};

export const PLANETS = RAW.map((p) => {
  const mass = fromMu(p.agol.mu);
  return {
    ...p,
    id: p.letter,
    name: `TRAPPIST-1 ${p.letter}`,
    kind: 'planet',
    parent: STAR.id,
    mass,
    massEarth: mass / MEARTH_MSUN,
    radiusKm: p.radiusEarth * REARTH_KM,
    tidallyLocked: true,
    tilt: 0,
    uiColor: PLANET_COLORS[p.letter],
    scenarios: SCENARIOS[p.letter],
  };
});

export const BODIES = [STAR, ...PLANETS];
export const BODY_BY_ID = Object.fromEntries(BODIES.map((b) => [b.id, b]));

/**
 * The five three-body (Laplace) resonances linking consecutive triplets:
 * φ = p·λ₁ − (p+q)·λ₂ + q·λ₃ librates because p/P₁ − (p+q)/P₂ + q/P₃ ≈ 0.
 * (Luger+ 2017, Agol+ 2021.)
 */
export const LAPLACE_TRIPLETS = [
  { ids: ['b', 'c', 'd'], p: 2, q: 3 },
  { ids: ['c', 'd', 'e'], p: 1, q: 2 },
  { ids: ['d', 'e', 'f'], p: 2, q: 3 },
  { ids: ['e', 'f', 'g'], p: 1, q: 2 },
  { ids: ['f', 'g', 'h'], p: 1, q: 1 },
];

/** Nominal commensurabilities between neighbours. */
export const PERIOD_RATIO_NOMINAL = [
  { ids: ['b', 'c'], label: '8:5', value: 8 / 5 },
  { ids: ['c', 'd'], label: '5:3', value: 5 / 3 },
  { ids: ['d', 'e'], label: '3:2', value: 3 / 2 },
  { ids: ['e', 'f'], label: '3:2', value: 3 / 2 },
  { ids: ['f', 'g'], label: '4:3', value: 4 / 3 },
  { ids: ['g', 'h'], label: '3:2', value: 3 / 2 },
];
