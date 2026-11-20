// Habitable-zone limits and simple thermal estimates.

import { AU_KM } from './constants.js';
import { STAR } from './data.js';

/**
 * Kopparapu et al. 2013/2014 effective-flux limits, S_eff = S☉ + aT + bT² + cT³ + dT⁴
 * with T = Teff − 5780 K. The fit is calibrated for 2600–7200 K; TRAPPIST-1 at
 * 2566 K is just below, so Teff is clamped to 2600 (a 34 K extrapolation would
 * move the limits by under 1 %).
 */
const KOPPARAPU = {
  recentVenus:      [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15],
  runawayGreenhouse:[1.107, 1.332e-4, 1.580e-8, -8.308e-12, -1.931e-15],
  maxGreenhouse:    [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  earlyMars:        [0.320, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16],
};

export function habitableZone(teff = STAR.teff, lum = STAR.luminositySun) {
  const T = Math.max(2600, Math.min(7200, teff)) - 5780;
  const out = {};
  for (const [key, [s, a, b, c, d]] of Object.entries(KOPPARAPU)) {
    const seff = s + a * T + b * T * T + c * T ** 3 + d * T ** 4;
    out[key] = { seff, au: Math.sqrt(lum / seff) };
  }
  return out;
}

const R_STAR_AU = STAR.radiusKm / AU_KM;

/** Equilibrium temperature for Bond albedo A and full heat redistribution. */
export function equilibriumTemp(aAU, albedo = 0) {
  return STAR.teff * Math.sqrt(R_STAR_AU / (2 * aAU)) * Math.pow(1 - albedo, 0.25);
}

/**
 * Dayside brightness temperature of an airless, zero-albedo rock that
 * re-radiates instantly: T = T★·√(R★/a)·(2/3)^¼. This is the yardstick JWST's
 * 15 µm eclipses are compared against (b: predicted 508 K, measured ≈ 500 K).
 */
export function bareRockDaysideTemp(aAU) {
  return STAR.teff * Math.sqrt(R_STAR_AU / aAU) * Math.pow(2 / 3, 0.25);
}

/** Substellar-point temperature of the same bare rock. */
export function substellarTemp(aAU) {
  return STAR.teff * Math.sqrt(R_STAR_AU / aAU);
}

/** Angular diameter of the star seen from distance d (AU), in degrees. */
export function starAngularDiameter(dAU) {
  return 2 * Math.atan(R_STAR_AU / dAU) * 180 / Math.PI;
}
