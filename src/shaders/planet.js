// Procedural planet / moon surfaces.
//
// One shader, nine surface routines selected by #define at compile time so no
// branch survives into the inner loop. Every surface is generated from noise —
// there are no image maps anywhere in this project.
//
// On top of the surface routines the shader also does:
//   * analytic bump mapping (height field sampled along two tangents)
//   * a soft terminator with a small light wrap
//   * inverse-power solar falloff, switchable to true inverse-square
//   * penumbral eclipse shadows from up to four occluders — this is what makes
//     Io drop a real shadow onto Jupiter's cloud tops
//   * ring shadows traced back along the sun ray through the ring plane

import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';
import { RING_DENSITY_GLSL } from './rings.js';

export const SURFACE_DEFINES = {
  cratered: 'SURF_CRATERED',
  terran: 'SURF_TERRAN',
  martian: 'SURF_MARTIAN',
  venusian: 'SURF_VENUSIAN',
  gasgiant: 'SURF_GASGIANT',
  icegiant: 'SURF_ICEGIANT',
  icy: 'SURF_ICY',
  volcanic: 'SURF_VOLCANIC',
  haze: 'SURF_HAZE',
};

const PLANET_VERT = /* glsl */ `
uniform float uOblate;

varying vec3 vDir;
varying vec3 vPosW;
varying vec3 vNormalW;

#include <common>
#include <logdepthbuf_pars_vertex>

void main() {
  vec3 d = normalize(position);
  vDir = d;

  // Rotational flattening. The drawn point is squashed in y; the surface
  // normal of the resulting spheroid is (x, y/b^2, z) with b = 1 - f.
  float b = 1.0 - uOblate;
  vec3 local = vec3(d.x, d.y * b, d.z);
  vec3 nLocal = normalize(vec3(d.x, d.y / b, d.z));

  vec4 world = modelMatrix * vec4(local, 1.0);
  vPosW = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * nLocal);

  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
`;

const PLANET_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDetail;
uniform float uSeed;

// three.js only declares modelMatrix in the vertex stage, so the body's world
// rotation is handed to the fragment stage explicitly.
uniform mat3 uModelRot;

uniform vec3 uSunPos;
uniform float uSunRadius;
uniform float uSunFalloff;
uniform vec3 uLightColor;     // colour of the starlight (2566 K, partially eye-adapted)
uniform float uFluxNorm;      // distance (AU) at which irradiance is 1
uniform float uUnitsPerAU;
uniform float uExposure;

uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

uniform float uBump;
uniform float uCraterDensity;
uniform float uCraterDepth;
uniform float uRoughness;
uniform float uMaria;
uniform float uGrooves;
uniform float uPolarStain;

uniform float uSeaLevel;
uniform float uCloud;
uniform float uSpecular;
uniform float uNightLights;

uniform float uIceCap;
uniform float uDust;

uniform float uBands;
uniform float uTurbulence;
uniform float uShear;
uniform float uSpot;
uniform float uSpotLat;
uniform float uSpotLon;
uniform float uSpotSize;
uniform float uHexPole;

uniform float uCracks;
uniform float uPlain;
uniform float uPlumes;
uniform float uVolcanoes;

uniform float uBandScale;
uniform float uFlow;

// Eclipse occluders (parent planet for a moon; moons for a planet).
uniform int uOccluderCount;
uniform vec3 uOccluderPos[4];
uniform float uOccluderRadius[4];

// Ring shadow cast onto the globe.
uniform float uHasRings;
uniform vec3 uBodyCenter;
uniform vec3 uRingNormal;
uniform float uRingInner;      // scene units
uniform float uRingOuter;
uniform float uRingSaturnProfile;
uniform float uRingShadowStrength;

varying vec3 vDir;
varying vec3 vPosW;
varying vec3 vNormalW;

#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
${RING_DENSITY_GLSL}

