// Body catalogue for TRAPPIST-1.
//
// Dynamical parameters are Agol et al. 2021 (PSJ 2, 1; arXiv:2010.01074):
//   * Table 2 — osculating Jacobi elements at BJD_TDB 2457257.93115525:
//     period P, initial transit time t0 (BJD - 2,450,000), e cos ω, e sin ω,
//     and the planet/star mass ratio μ in units of 1e-5.
//   * Table 6 — inclination, radius, density, irradiation.
// Star: Agol 2021 Tables 5/7 (mass from Mann+ 2019, luminosity from Ducrot+ 2020).
//
// Surface appearance is a stand-in in Phase 1 and is replaced by JWST-driven
// scenarios in Phase 3 — the `findings` block, not the colours, is the science.

import { MEARTH_MSUN, REARTH_KM, RSUN_KM } from './constants.js';

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

/** μ in Agol's Table 2 is (Mp / M*) × 1e5. */
const fromMu = (mu) => mu * 1e-5 * STAR.massSun;

const RAW = [
  {
    letter: 'b',
    agol: { P: 1.510826, t0: 7257.55044, ecosw: -0.00215, esinw: 0.00217, mu: 4.596 },
    inc: 89.728, radiusEarth: 1.116, densityGcc: 5.425, aAU: 0.01154, irradiation: 4.153,
    surface: 'cratered',
    colors: ['#3b3632', '#1f1b19', '#5d544d', '#121010'],
    params: { craterDensity: 18, craterDepth: 0.8, bump: 0.45, roughness: 1.1 },
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
    surface: 'cratered',
    colors: ['#575049', '#2d2925', '#7d7268', '#181513'],
    params: { craterDensity: 22, craterDepth: 0.9, bump: 0.45, roughness: 1.0 },
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
    surface: 'martian',
    colors: ['#7f6650', '#4f3b2c', '#a68a6c', '#33251b'],
    params: { bump: 0.4, dust: 0.4, iceCap: 0.97 },
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
    surface: 'terran',
    colors: ['#1d3a5a', '#5b5240', '#8a7d62', '#e8eef2'],
    params: { seaLevel: 0.08, cloud: 0.35, specular: 0.5, iceCap: 0.72, bump: 0.3 },
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
    surface: 'icy',
    colors: ['#c9c2b8', '#8f8577', '#ece6dc', '#6b6156'],
    params: { bump: 0.25, cracks: 0.6 },
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
    surface: 'icy',
    colors: ['#b8c3cc', '#7c8790', '#e2e9ee', '#59636b'],
    params: { bump: 0.25, cracks: 0.8 },
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
    surface: 'icy',
    colors: ['#d4d2cf', '#9c9893', '#f2f0ec', '#6e6a65'],
    params: { bump: 0.3, cracks: 0.4 },
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
