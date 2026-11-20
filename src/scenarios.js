// What each planet might look like, constrained by what JWST has measured.
//
// Every planet has a set of scenarios. Each one carries:
//   status  — how it stands against the data:
//             'matches'     reproduces a JWST measurement
//             'consistent'  allowed by the data
//             'hypothesis'  plausible, not yet testable
//             'disfavoured' in tension with the data
//             'ruledout'    excluded by the data
//   world   — which surface routine the shader uses (see shaders/world.js)
//   albedo, redistribution, hotspotShift — the thermal model (thermal.js)
//   atmosphere — a visible shell, only where the scenario has enough air
//   note    — why it has that status, in a sentence or two
//
// Thermal parameters are chosen to be representative of each case, not
// fitted. The info card shows what each predicts at 15 µm next to the JWST
// value, so the comparison is visible rather than asserted.

export const STATUS = {
  matches: { label: 'matches JWST', color: '#6fd3a0' },
  consistent: { label: 'consistent', color: '#7fb2ff' },
  hypothesis: { label: 'hypothesis', color: '#c79bff' },
  disfavoured: { label: 'disfavoured', color: '#ffb35c' },
  ruledout: { label: 'ruled out', color: '#ff7066' },
};

/** Dayside brightness temperatures at 15 µm (MIRI F1500W). */
export const MEASURED_15UM = {
  b: [
    { value: 490, err: 17, source: 'Gillon+ 2026, phase curve' },
    { value: 503, err: 27, source: 'Greene+ 2023, eclipses' },
  ],
  c: [
    { value: 369, err: 23, source: 'Gillon+ 2026, phase curve' },
    { value: 380, err: 31, source: 'Zieba+ 2023, eclipses' },
  ],
};

/**
 * Night-side limits. The 2026 thermal phase curves put both nights below
 * −200 °C; any scenario that carries more heat around than that allows is
 * excluded however well its dayside fits.
 */
export const MEASURED_NIGHT = {
  b: { max: 73, source: 'Gillon+ 2026' },
  c: { max: 73, source: 'Gillon+ 2026' },
};

const DARK_ROCK = ['#3a3530', '#1d1a17', '#5a514a', '#121010'];
const N2_SKY = { color: '#86a9d6', sunset: '#d99a7a', height: 0.045, intensity: 1.2 };