// ------------------------------------------------------------ height field --
// Only the solid-surface types define real relief; the gas bodies return 0 and
// the bump term multiplies out.
float surfaceHeight(vec3 d) {
#if defined(SURF_CRATERED)
  float base = fbm5(d * 3.4 + uSeed) * 0.55;
  float craters = craterField(d, uCraterDensity, uDetail) * uCraterDepth * 0.30;
  float rough = fbm4(d * 34.0) * 0.06 * uRoughness;
  return base + craters + rough;

#elif defined(SURF_TERRAN)
  return fbm7(d * 2.2 + uSeed) + fbm5(d * 7.0) * 0.14;

#elif defined(SURF_MARTIAN)
  float base = fbm6(d * 2.8 + uSeed);
  float craters = craterField(d, 14.0, uDetail) * 0.16;
  // Valles Marineris: a long gash just south of the equator.
  float canyon = exp(-pow((d.y + 0.13) / 0.030, 2.0))
               * smoothstep(0.1, 0.6, fbm3(d * 5.0 + 3.0))
               * step(0.0, d.x);
  return base + craters - canyon * 0.55;

#elif defined(SURF_ICY)
  return fbm5(d * 3.2 + uSeed) * 0.5 + fbm4(d * 18.0) * 0.06;

#elif defined(SURF_VOLCANIC)
  return fbm5(d * 3.8 + uSeed) * 0.35;

#else
  return 0.0;
#endif
}

// Perturb the local normal by the gradient of the height field, sampled with
// finite differences along two tangents.
vec3 bumpNormal(vec3 d, float h0, float scale) {
  if (scale <= 0.0001) return d;
  vec3 up = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(up, d));
  vec3 B = cross(d, T);
  float e = 0.0035;
  float ht = surfaceHeight(normalize(d + T * e));
  float hb = surfaceHeight(normalize(d + B * e));
  vec3 grad = (T * (ht - h0) + B * (hb - h0)) / e;
  return normalize(d - grad * scale * 0.06);
}

