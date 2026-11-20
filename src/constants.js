// Physical constants and unit conventions.
//
// Simulation units:  length = AU, time = days, mass = solar masses.
// In those units the gravitational constant is the square of the Gaussian
// gravitational constant k = 0.01720209895 (AU^1.5 / day / sqrt(Msun)).

export const K_GAUSS = 0.01720209895;
export const G = K_GAUSS * K_GAUSS;          // AU^3 / (Msun * day^2)

export const AU_KM = 149597870.7;
export const MSUN_KG = 1.98847e30;
export const MEARTH_MSUN = 3.00348961e-6;    // Earth mass in solar masses
export const REARTH_KM = 6371.0;
export const RSUN_KM = 695700;
export const DAY_S = 86400;
export const AUD_TO_KMS = AU_KM / DAY_S;     // 1 AU/day in km/s
export const LIGHT_YEAR_KM = 9.4607e12;

export const DEG = Math.PI / 180;

/**
 * Reference epoch of Agol et al. 2021, Table 2: the osculating Jacobi elements
 * are given at BJD_TDB - 2,450,000 = 7257.93115525 (27 Aug 2015). Transit times
 * t0 in that table are on the same BJD - 2,450,000 scale.
 */
export const BJD_OFFSET = 2450000;
export const AGOL_EPOCH = 7257.93115525;
export const AGOL_EPOCH_JD = BJD_OFFSET + AGOL_EPOCH;

// Rendering scale: scene units per AU. The whole system fits inside 0.065 AU,
// so this is far larger than the solar-system project's 50.
export const UNITS_PER_AU = 1000;

// The star is drawn at true size by default — R*/a_b ≈ 1/21, so it is plainly
// visible. Planets get a modest enlargement; "true scale" sets both to 1.
export const DEFAULT_PLANET_SCALE = 4;
export const DEFAULT_STAR_SCALE = 1;

// Integrator. b has P = 1.51 d; 0.004 d gives ~380 steps per orbit of b with a
// fourth-order symplectic scheme, which keeps transit times accurate to well
// under a second over decades.
export const DT_MAX = 0.004;
export const MAX_SUBSTEPS = 6000;
export const MAX_DAYS_PER_FRAME = DT_MAX * MAX_SUBSTEPS;

// No softening needed in practice — the closest planet-planet approaches are
// ~0.004 AU — but a tiny value keeps the force law finite. 1e-14 AU^2 => 1e-7 AU
// ≈ 15 km, far inside any body.
export const SOFTENING2 = 1e-14;
