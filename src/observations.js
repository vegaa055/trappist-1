// What has been observed, and when.
//
// Links are included only where the identifier was checked against the
// source while building this; other entries name the paper without a link.

const doi = (id) => `https://doi.org/${id}`;
const arxiv = (id) => `https://arxiv.org/abs/${id}`;

export const OBSERVATIONS = {
  b: [
    { date: '2023 Mar', facility: 'JWST MIRI', what: '5 secondary eclipses at 15 µm', result: 'Dayside 503 ± 27 K: dark bare rock, no CO₂', ref: 'Greene+ 2023, Nature', url: doi('10.1038/s41586-023-05951-7') },
    { date: '2024', facility: 'JWST MIRI', what: 'Eclipses at 12.8 and 15 µm', result: '478 ± 27 K at 15 µm; bare rock or a hazy CO₂ atmosphere', ref: 'Ducrot+ 2024, Nature Astronomy' },
    { date: '2026 Apr', facility: 'JWST MIRI', what: '60 h thermal phase curve (with c)', result: 'Dayside 490 ± 17 K, night < 73 K: no thick atmosphere', ref: 'Gillon+ 2026, Nature Astronomy', url: doi('10.1038/s41550-026-02806-9') },
  ],
  c: [
    { date: '2023 Jun', facility: 'JWST MIRI', what: '4 secondary eclipses at 15 µm', result: 'Dayside 380 ± 31 K; Venus-like atmosphere ruled out', ref: 'Zieba+ 2023, Nature', url: doi('10.1038/s41586-023-06232-z') },
    { date: '2026 Apr', facility: 'JWST MIRI', what: '60 h thermal phase curve (with b)', result: 'Dayside 369 ± 23 K, night < 73 K: no thick atmosphere', ref: 'Gillon+ 2026, Nature Astronomy', url: doi('10.1038/s41550-026-02806-9') },
  ],
  d: [
    { date: '2018', facility: 'HST WFC3', what: 'Transmission spectra', result: 'No puffy hydrogen atmosphere', ref: 'de Wit+ 2018, Nature Astronomy' },
    { date: '2025 Aug', facility: 'JWST NIRSpec', what: 'Transmission spectrum', result: 'No H₂O, CH₄ or CO₂ features; Earth-like air unlikely', ref: 'Piaulet-Ghorayeb+ 2025, ApJ', url: doi('10.3847/1538-4357/adf207') },
  ],
  e: [
    { date: '2018', facility: 'HST WFC3', what: 'Transmission spectra', result: 'No puffy hydrogen atmosphere', ref: 'de Wit+ 2018, Nature Astronomy' },
    { date: '2025 Sep', facility: 'JWST NIRSpec', what: '4 transits', result: 'H₂-rich and CO₂-dominated ruled out; N₂ + trace CH₄ possible', ref: 'Espinoza+ 2025, ApJL', url: doi('10.3847/2041-8213/adf42e') },
    { date: '2025 Sep', facility: 'JWST NIRSpec', what: 'Same 4 transits, atmosphere retrieval', result: 'Equally likely to have or lack an atmosphere', ref: 'Glidden+ 2025, ApJL', url: doi('10.3847/2041-8213/adf62e') },
  ],
  f: [
    { date: '2018', facility: 'HST WFC3', what: 'Transmission spectra', result: 'No puffy hydrogen atmosphere', ref: 'de Wit+ 2018, Nature Astronomy' },
    { date: '2026 Aug', facility: 'JWST NIRISS SOSS', what: '5 transits', result: 'H₂/He > ~20 mbar ruled out; a flare in every visit', ref: 'Lim+ 2026, AJ (accepted)', url: arxiv('2608.17207') },
  ],
  g: [
    { date: '2018', facility: 'HST WFC3', what: 'Transmission spectra', result: 'No puffy hydrogen atmosphere', ref: 'de Wit+ 2018, Nature Astronomy' },
    { date: '2026 Aug', facility: 'JWST (archival)', what: 'Search for thermal emission', result: 'Data insufficient to decide', ref: 'arXiv:2608.18626', url: arxiv('2608.18626') },
  ],
  h: [
    { date: '2017', facility: 'Kepler K2', what: '79 days of photometry', result: 'Period 18.77 d, predicted from the resonance chain', ref: 'Luger+ 2017, Nature Astronomy' },
    { date: '2026 Aug', facility: 'JWST (archival)', what: 'Search for thermal emission', result: 'Data insufficient to decide', ref: 'arXiv:2608.18626', url: arxiv('2608.18626') },
  ],
};

export const TIMELINE = [
  { date: '2016 May', text: 'The TRAPPIST telescope finds three Earth-sized planets transiting a nearby ultracool dwarf.', ref: 'Gillon+ 2016' },
  { date: '2017 Feb', text: 'Spitzer and ground telescopes reveal seven: the largest known set of Earth-sized planets around one star, three in the habitable zone.', ref: 'Gillon+ 2017' },
  { date: '2017', text: 'K2 pins h at 18.77 days — the period the resonance chain predicted — and records frequent flares.', ref: 'Luger+ 2017; Vida+ 2017' },
  { date: '2018', text: 'Hubble rules out puffy hydrogen atmospheres on d, e, f and g.', ref: 'de Wit+ 2018' },
  { date: '2021', text: 'Four years of transit timing weigh every planet to 3–5 %: all rocky, slightly iron-poor compared with Earth.', ref: 'Agol+ 2021', url: doi('10.3847/PSJ/abd022') },
  { date: '2023 Mar', text: 'JWST measures b\'s dayside at ~500 K: a bare dark rock.', ref: 'Greene+ 2023', url: doi('10.1038/s41586-023-05951-7') },
  { date: '2023 Jun', text: 'JWST rules out a thick CO₂ atmosphere on c.', ref: 'Zieba+ 2023', url: doi('10.1038/s41586-023-06232-z') },
  { date: '2025 Aug', text: 'd shows no atmospheric features: Earth-like air unlikely.', ref: 'Piaulet-Ghorayeb+ 2025', url: doi('10.3847/1538-4357/adf207') },
  { date: '2025 Sep', text: 'e: hydrogen and CO₂ atmospheres ruled out; nitrogen with methane still possible.', ref: 'Espinoza+ / Glidden+ 2025', url: doi('10.3847/2041-8213/adf62e') },
  { date: '2026 Apr', text: 'Thermal phase curves: neither b nor c has a thick atmosphere; nights below −200 °C.', ref: 'Gillon+ 2026', url: doi('10.1038/s41550-026-02806-9') },
  { date: '2026 Aug', text: 'f\'s first JWST spectra: no hydrogen envelope, and a flare in every visit.', ref: 'Lim+ 2026', url: arxiv('2608.17207') },
  { date: 'Next', text: 'Fifteen more e transits timed to catch b and e back to back, so the star\'s variability can be subtracted. Beyond JWST: the ELT and the Habitable Worlds Observatory.', ref: 'NASA/STScI' },
];