// --------------------------------------------------------------- surfaces ---
void shadeSurface(vec3 d, float h, out vec3 albedo, out float specStrength,
                  out float specPower, out vec3 emissive) {
  albedo = uColor0;
  specStrength = 0.0;
  specPower = 24.0;
  emissive = vec3(0.0);

  float lat = d.y;
  float alat = abs(lat);

#if defined(SURF_CRATERED)
  // Regolith: broad brightness variation, then craters lighten their rims and
  // darken their floors, then the big dark basins on top.
  float shade = smoothstep(-0.35, 0.45, fbm5(d * 2.6 + uSeed));
  albedo = mix(uColor1, uColor0, shade);

  float relief = craterField(d, uCraterDensity, uDetail) * uCraterDepth;
  albedo = mix(albedo, uColor2, clamp(relief, 0.0, 1.0) * 0.55);
  albedo = mix(albedo, uColor3, clamp(-relief, 0.0, 1.0) * 0.45);

  // Bright ejecta rays from the freshest impacts.
  vec2 w = worley(d * uCraterDensity * 0.42);
  float fresh = (1.0 - smoothstep(0.0, 0.55, w.x)) * step(0.80, hash13(floor(d * uCraterDensity * 0.42) + 5.0));
  float rays = fresh * smoothstep(0.35, 0.9, ridged4(d * 26.0)) * 0.5;
  albedo += uColor2 * rays;

  // Lunar maria: huge, dark, smooth flood basalt plains.
  float maria = smoothstep(0.22, 0.52, fbm3(d * 1.7 + 9.0)) * uMaria;
  albedo = mix(albedo, uColor3 * 1.25, maria * 0.8);

  // Ganymede's grooved terrain: parallel tectonic furrows.
  float grooves = smoothstep(0.55, 0.85, ridged5(d * 8.0 + 21.0)) * uGrooves;
  albedo = mix(albedo, uColor2, grooves * 0.5);

  // Charon's dark polar cap, stained by escaped Plutonian methane.
  float stain = smoothstep(0.72, 0.95, lat) * uPolarStain;
  albedo = mix(albedo, uColor3 * 0.8, stain * 0.75);

  specStrength = 0.02;
  specPower = 8.0;

#elif defined(SURF_TERRAN)
  float sea = uSeaLevel;
  float land = smoothstep(sea - 0.015, sea + 0.045, h);

  // Ocean: deep water is nearly black, shelves are brighter.
  vec3 ocean = mix(vec3(0.008, 0.030, 0.085), uColor0, smoothstep(sea - 0.30, sea, h));

  // Land biomes: an aridity field crossed with the subtropical dry belts.
  float dryBelt = exp(-pow((alat - 0.34) / 0.16, 2.0));
  float arid = clamp(smoothstep(0.05, 0.5, fbm5(d * 3.1 + 31.0)) * 0.6 + dryBelt * 0.75, 0.0, 1.0);
  vec3 ground = mix(uColor1, uColor2, arid);
  ground = mix(ground, vec3(0.30, 0.27, 0.24), smoothstep(sea + 0.16, sea + 0.34, h));

  // Snow line: poles plus high ground.
  float snow = clamp(smoothstep(0.68, 0.84, alat) + smoothstep(sea + 0.26, sea + 0.42, h), 0.0, 1.0);
  ground = mix(ground, uColor3, snow);

  albedo = mix(ocean, ground, land);

  // Sea ice
  float seaIce = (1.0 - land) * smoothstep(0.80, 0.90, alat);
  albedo = mix(albedo, uColor3 * 0.92, seaIce);

  specStrength = (1.0 - land) * (1.0 - seaIce) * uSpecular;
  specPower = 90.0;

  // City lights on the night side: on land, off the ice, thinning with latitude
  // and clustered on the coasts the way real ones are.
  float pop = clamp(fbm5(d * 22.0 + 77.0) * 1.9 + 0.5, 0.0, 1.0);
  float coastal = 1.0 - smoothstep(0.0, 0.22, h - sea);
  float cities = land * (1.0 - snow)
               * smoothstep(0.56, 0.90, pop * (0.65 + 0.5 * coastal))
               * smoothstep(0.92, 0.30, alat);
  emissive = vec3(1.0, 0.78, 0.42) * cities * uNightLights;

  // Weather deck, rotating slightly faster than the ground beneath it.
  vec3 cd = spinY(d, uTime * 0.35);
  float storm = turbulence5(warp(cd * 3.0 + vec3(0.0, 0.0, uTime * 0.05), 0.55));
  // Cloud belts: ITCZ near the equator, storm tracks at mid latitudes, clear
  // subtropics — the banded pattern you see from orbit.
  float belts = exp(-pow(lat / 0.10, 2.0)) * 0.7
              + exp(-pow((alat - 0.62) / 0.22, 2.0)) * 0.6
              + 0.35;
  float cloud = clamp(smoothstep(0.42, 0.78, storm) * belts * uCloud, 0.0, 1.0);
  albedo = mix(albedo, vec3(0.95, 0.96, 0.99), cloud);
  specStrength *= (1.0 - cloud);
  emissive *= (1.0 - cloud * 0.9);

#elif defined(SURF_MARTIAN)
  float shade = smoothstep(-0.4, 0.5, h);
  albedo = mix(uColor0, uColor1, shade);

  // Classic dark albedo features (Syrtis Major and friends).
  float dark = smoothstep(0.20, 0.62, fbm4(d * 2.0 + 7.0));
  albedo = mix(albedo, uColor2, dark * 0.6);

  // Wind-blown dust brightens the plains.
  float dust = smoothstep(0.3, 0.8, fbm5(d * 5.0 + 13.0)) * uDust;
  albedo = mix(albedo, uColor1 * 1.15, dust * 0.4);

  // Seasonal CO2 caps — the southern one is the bigger of the two.
  float capN = smoothstep(uIceCap + 0.06, uIceCap + 0.13, lat);
  float capS = smoothstep(uIceCap - 0.02, uIceCap + 0.06, -lat);
  float cap = clamp(capN + capS, 0.0, 1.0) * smoothstep(0.35, 0.65, fbm3(d * 9.0) * 0.5 + 0.6);
  albedo = mix(albedo, uColor3, cap);

  specStrength = 0.015;
  specPower = 10.0;

#elif defined(SURF_VENUSIAN)
  // Venus' atmosphere super-rotates: the cloud deck laps the planet in four
  // days while the ground takes 243, so the deck gets its own fast spin.
  vec3 p = spinY(d, uTime * 1.4);
  vec3 q = vec3(p.x, p.y * uBandScale, p.z) * 2.0;
  q = warp(q + vec3(0.0, 0.0, uTime * uFlow), 0.7);
  float v = fbm6(q);

  albedo = mix(uColor1, uColor0, smoothstep(-0.35, 0.4, v));
  albedo = mix(albedo, uColor2, smoothstep(0.3, 0.85, v) * 0.7);

  // The dark UV "Y" and the bright polar collars.
  float dark = smoothstep(0.45, 0.8, turbulence4(q * 1.6 + 5.0));
  albedo = mix(albedo, uColor3, dark * 0.35);
  albedo = mix(albedo, uColor2, smoothstep(0.75, 0.98, alat) * 0.5);

  specStrength = 0.0;

#elif defined(SURF_GASGIANT) || defined(SURF_ICEGIANT)
  // Zonal flow: each latitude band drifts at its own rate, so shear the
  // longitude of the sample point as a function of latitude before sampling.
  float jet = sin(lat * uBands * 3.14159) * 0.6 + lat * 0.35;
  vec3 p = spinY(d, uTime * 0.06 * uShear * jet);

  // Squash latitudinally so turbulence stretches into ribbons.
  vec3 q = vec3(p.x, p.y * uBands * 0.62, p.z) * 1.5 + uSeed;
  q = warp(q, uTurbulence * 0.65);

  float detailN = fbm6(q);

  // Belts and zones are not evenly spaced, so warp the latitude with a
  // one-dimensional field before indexing the bands. Being a function of
  // latitude alone, it stays constant along each parallel — which is exactly
  // how zonal banding behaves.
  float latW = lat + 0.06 * fbm3(vec3(uSeed, lat * 5.0, uSeed * 0.5))
                   + 0.03 * sin(lat * 7.3 + uSeed);
  float bandPhase = latW * uBands * 3.14159 + 0.8 * sin(latW * 3.7 + uSeed);
  float bandIdx = sin(bandPhase + detailN * 1.5);
  float belt = smoothstep(-0.55, 0.55, bandIdx + 0.5 * detailN);

  albedo = mix(uColor1, uColor0, belt);
  // Bright zone tops scale with how turbulent the atmosphere is, so Uranus
  // stays the near-featureless disc it actually is while Jupiter does not.
  albedo = mix(albedo, uColor2,
               smoothstep(0.35, 0.9, detailN * 0.7 + belt * 0.6) * clamp(uTurbulence, 0.12, 1.0));

  // Turbulent festoons where belts and zones shear past each other.
  float curl = smoothstep(0.5, 0.9, turbulence5(q * 2.2 + 17.0)) * uTurbulence;
  albedo = mix(albedo, uColor2 * 1.05, curl * 0.25 * (1.0 - abs(belt - 0.5) * 1.6));

  // Polar hoods
  albedo = mix(albedo, uColor1 * 0.72, smoothstep(0.78, 1.0, alat));

  // Saturn's north polar hexagon.
  if (uHexPole > 0.5) {
    float polar = smoothstep(0.86, 0.995, lat);
    float lonP = atan(d.z, d.x);
    float hexEdge = cos(6.0 * lonP + uTime * 0.02);
    albedo = mix(albedo, uColor1 * 0.85, polar * smoothstep(0.2, 0.9, hexEdge) * 0.6);
  }

  // The Great Red Spot / Great Dark Spot: an anticyclonic oval whose interior
  // is swirled around its own centre.
  if (uSpot > 0.5) {
    float lonF = atan(p.z, p.x);
    float latF = asin(clamp(p.y, -1.0, 1.0));
    float dlon = atan(sin(lonF - uSpotLon), cos(lonF - uSpotLon));
    float dlat = latF - uSpotLat;
    vec2 ev = vec2(dlon * cos(latF) * 0.62, dlat) / uSpotSize;
    float r = length(ev);
    float mask = 1.0 - smoothstep(0.55, 1.0, r);

    // Differential rotation inside the vortex: the swirl angle winds up toward
    // the centre, which is what draws the spiral.
    float ang = atan(ev.y, ev.x) + (1.6 - r) * 2.6 + uTime * 0.25;
    float swirl = fbm4(vec3(cos(ang), sin(ang), r * 1.5) * 2.4 + r * 5.0);
    vec3 spotCol = mix(uColor3 * 0.82, uColor3 * 1.35, smoothstep(-0.35, 0.45, swirl));
    // The rim entrains surrounding cloud, so fade into the local band colour.
    spotCol = mix(spotCol, albedo, smoothstep(0.55, 1.0, r) * 0.7);
    albedo = mix(albedo, spotCol, mask * 0.9);

    // Turbulent wake trailing west of the vortex.
    float wake = (1.0 - smoothstep(0.0, 1.0, abs(ev.y) * 1.6))
               * smoothstep(1.0, 2.6, -ev.x)
               * smoothstep(2.0, 4.5, -ev.x + 3.0);
    albedo = mix(albedo, mix(albedo, uColor3, 0.45), wake * 0.5 * smoothstep(0.3, 0.7, swirl));
  }

  specStrength = 0.0;

#elif defined(SURF_ICY)
  float shade = smoothstep(-0.3, 0.4, h);
  albedo = mix(uColor1, uColor0, shade);
  albedo = mix(albedo, uColor2, smoothstep(0.15, 0.6, fbm4(d * 5.0 + 3.0)) * 0.5);

  // Lineae: the long dark fractures that criss-cross Europa.
  float cracks = smoothstep(0.62, 0.93, ridged5(d * 5.5 + uSeed));
  float cracks2 = smoothstep(0.70, 0.96, ridged4(d * 11.0 + 44.0));
  albedo = mix(albedo, uColor3, (cracks * 0.8 + cracks2 * 0.4) * uCracks);

  // Pluto's Sputnik Planitia: one enormous bright nitrogen-ice plain.
  if (uPlain > 0.01) {
    float blob = fbm3(d * 1.9 + 4.3) + 0.65 * exp(-pow((lat + 0.02) / 0.32, 2.0))
               * smoothstep(-0.6, 0.4, d.x);
    float plain = smoothstep(0.52, 0.78, blob) * uPlain;
    albedo = mix(albedo, uColor2 * 1.06, plain);
    // Convection cells inside the plain
    vec2 cw = worley(d * 26.0);
    albedo = mix(albedo, albedo * 0.86, plain * smoothstep(0.12, 0.0, cw.y - cw.x));
  }

  // Triton's cantaloupe terrain plus its nitrogen geyser streaks.
  if (uPlumes > 0.01) {
    vec2 cw = worley(d * 9.0);
    albedo = mix(albedo, uColor1, smoothstep(0.18, 0.0, cw.y - cw.x) * 0.5);
    float streak = smoothstep(0.55, 0.95, fbm4(vec3(d.x * 3.0, d.y * 26.0, d.z * 3.0)))
                 * smoothstep(0.05, -0.6, lat);
    albedo = mix(albedo, uColor3 * 0.7, streak * uPlumes * 0.7);
  }

  specStrength = 0.06;
  specPower = 40.0;

#elif defined(SURF_VOLCANIC)
  // Io: sulfur allotropes in every shade of yellow, orange and red.
  float s1 = fbm5(d * 3.2 + uSeed);
  albedo = mix(uColor0, uColor1, smoothstep(-0.35, 0.35, s1));
  albedo = mix(albedo, uColor2, smoothstep(0.35, 0.8, fbm4(d * 6.5 + 11.0)) * 0.7);

  // Volcanic centres: dark calderas ringed by fresh flows.
  vec2 w = worley(d * 6.5 + uSeed);
  float vent = 1.0 - smoothstep(0.0, 0.16, w.x);
  float flowField = 1.0 - smoothstep(0.10, 0.42, w.x);
  albedo = mix(albedo, uColor3 * 1.2, flowField * 0.45 * uVolcanoes);
  albedo = mix(albedo, uColor3 * 0.4, vent * 0.9 * uVolcanoes);

  // Active vents glow — visible on the night side.
  float hot = smoothstep(0.55, 1.0, vent) * step(0.55, hash13(floor(d * 6.5 + uSeed)));
  emissive = vec3(1.0, 0.30, 0.06) * hot * uVolcanoes * 1.4;

  specStrength = 0.02;
  specPower = 12.0;

#elif defined(SURF_HAZE)
  // Titan: an orange organic smog so thick the ground never shows through.
  vec3 p = spinY(d, uTime * 0.02);
  vec3 q = vec3(p.x, p.y * uBandScale, p.z) * 1.7;
  q = warp(q + vec3(0.0, 0.0, uTime * uFlow), 0.4);
  float v = fbm5(q);
  albedo = mix(uColor1, uColor0, smoothstep(-0.4, 0.45, v));
  albedo = mix(albedo, uColor2, smoothstep(0.35, 0.9, v) * 0.5);
  // The northern polar hood.
  albedo = mix(albedo, uColor2 * 0.9, smoothstep(0.55, 0.95, lat) * 0.5);
  specStrength = 0.0;
#endif
}

