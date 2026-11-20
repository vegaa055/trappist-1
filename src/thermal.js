// Surface temperatures of tidally locked planets, and what JWST's 15 µm
// eclipse photometry would see of them.
//
// One permanent day side faces the star. The local temperature uses the
// standard energy-balance split between heat re-radiated where it lands and
// heat carried around the planet (cf. Cowan & Agol 2011):
//
//     T⁴(θ) = (1−A)·T₀⁴·[ (1−ε)·max(cos θ, 0) + ε/4 ]       T₀ = T★·√(R★/a)
//
// A is the Bond albedo; ε the redistribution efficiency (0 = bare rock, each
// patch in equilibrium with its own sunlight; 1 = uniform temperature). The
// global mean of T⁴ is (1−A)·T₀⁴/4 for any ε, so energy balances. An interior
// floor keeps an airless night side from reaching 0 K.

import { AU_KM } from './constants.js';
import { STAR } from './data.js';

const C2 = 14388;                // µm·K
const R_STAR_AU = STAR.radiusKm / AU_KM;
export const T_FLOOR = 40;       // K — interior heat flow + starlight from neighbours

export const irradiationTemp = (aAU) => STAR.teff * Math.sqrt(R_STAR_AU / aAU);

export function localTemp(cosTheta, { albedo, redistribution }, T0) {
  const day = Math.max(cosTheta, 0);
  const t4 = (1 - albedo) * T0 ** 4 * ((1 - redistribution) * day + redistribution / 4);
  return Math.max(Math.pow(t4, 0.25), T_FLOOR);
}

// Planck function shape at wavelength λ (µm), arbitrary units.
const planck = (lambda, T) => 1 / Math.expm1(C2 / (lambda * T));
const brightnessTemp = (lambda, B) => C2 / (lambda * Math.log1p(1 / B));

/**
 * Disc-averaged brightness temperature of the hemisphere centred on a given
 * point, at wavelength λ. At secondary eclipse JWST looks straight down on the
 * substellar point, so for `facing = 'day'` the disc weight is μ = cos θ:
 *     B(T_b) = 2 ∫₀¹ B(T(μ)) μ dμ
 */
export function hemisphereBrightnessTemp(scenario, aAU, { lambda = 15, facing = 'day' } = {}) {
  const T0 = irradiationTemp(aAU);
  const n = 400;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const mu = (i + 0.5) / n;
    const cosTheta = facing === 'day' ? mu : -mu;
    sum += planck(lambda, localTemp(cosTheta, scenario, T0)) * mu;
  }
  return brightnessTemp(lambda, 2 * sum / n);
}

/** Summary used by the info card. */
export function thermalSummary(scenario, aAU) {
  const T0 = irradiationTemp(aAU);
  return {
    substellar: localTemp(1, scenario, T0),
    day15: hemisphereBrightnessTemp(scenario, aAU, { facing: 'day' }),
    night15: hemisphereBrightnessTemp(scenario, aAU, { facing: 'night' }),
    antistellar: localTemp(-1, scenario, T0),
  };
}

/**
 * Colour scale for the thermal view: a fixed 0–600 K range so planets can be
 * compared with each other and with the JWST numbers.
 */
export const THERMAL_RANGE = [0, 600];