export const SCENARIOS = {
  b: [
    {
      id: 'bare', label: 'Bare dark rock', status: 'matches',
      world: 'barerock', colors: DARK_ROCK,
      params: { craters: 18, relief: 0.5, plains: 0.35 },
      albedo: 0.1, redistribution: 0,
      note: 'An airless, dark (ultramafic or basaltic) surface re-radiating heat where it lands predicts 489 K at 15 µm — on top of the measured 490 ± 17 K. The night side sits near the interior floor.',
    },
    {
      id: 'volcanic', label: 'Tidally heated volcanism', status: 'hypothesis',
      world: 'lava', colors: ['#2f2a26', '#171412', '#4c443d', '#ff5a1a'],
      params: { craters: 6, relief: 0.4, plains: 0.6, lava: 1 },
      albedo: 0.1, redistribution: 0,
      note: 'Tides from its eccentric, resonant orbit heat b\'s interior; some models allow Io-like volcanism. Thermally identical to bare rock, so the 15 µm data neither require nor exclude it. Glowing vents show on the night side.',
    },
    {
      id: 'co2', label: 'Thick CO₂ atmosphere', status: 'ruledout',
      world: 'cloudy', colors: ['#c9a98a', '#a8876a', '#e4cfb6', '#8a6a52'],
      params: { bands: 0.6 },
      albedo: 0.2, redistribution: 0.8, hotspotShift: 20,
      atmosphere: { color: '#e8c9a0', sunset: '#ff8a4a', height: 0.07, intensity: 2.0 },
      note: 'Carrying heat to the night side would drop the dayside to ~400 K — and CO₂ absorbs at 15 µm, lower still. The measured ~490 K and the cold night side in the 2026 phase curve exclude it.',
    },
  ],

  c: [
    {
      id: 'bare', label: 'Bare rock', status: 'consistent',
      world: 'barerock', colors: ['#9c948a', '#6d665e', '#c4bbb0', '#58524b'],
      params: { craters: 22, relief: 0.5, plains: 0.25 },
      albedo: 0.3, redistribution: 0,
      note: 'Airless rock reproduces the cold night side. A dark surface would be too hot (430 K vs 369 ± 23 K), so a fairly reflective one (albedo ~0.3, e.g. fresh or felsic rock) is needed — or a thin atmosphere.',
    },
    {
      id: 'thinco2', label: 'Thin CO₂, no clouds', status: 'consistent',
      world: 'barerock', colors: ['#6a5c4e', '#3a3029', '#8c7a68', '#211b16'],
      params: { craters: 10, relief: 0.4, plains: 0.4 },
      albedo: 0.25, redistribution: 0.002, hotspotShift: 2,
      atmosphere: { color: '#d8b48a', sunset: '#ff7a3a', height: 0.02, intensity: 0.45 },
      note: 'Allowed by the 2023 eclipses — but the 2026 phase curve puts the night side below 73 K, so the layer can carry almost no heat (under ~0.3 % of it). Only a very thin atmosphere passes both tests.',
    },
    {
      id: 'venus', label: 'Venus-like: thick CO₂ + clouds', status: 'ruledout',
      world: 'cloudy', colors: ['#e8dcc0', '#cdbb98', '#f6efdc', '#a8946e'],
      params: { bands: 1 },
      albedo: 0.75, redistribution: 1, hotspotShift: 0,
      atmosphere: { color: '#f2e2c0', sunset: '#ff9a5a', height: 0.08, intensity: 2.4 },
      note: 'Bright sulfuric clouds would reflect most of the light and even out the temperature: ~240 K at 15 µm against the measured ~370 K. Ruled out by Zieba+ 2023.',
    },
  ],

  d: [
    {
      id: 'bare', label: 'Bare rock', status: 'consistent',
      world: 'barerock', colors: ['#6b5747', '#3b2e25', '#8f7764', '#241b15'],
      params: { craters: 16, relief: 0.55, plains: 0.2 },
      albedo: 0.15, redistribution: 0,
      note: 'No water, methane or CO₂ features in the NIRSpec transmission spectrum. A bare surface fits.',
    },
    {
      id: 'mars', label: 'Thin Mars-like air', status: 'consistent',
      world: 'dry', colors: ['#8a6a50', '#5a4030', '#b09070', '#3a2a20'],
      params: { craters: 10, relief: 0.6, dust: 0.5 },
      albedo: 0.2, redistribution: 0.1, hotspotShift: 5,
      atmosphere: { color: '#d9a27a', sunset: '#8fb0ff', height: 0.025, intensity: 0.6 },
      note: 'A very thin atmosphere would barely show in transmission. Named as a remaining option by Piaulet-Ghorayeb+ 2025.',
    },
    {
      id: 'clouds', label: 'High-altitude clouds', status: 'consistent',
      world: 'cloudy', colors: ['#cfcac2', '#a9a49a', '#ebe7df', '#8a857c'],
      params: { bands: 0.5 },
      albedo: 0.6, redistribution: 0.6, hotspotShift: 15,
      atmosphere: { color: '#e0ddd5', sunset: '#ff9a6a', height: 0.06, intensity: 1.8 },
      note: 'A high cloud deck would flatten the transmission spectrum and hide the gases below — the other way to explain a featureless spectrum.',
    },
    {
      id: 'earth', label: 'Earth-like atmosphere', status: 'disfavoured',
      world: 'eyeball', colors: ['#1d3a5a', '#dfe6ea', '#6a5a45', '#f2f4f5'],
      params: { ocean: 70, land: 0.25, cloud: 0.6 },
      albedo: 0.3, redistribution: 0.6, hotspotShift: 20,
      atmosphere: N2_SKY,
      note: 'Water, CO₂ and methane in Earth-like amounts would have shown up in the spectrum. NASA: "unlikely".',
    },
  ],

  e: [
    {
      id: 'eyeball', label: 'N₂ + trace CH₄, ocean', status: 'hypothesis',
      world: 'eyeball', colors: ['#14365a', '#dfe7ec', '#5b5240', '#f0f3f5'],
      params: { ocean: 55, land: 0.12, cloud: 0.7 },
      albedo: 0.3, redistribution: 0.55, hotspotShift: 15,
      atmosphere: N2_SKY,
      note: 'Still allowed: a nitrogen-dominated atmosphere with traces of methane. Over an ocean, tidal locking makes an "eyeball" — open water under the star, ice beyond, a thick cloud deck at the substellar point.',
    },
    {
      id: 'bare', label: 'Bare rock', status: 'consistent',
      world: 'barerock', colors: ['#5d5248', '#2e2822', '#82766a', '#1b1714'],
      params: { craters: 14, relief: 0.5, plains: 0.3 },
      albedo: 0.15, redistribution: 0,
      note: 'Equally likely on current data (Glidden+ 2025). Fifteen more transits are scheduled to tell these apart.',
    },
    {
      id: 'snowball', label: 'Snowball under thin air', status: 'hypothesis',
      world: 'snowball', colors: ['#dfe6ea', '#a9b6bf', '#f6f9fb', '#7c8a94'],
      params: { cracks: 0.6, melt: 0.2 },
      albedo: 0.55, redistribution: 0.3, hotspotShift: 10,
      atmosphere: { ...N2_SKY, intensity: 0.9, height: 0.035 },
      note: 'If the ocean froze over, a bright ice shell would reflect much of the light. Not excluded.',
    },
    {
      id: 'co2', label: 'CO₂-dominated atmosphere', status: 'ruledout',
      world: 'cloudy', colors: ['#c8b6a0', '#a8957e', '#e2d4c2', '#8a7862'],
      params: { bands: 0.7 },
      albedo: 0.35, redistribution: 0.9, hotspotShift: 0,
      atmosphere: { color: '#e0c8a8', sunset: '#ff8a4a', height: 0.07, intensity: 2.0 },
      note: 'No strong CO₂ signal in four NIRSpec transits — a Venus- or Mars-like CO₂ atmosphere is ruled out, as is a hydrogen-rich one.',
    },
  ],

  f: [
    {
      id: 'snowball', label: 'Ice-covered', status: 'hypothesis',
      world: 'snowball', colors: ['#d6dce0', '#9aa6ae', '#f2f5f7', '#6f7c86'],
      params: { cracks: 0.7, melt: 0.1 },
      albedo: 0.5, redistribution: 0.2,
      note: 'At 37 % of Earth\'s sunlight, any surface water is likely frozen unless a thick greenhouse atmosphere warms it.',
    },
    {
      id: 'eyeball', label: 'Eyeball ocean under N₂', status: 'hypothesis',
      world: 'eyeball', colors: ['#123250', '#e3eaee', '#5b5240', '#f0f3f5'],
      params: { ocean: 32, land: 0.05, cloud: 0.6 },
      albedo: 0.4, redistribution: 0.5, hotspotShift: 15,
      atmosphere: N2_SKY,
      note: 'With enough heavy atmosphere, a patch of open ocean could survive beneath the star. Heavy-molecule atmospheres are not yet constrained.',
    },
    {
      id: 'bare', label: 'Bare rock', status: 'consistent',
      world: 'barerock', colors: ['#5c554e', '#2d2925', '#827870', '#1a1715'],
      params: { craters: 20, relief: 0.5, plains: 0.2 },
      albedo: 0.15, redistribution: 0,
      note: 'Allowed. NIRISS rules out only hydrogen/helium envelopes above ~20 mbar (Lim+ 2026).',
    },
    {
      id: 'h2', label: 'Hydrogen/helium envelope', status: 'ruledout',
      world: 'cloudy', colors: ['#b8c6d6', '#97a6b8', '#d6e0ea', '#7a889a'],
      params: { bands: 0.8 },
      albedo: 0.3, redistribution: 0.9,
      atmosphere: { color: '#b8d0ff', sunset: '#ffb08a', height: 0.12, intensity: 2.2 },
      note: 'A puffy H₂/He atmosphere thicker than ~20 mbar would have produced large features. Ruled out at 95 % confidence.',
    },
  ],

  g: [
    {
      id: 'snowball', label: 'Ice-covered', status: 'hypothesis',
      world: 'snowball', colors: ['#cfd8de', '#93a1aa', '#eef3f6', '#66737c'],
      params: { cracks: 0.85, melt: 0.05 },
      albedo: 0.55, redistribution: 0.2,
      note: 'A quarter of Earth\'s sunlight: an icy surface is the simplest expectation. Its density allows a substantial water fraction.',
    },
    {
      id: 'eyeball', label: 'Eyeball ocean under N₂', status: 'hypothesis',
      world: 'eyeball', colors: ['#10304c', '#e3eaee', '#5b5240', '#f0f3f5'],
      params: { ocean: 22, land: 0.04, cloud: 0.55 },
      albedo: 0.45, redistribution: 0.5, hotspotShift: 15,
      atmosphere: N2_SKY,
      note: 'Possible only with a strong greenhouse. Current data cannot test it.',
    },
    {
      id: 'bare', label: 'Bare rock', status: 'consistent',
      world: 'barerock', colors: ['#5a544e', '#2c2925', '#80776f', '#191715'],
      params: { craters: 20, relief: 0.5, plains: 0.2 },
      albedo: 0.15, redistribution: 0,
      note: 'Not excluded by anything measured so far.',
    },
  ],

  h: [
    {
      id: 'snowball', label: 'Frozen world', status: 'hypothesis',
      world: 'snowball', colors: ['#dad8d4', '#a29c94', '#f4f2ee', '#77716a'],
      params: { cracks: 0.5, melt: 0 },
      albedo: 0.6, redistribution: 0.15,
      note: 'Outside the habitable zone at 14 % of Earth\'s sunlight. Ice is the natural expectation.',
    },
    {
      id: 'bare', label: 'Bare rock', status: 'consistent',
      world: 'barerock', colors: ['#5e5852', '#2f2b27', '#847b73', '#1c1917'],
      params: { craters: 24, relief: 0.55, plains: 0.15 },
      albedo: 0.15, redistribution: 0,
      note: 'Not excluded. Its low density (4.1 g/cm³) hints at volatiles, which would favour ice.',
    },
  ],
};