// ------------------------------------------------------------- shadowing ----
// Fraction of the solar disc still visible past every occluder. Comparing the
// angular radius of the occluder with that of the Sun gives a real penumbra,
// and an annular case when the occluder is the smaller of the two.
float eclipseFactor(vec3 P, vec3 L, float sunDist) {
  float vis = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uOccluderCount) break;
    vec3 rel = uOccluderPos[i] - P;
    float along = dot(rel, L);
    if (along <= 0.0 || along > sunDist) continue;
    float perp = length(rel - along * L);

    float occAng = uOccluderRadius[i] / along;
    float sunAng = uSunRadius / sunDist;
    float sep = perp / along;

    float covered = 1.0 - smoothstep(max(occAng - sunAng, 0.0), occAng + sunAng, sep);
    float maxCover = clamp((occAng * occAng) / max(sunAng * sunAng, 1e-9), 0.0, 1.0);
    vis *= 1.0 - covered * maxCover;
  }
  return vis;
}

// Trace the sun ray back to the ring plane; if it crosses inside the ring,
// attenuate by the ring's own optical depth at that radius.
float ringShadow(vec3 P, vec3 L) {
  if (uHasRings < 0.5) return 1.0;
  float denom = dot(L, uRingNormal);
  if (abs(denom) < 1e-6) return 1.0;
  float t = dot(uBodyCenter - P, uRingNormal) / denom;
  if (t <= 0.0) return 1.0;
  vec3 hit = P + L * t;
  float r = length(hit - uBodyCenter);
  if (r < uRingInner || r > uRingOuter) return 1.0;
  float u = (r - uRingInner) / max(uRingOuter - uRingInner, 1e-6);
  float density = ringDensity(u, uRingSaturnProfile);
  return 1.0 - clamp(density, 0.0, 1.0) * uRingShadowStrength;
}

void main() {
  #include <logdepthbuf_fragment>

  vec3 d = normalize(vDir);

  float h = surfaceHeight(d);
  vec3 nLocal = bumpNormal(d, h, uBump);

  // Re-express the bumped normal in world space. Oblateness is applied in the
  // shader, so the body's world transform is a pure rotation plus uniform scale.
  vec3 Nsphere = normalize(vNormalW);
  vec3 N = normalize(uModelRot * nLocal);
  // Keep the geometric (oblate) normal where the bump is disabled.
  N = normalize(mix(Nsphere, N, step(0.0001, uBump)));

  vec3 albedo;
  float specStrength, specPower;
  vec3 emissive;
  shadeSurface(d, h, albedo, specStrength, specPower, emissive);

  vec3 toSun = uSunPos - vPosW;
  float sunDist = length(toSun);
  vec3 L = toSun / sunDist;
  vec3 V = normalize(cameraPosition - vPosW);

  float ndl = dot(N, L);
  // A little wrap softens the terminator without smearing it into mush.
  float lambert = clamp((ndl + 0.045) / 1.045, 0.0, 1.0);
  lambert = pow(lambert, 0.9);

  float shadow = eclipseFactor(vPosW, L, sunDist) * ringShadow(vPosW, L);

  float au = sunDist / uUnitsPerAU;
  float irradiance = pow(uFluxNorm / max(au, 1e-4), uSunFalloff);

  vec3 H = normalize(L + V);
  float spec = specStrength * pow(max(dot(N, H), 0.0), specPower)
             * step(0.0, ndl) * shadow;

  vec3 color = albedo * lambert * shadow * irradiance * uLightColor;
  color += uLightColor * spec * irradiance;

  // Ambient starlight so the night side is not a pure black cutout.
  color += albedo * 0.006;

  // Night-side emission (city lights, lava) fades as the Sun comes up.
  float night = 1.0 - smoothstep(-0.08, 0.12, ndl * shadow);
  color += emissive * night;

  gl_FragColor = vec4(color * uExposure, 1.0);
}
`;

const DEFAULT_PARAMS = {
  bump: 0, craterDensity: 20, craterDepth: 1, roughness: 1, maria: 0, grooves: 0, polarStain: 0,
  seaLevel: 0, cloud: 0, specular: 0, nightLights: 0,
  iceCap: 0.85, dust: 0,
  bands: 8, turbulence: 0.5, shear: 0.5, spot: 0, spotLat: 0, spotLon: 0, spotSize: 0.2, hexPole: 0,
  cracks: 0, plain: 0, plumes: 0, volcanoes: 0,
  bandScale: 2, flow: 0.2,
};

let seedCounter = 0;

export function createPlanetMaterial(body) {
  const p = { ...DEFAULT_PARAMS, ...(body.params || {}) };
  const colors = body.colors || ['#888888', '#555555', '#bbbbbb', '#333333'];
  const define = SURFACE_DEFINES[body.surface];
  if (!define) throw new Error(`unknown surface type "${body.surface}" on ${body.id}`);

  return new THREE.ShaderMaterial({
    defines: { [define]: '' },
    uniforms: {
      uTime: { value: 0 },
      uDetail: { value: 1 },
      uSeed: { value: (seedCounter++ * 37.13) % 100 },
      uOblate: { value: body.oblateness || 0 },
      uModelRot: { value: new THREE.Matrix3() },

      uSunPos: { value: new THREE.Vector3() },
      uSunRadius: { value: 1 },
      uSunFalloff: { value: 0.35 },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uFluxNorm: { value: 1 },
      uUnitsPerAU: { value: 50 },
      uExposure: { value: 1 },

      uColor0: { value: new THREE.Color(colors[0]) },
      uColor1: { value: new THREE.Color(colors[1]) },
      uColor2: { value: new THREE.Color(colors[2]) },
      uColor3: { value: new THREE.Color(colors[3]) },

      uBump: { value: p.bump },
      uCraterDensity: { value: p.craterDensity },
      uCraterDepth: { value: p.craterDepth },
      uRoughness: { value: p.roughness },
      uMaria: { value: p.maria },
      uGrooves: { value: p.grooves },
      uPolarStain: { value: p.polarStain },

      uSeaLevel: { value: p.seaLevel },
      uCloud: { value: p.cloud },
      uSpecular: { value: p.specular },
      uNightLights: { value: p.nightLights },

      uIceCap: { value: p.iceCap },
      uDust: { value: p.dust },

      uBands: { value: p.bands },
      uTurbulence: { value: p.turbulence },
      uShear: { value: p.shear },
      uSpot: { value: p.spot },
      uSpotLat: { value: p.spotLat },
      uSpotLon: { value: p.spotLon },
      uSpotSize: { value: p.spotSize },
      uHexPole: { value: p.hexPole },

      uCracks: { value: p.cracks },
      uPlain: { value: p.plain },
      uPlumes: { value: p.plumes },
      uVolcanoes: { value: p.volcanoes },

      uBandScale: { value: p.bandScale },
      uFlow: { value: p.flow },

      uOccluderCount: { value: 0 },
      uOccluderPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uOccluderRadius: { value: [0, 0, 0, 0] },

      uHasRings: { value: body.rings ? 1 : 0 },
      uBodyCenter: { value: new THREE.Vector3() },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uRingInner: { value: 0 },
      uRingOuter: { value: 0 },
      uRingSaturnProfile: { value: 0 },
      uRingShadowStrength: { value: 0.92 },
    },
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
  });
}
