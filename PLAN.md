# TRAPPIST-1 — 3D simulation plan

A browser simulation of the TRAPPIST-1 system, built on the same foundation as
`../3d-solar-system`: vendored three.js r160, no build step, direct N-body
gravitation, and procedural GLSL surfaces with no image textures.

The goal is a model that is **true to what is measured and honest about what is
not**. Every visual choice for a planet should trace back to an observation, and
where the observations leave several answers open, the simulation shows the
choices instead of picking one.

---

## 1. What the science says (as of Nov 2026)

### The star — TRAPPIST-1 (2MASS J23062928-0502285)

| Property | Value | Source |
| --- | --- | --- |
| Spectral type | M8 V, ultracool dwarf, fully convective | — |
| Mass | 0.0898 ± 0.0023 M☉ | Agol+ 2021 (via Mann+ 2019) |
| Radius | 0.1192 ± 0.0013 R☉ (≈ 82,900 km, ~1.2 R♃) | Agol+ 2021 |
| Teff | 2566 ± 26 K | Agol+ 2021 |
| Luminosity | 5.53 × 10⁻⁴ L☉ | Agol+ 2021 (via Ducrot+ 2020) |
| Density | 53.2 ρ☉ (75 g/cm³) | Agol+ 2021 photodynamics |
| Age | 7.6 ± 2.2 Gyr | Burgasser & Mamajek 2017 |
| Rotation | ~3.3 d | K2 photometry (Luger+ 2017; approximate) |
| Distance | ~40.7 ly (12.47 pc) | Gaia |

**Activity** is the headline JWST lesson: it is *"much more intense than
originally predicted"* (NASA, Jan 2026). Flares and unocculted spots/faculae
contaminate transmission spectra, so far more transits are needed than planned.
The 2026 NIRISS study of planet f saw **at least one flare per visit** across
five transits.

### The planets — Agol et al. 2021 (PSJ 2, 1)

Masses to 3–5 %, from transit-timing variations. All seven fit a single rocky
mass–radius relation, ~21 wt % iron (Earth ≈ 32 %) — slightly less dense than
Earth-like rock.

| | P (d) | a (AU) | M (M⊕) | R (R⊕) | ρ (g/cm³) | S (S⊕) | i (°) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| b | 1.510826 | 0.01154 | 1.374 | 1.116 | 5.43 | 4.15 | 89.73 |
| c | 2.421937 | 0.01580 | 1.308 | 1.097 | 5.45 | 2.21 | 89.78 |
| d | 4.049219 | 0.02227 | 0.388 | 0.788 | 4.35 | 1.12 | 89.90 |
| e | 6.101013 | 0.02925 | 0.692 | 0.920 | 4.89 | 0.65 | 89.79 |
| f | 9.207540 | 0.03849 | 1.039 | 1.045 | 5.01 | 0.37 | 89.74 |
| g | 12.352446 | 0.04683 | 1.321 | 1.129 | 5.04 | 0.25 | 89.74 |
| h | 18.772866 | 0.06189 | 0.326 | 0.755 | 4.15 | 0.14 | 89.81 |

Initial conditions come from Agol's Table 2: osculating **Jacobi** elements
(P, t₀, e cos ω, e sin ω, mass ratio) at BJD_TDB 2457257.93115525
(27 Aug 2015). Eccentricities are all < 0.01.

**Resonant chain.** Neighbouring period ratios are near 8:5, 5:3, 3:2, 3:2, 4:3,
3:2, and every consecutive triplet satisfies a three-body Laplace relation
`p/P₁ − (p+q)/P₂ + q/P₃ ≈ 0` with (p, q) = (2,3), (1,2), (2,3), (1,2), (1,1). The
outer five share a TTV super-period of ~491 d. This is the system's defining
dynamical feature and the simulation should make it visible.

**Habitable zone** (Kopparapu+ 2013/14 at Teff 2600 K, the fit's lower limit):

| Boundary | S_eff | Distance |
| --- | --- | --- |
| Recent Venus (optimistic inner) | 1.46 | 0.0194 AU |
| Runaway greenhouse (conservative inner) | 0.91 | 0.0246 AU |
| Maximum greenhouse (conservative outer) | 0.22 | 0.0498 AU |
| Early Mars (optimistic outer) | 0.20 | 0.0526 AU |

So e, f, g are inside the conservative zone, d sits just inside its inner edge,
and h is outside it.

### What JWST has found, planet by planet

| Planet | Observation | Result | Status |
| --- | --- | --- | --- |
| **b** | MIRI 15 µm, 5 secondary eclipses (Greene+ 2023, *Nature*) | Dayside ≈ 500 K; matches a dark bare rock with no heat redistribution; no CO₂ absorption | No thick atmosphere |
| **c** | MIRI 15 µm, 4 eclipses (Zieba+ 2023, *Nature*) | Dayside ≈ 380 K; bare rock or thin CO₂ without clouds; Venus-like ruled out | No thick CO₂ atmosphere |
| **b + c** | 60 h thermal phase curves through a full orbit (Gillon+ 2026, *Nature Astronomy*, 3 Apr 2026) | Days ~200 °C / ~100 °C, nights below −200 °C; heat is not carried to the night side | **No thick atmosphere on either** |
| **d** | NIRSpec transmission (Piaulet-Ghorayeb+ 2025, *ApJ*) | No H₂O, CH₄ or CO₂ features; Earth-like atmosphere unlikely | Bare rock, thin Mars-like air, or high clouds |
| **e** | NIRSpec, 4 transits (Espinoza+ / Glidden+ 2025, *ApJL*) | H₂-rich and CO₂-dominated ruled out; an N₂-dominated secondary atmosphere with traces of CH₄ is still possible | 50/50 — 15 more transits scheduled |
| **f** | NIRISS SOSS, 5 transits (Lim+ 2026, accepted *AJ*) | H₂/He atmospheres > ~20 mbar ruled out at 95 %; no spot contamination; flares every visit | Heavy-molecule atmospheres unconstrained |
| **g, h** | Archival re-analyses (2026) | Data insufficient to decide | Open |

A useful sanity check the simulation can show: the bare-rock, no-redistribution
dayside temperature `T = T★·√(R★/a)·(2/3)^¼` gives **508 K for b** — exactly what
MIRI measured — and **434 K for c**, against a measured 380 K. That gap at c is
one of the reasons a thin atmosphere or a brighter surface there is not ruled
out.

---

## 2. Design principles

1. **Physics is never faked.** Positions come from a direct 8-body integration
   seeded with Agol 2021's Jacobi elements. Only the *drawn radii* are scaled.
2. **Observed → default, unconstrained → choice.** Each planet has a default
   appearance driven by JWST results and, where those results leave options
   open, a set of named **scenarios** (e.g. e: *bare rock* / *thin N₂ + CH₄* /
   *ocean eyeball*). The info card says which one is measured and which is a
   hypothesis.
3. **Every claim is cited.** Info cards carry the instrument, date and paper.
4. **Show the observing geometry.** The system is oriented with Earth's line of
   sight built in, so transits, light curves and "the view JWST has" fall out
   of the same simulation.
5. **Reuse the solar-system code, don't fork its look.** An M8 dwarf at 2566 K
   and seven tidally locked rocky worlds are a different subject; new shaders
   where the physics differs.

## 3. Architecture

```
index.html, styles.css
vendor/                 three.js r160 + bloom postprocessing (copied)
src/
  constants.js          units (AU, day, M☉), G, scale defaults, integrator step
  data.js               star + 7 planets: Agol Table 2 & 6, JWST findings, scenarios
  orbital.js            Kepler solver, elements <-> state (copied), Jacobi -> Cartesian
  physics.js            N-body with 4th-order Yoshida symplectic integrator
  system.js             initial conditions from transit ephemerides, sky -> system frame
  habitable.js          Kopparapu HZ limits, equilibrium & dayside temperatures
  resonance.js          period ratios, Laplace angles, mean longitudes
  scene.js              scene graph, per-frame sync, orbits, trails, HZ band, labels
  controls.js           camera (copied)
  ui.js                 panel, planet picker, info cards, resonance readout
  shaders/
    noise.js            (copied)
    star.js             M-dwarf photosphere, spots, faculae, flares       [Phase 2]
    planet.js           tidally locked rocky surfaces + thermal mode         [Phase 3]
    atmosphere.js       thin-atmosphere scenarios                             [Phase 3]
    habitable.js        HZ annulus
    stars.js            starfield + Milky Way (copied)
  observe/                                                                  [Phase 4]
    transit.js          sky-projected overlap, limb-darkened flux
    lightcurve.js       rolling light-curve canvas, flare & spot modulation
tools/
  verify-transits.mjs   Node: integrate, detect transits, compare to Agol
```

### Frames

Agol's elements are in the **sky frame** (X, Y on the sky, Z toward the
observer; transit at ω + f = 90°, Ω = 0 for all planets). That frame is rotated
so the mean orbital plane becomes the scene's horizontal plane:
`x_sys = X_sky, y_sys = Z_sky, z_sys = −Y_sky`. The direction to Earth is then
exactly `+y_sys`, the ~0.1–0.3° spread in inclination survives as real tilt, and
a planet transits when it is on the +y side with sky-projected separation
< R★ + Rₚ.

### Integrator

Seven planets with periods from 1.5 to 18.8 d. Fourth-order Yoshida composition
of leapfrog (3 force evaluations per step) at Δt = 0.004 d — ~380 steps per
orbit of b. The 8-body force sum is 28 pairs, so even 100 simulated days per
second is ~25,000 steps/s, trivial in JS. Energy drift is shown live as in the
solar-system project.

Starting "today" means integrating ~4,100 days forward from the 2015 epoch.
That runs at boot in chunks behind the progress overlay (~1 s), and it is the
honest way to get there: TTVs shape the state, so a Keplerian shortcut would
be wrong.

### Scale

The system is tiny: h orbits at 0.062 AU, a sixth of Mercury's distance. The
star is drawn **at true size by default** (R★/a_b ≈ 1/21, so it is clearly
visible), and planets at ~4× life size. A *true scale* button sets both to 1×.

---

## 4. Phases

Each phase ends in something that runs and can be looked at.

### Phase 1 — Foundation & dynamics ✅ done (20 Nov 2026)
*Goal: the real system moving correctly, verified against the data.*

**Result** (`npm run verify`, 1,500 d from the 2015 epoch, 0.9 s in Node):

| Check | Published | Simulated |
| --- | --- | --- |
| b transit, Agol T15 forecast epochs 1, 2 | 7259.061221, 7260.572662 | Δ < 0.01 min |
| b / c / d observed transits (Agol T14) | σ 1.0 / 2.0 / 3.3 min | Δ 3.7 / 0.2 / 6.5 min |
| Transit durations b…h (Agol T5) | 36.06 … 76.16 min | all within 0.5 min |
| TTV half-amplitudes b…h | tens of minutes | 3.5, 5.3, 31, 31, 54, 37, 46 min |
| Laplace angles at epoch | librating | φ_bcd 177°, φ_cde 47°, φ_fgh 178°, all bounded |
| Energy drift | — | ~5 × 10⁻¹² |

**Convention found the hard way:** Agol's e cos ω / e sin ω only reproduce the
observed TTVs with the observer on **−Z** (transit at ω + f = −90°). With the
Winn-style +Z observer, outer-planet TTVs balloon to ~6 h and d misses its
observed transit by 4 h. `system.js` documents this.

Deferred to later phases: the stand-in surfaces and star shader (Phases 2–3).

- Scaffold: copy vendor/, controls.js, noise.js, stars.js; new index.html and
  styles with TRAPPIST-1 branding.
- `data.js` with Agol 2021 Tables 2 & 6, star parameters, JWST findings as
  info-card facts.
- Jacobi → Cartesian conversion, sky → system frame rotation, Yoshida-4 integrator.
- Boot integrates from the 2015 epoch to today with a progress bar.
- Scene: star (existing sun shader recoloured to 2566 K as a stand-in), planets
  with stand-in surfaces, tidally locked spin, orbits, trails, labels, picker,
  info card.
- **Habitable zone band** (conservative and optimistic) in the orbital plane.
- **Resonance readout:** live period ratios and the five Laplace angles.
- Earth-direction marker (arrow toward the Sun / JWST).
- `tools/verify-transits.mjs`: integrate 1,500 d in Node, detect transits, fit
  linear ephemerides, report mean periods vs Agol and TTV amplitudes.

### Phase 2 — The star ✅ done (20 Nov 2026)
*Goal: an M8 dwarf that looks and behaves like one.*

**What was built**
- `src/shaders/star.js` builds a temperature map and colours it with Planck's
  law at R/G/B = 0.61/0.55/0.465 µm relative to 2566 K. Nothing is
  hand-coloured: 500 K-cooler umbrae come out at ~11 % brightness in red,
  110 K faculae at ~1.46×, and 9000 K flare kernels blue-white.
- `src/activity.js` (CPU) holds the measurable parts:
  - **Spots**: up to 48 discrete spots that are born, grow and decay
    (12–72 d lives) at the target coverage. The 2 % default gives 1–2 %
    peak-to-peak rotational modulation toward Earth in the K2 band (observed:
    ~1 %).
  - **Flares**: a Poisson process in simulated time drawn from the K2 flare
    frequency distribution (0.53/d above 1.26×10³⁰ erg, cumulative slope 0.59,
    extended down to 10²⁹ erg). An 80-day test run gave 49 flares above
    1.26×10³⁰ erg (K2 observed 42) with a largest of 2×10³³ erg (observed
    1.2×10³³).
  - **Flare light on planets**: each flare is a 9000 K blackbody carrying
    frac·L★, emitted as a Lambertian patch. Planets facing it receive up to 4× the
    mean, and the far side gets nothing. A 10³¹ erg flare adds ~15 % blue light,
    and a 3×10³³ erg superflare adds ~15× blue on a planet directly facing it.
- UI: spot coverage, facular network, flare rate, *Trigger superflare*, live
  coverage, dimming toward Earth, rotational modulation, observed vs expected
  flare rate, and a flare log.

**Honest liberties**
- Flare kernels are drawn ~0.02 rad across, far larger than their physical
  size. Their surface brightness is scaled down to match, so disc-integrated
  light is conserved. Ribbons and post-flare arcades are decorative.
- At fast time rates a flare would last less than a frame, so it is stretched
  to at least 2.5 s on screen. Its timing and energy are unchanged.
- Spot and facular temperature contrasts are representative, not measured.
- The star's spin axis is set along the orbit normal (spin–orbit alignment is
  consistent with Rossiter–McLaughlin measurements).

- New `star.js` photosphere: 2566 K blackbody colour, deep red-orange limb,
  M-dwarf limb darkening, ~3.3 d rotation.
- **Starspots and bright faculae** with tunable coverage — the two things that
  contaminate JWST transit spectra.
- **Flares** as discrete events drawn from a power-law frequency distribution
  (several detectable flares per day), each with a fast rise and exponential
  decay, a localised bright ribbon on the surface, and a UV/brightness pulse
  that lights up the planets.
- Weak chromosphere/corona glow scaled for an ultracool dwarf (no solar-type
  corona).
- Slider: activity level; toggle: flare log.

### Phase 3 — The planets as JWST sees them ✅ done (20 Nov 2026)
*Goal: seven distinct worlds, each grounded in its own observations.*

**What was built**
- `src/scenarios.js`: 2–4 scenarios per planet (23 in all), each graded
  *matches JWST / consistent / hypothesis / disfavoured / ruled out*, with a
  surface type, Bond albedo, heat-redistribution efficiency, optional
  atmosphere, and a one-paragraph reason.
- `src/thermal.js`: tidally locked energy balance
  T⁴(θ) = (1−A)·T₀⁴·[(1−ε)·max(cos θ,0) + ε/4] with a 40 K interior floor, and
  the disc-integrated **15 µm brightness temperature** JWST would measure at
  eclipse (dayside) and at transit (nightside).
- `src/shaders/world.js`: new locked-frame surface shader with six routines
  (bare rock, lava, dry/Mars-like with antistellar frost, eyeball ocean with
  substellar cyclone, snowball with lineae, cloud deck), a **thermal 15 µm
  view** (key `I`, inferno scale 0–600 K, the same T(θ) as the card), thin
  atmosphere shells only where a scenario has air, and **planet-on-planet
  shadows** (up to six occluders, with penumbrae).
- Info card: scenario picker, model vs JWST dayside with σ, and a night-side
  pass/fail against the 2026 phase-curve limit.

**Checked against JWST** (dayside 15 µm; Gillon+ 2026 / Greene+ 2023 / Zieba+ 2023):

| Scenario | Model | vs measured | Night < 73 K |
| --- | --- | --- | --- |
| b bare dark rock (A 0.1) | 489 K | −0.1σ / −0.5σ | ✓ |
| b thick CO₂ (ruled out) | 404 K | −5.1σ / −3.7σ | ✗ 356 K |
| c bare rock (A 0.3) | 393 K | +1.1σ / +0.4σ | ✓ |
| c thin CO₂ (A 0.25, ε 0.002) | 400 K | +1.3σ / +0.6σ | ✓ |
| c Venus-like (ruled out) | 240 K | −5.6σ / −4.5σ | ✗ 240 K |

Building this turned up a real constraint. A "thin CO₂" atmosphere on c carrying
even 25 % of the heat around gives a 231 K night side, which breaks the
2026 limit. Anything that survives must redistribute well under 1 % of it.

**Liberties**: albedos and redistribution efficiencies are representative,
not fitted; surface textures are procedural illustrations of each scenario;
planet-on-planet shadows use the drawn (enlarged) radii, so they are larger
than real ones.

- **Tidally locked frame:** substellar point always faces the star; spin phase
  derived from the orbit, not a clock.
- New surface routines in `planet.js`:
  - `barerock-hot` (b, c) — dark basaltic/ultramafic regolith, space-weathered,
    optional tidally-driven volcanism hypothesis for b.
  - `dryrock` (d) — airless or thin Mars-like.
  - `eyeball` / `nitrogen` / `barerock` (e) — scenario switch.
  - `icy` / `ocean` (f, g, h) — snowball and sub-ice ocean scenarios.
- **Thermal-infrared view (15 µm)**: per-pixel temperature from
  `T(θ) = T_ss·cos^¼θ` on the day side and a night floor, coloured with a
  perceptual palette — directly comparable to the MIRI numbers (b ≈ 500 K,
  c ≈ 380 K, nights < 70 K).
- **Scenario panel** per planet, labelled *measured* or *hypothesis*, with
  thin-atmosphere shells only where a scenario allows one.
- Planet–planet shadows and the star's eclipse by planets.

### Phase 4 — Observing the system ✅ done (20 Nov 2026)
*Goal: see what JWST sees and why it is hard.*

**What was built**
- **View from Earth** (`E`): a camera 2 AU out along the real line of sight
  with a 0.12° field (scroll to zoom out to 8°), effectively orthographic.
  Planets switch to true size while it is on. The orbits appear edge-on, offset
  by their real impact parameters, and planets cross the spotted disc as
  silhouettes.
- **Photometer** (`src/observe.js`): one sample per integrator step (every 5.76
  simulated minutes), so even b's 36-minute transit is resolved at any time
  rate. F = 1 − transits − spot dimming + flare light:
  - transits use true radii, the N-body sky separation, exact circle-overlap
    area at ingress/egress, and quadratic limb darkening at the chord;
  - spots use the visible population at the star's rotation angle at that
    instant;
  - flares use their **physical** time profiles (not the on-screen stretch),
    weighted by how squarely they face Earth, and include the ones never drawn.
  - Two bands: visible 0.6 µm and near-IR 1.5 µm. Spots and flares weigh far
    more in the visible.
- **Observatory drawer** (`J`): light curve (window follows the time rate,
  per-pixel min/max binning, transit labels), **transit-timing variations**
  (O−C against a running linear fit, 2015 → now, recorded during the boot
  integration so the full 11-year history is there at load), and a
  **discovery timeline**.
- **Observation lists** on every planet card: facility, what was taken, the
  result, and the paper, linked only where the identifier was verified.

**Checks**
- Peak transit depths at disc centre: b 0.86 %, c 0.83 %, d 0.43 %, e 0.58 %,
  f 0.74 %, g 0.86 %, h 0.38 % (near-IR), i.e. (Rp/R★)² times the
  limb-darkening boost.
- Minimum impact parameters from the integrated geometry: b 0.10, c 0.11,
  d 0.07, e 0.19, f 0.32, g 0.38, h 0.38.
- Boot integration records 2,721 transits of b over 11.3 years (expected
  4,116 d ÷ 1.51 d ≈ 2,725).

**Liberties**: limb-darkening coefficients per band are representative; the
small-planet approximation evaluates limb darkening at a single point of the
covered chord; planet–planet overlap during simultaneous transits is not
subtracted; spots crossed by a transiting planet are not modelled.

- **Earth view camera:** looking back along the line of sight, so all seven
  planets cross the tiny disc.
- **Synthetic light curve** panel: limb-darkened transits from the real
  geometry, spot rotation modulation, and flares — the same contaminants the
  papers describe. Multi-planet transits show up naturally.
- **TTV plot:** observed-minus-calculated transit times accumulating live.
- **JWST cards:** per planet, instrument, date, transits used, result, paper
  link; plus a **discovery timeline** (2015 TRAPPIST → 2017 Spitzer → 2018
  Hubble → 2021 Agol → 2023 MIRI b/c → 2025 d, e → 2026 b/c phase curves and f).

### Phase 5 — Experience ✅ done (20 Nov 2026)
*Goal: things you can only see by being there.*

**What was built**
- **Stand on a planet** (`U`, `src/surface.js`): a camera a few km above the
  true-size globe, placed by angle from the substellar point (0° star
  overhead, 90° terminator, 180° permanent night). Drag to look, scroll to
  zoom like binoculars. A live readout gives the star's size and height and the
  three largest planets in the sky: size, distance, phase, height. Scenarios
  with air get a sky dome (brighter toward the horizon, twilight tint near the
  terminator) that drowns the stars by day. The panel slider sets where to
  stand.
- **The Sun in their sky**: a V ≈ 5.3 star placed along our line of sight —
  i.e. *toward* Earth, not away from it (an earlier draft of this plan had that
  backwards) — labelled from the surface. Seen from TRAPPIST-1 it lies in Leo,
  opposite TRAPPIST-1's position in our sky in Aquarius.
- **Resonance view** (`R`): a fading spoke at every conjunction of neighbouring
  planets. The co-rotating frame in the original plan was dropped: with
  e < 0.01 every orbit traces a plain circle in it. Conjunctions show the chain
  directly.
- **Resonances tab** in the observatory: the five Laplace angles sampled daily
  from 2015, staying in narrow bands.
- **Guided tour** (`G`, `src/tour.js`): ten stops from the overview through
  the star, b, c, e, the outer worlds, the resonance, the Earth view and the
  surface of e, to what comes next. Each stop starts from a clean state.
- **Transit sounds** (`M`, `src/sound.js`): each transit rings a note at
  880 Hz × P_b/P, so neighbours sound near a minor sixth, a major sixth, fifths
  and a fourth.
- `tools/serve.py`: a no-cache dev server. Plain `http.server` let the browser
  keep running a stale ES module after it changed on disk.

**A finding: the shared pattern speed.** My first version drew spokes in the
inertial frame, expecting them to stay put. They smeared all the way round. No
pair sits exactly on its commensurability: b–c conjunctions advance 237°, not
240°. Measuring the drift for every pair over 1,500 days:

| Pair | Near | Conjunctions | Drift | Period | Scatter |
| --- | --- | --- | --- | --- | --- |
| b–c | 8:5 | 373 | 0.719°/d | 501 d | 1.0° |
| c–d | 5:3 | 249 | 0.734°/d | 491 d | 2.3° |
| d–e | 3:2 | 124 | 0.729°/d | 494 d | 1.8° |
| e–f | 3:2 | 83 | 0.734°/d | 491 d | 1.7° |
| f–g | 4:3 | 41 | 0.743°/d | 484 d | 1.8° |
| g–h | 3:2 | 42 | 0.739°/d | 487 d | 0.7° |

All six drift together, once per ~491 days. That is Agol's TTV super-period
(491 ± 5 d, 485–500 across pairs), here showing up as geometry. The spokes now
turn at that rate, and every pair's conjunctions stack onto exactly p − q
spokes: three for b–c, two for c–d, one each for the rest.

### Phase 6 — Polish & ship ✅ done (20 Nov 2026) — live at https://trappist-1-sim.vercel.app/

**What was built**
- **Narrow screens** (≤ 860 px): the panel starts closed; the info card and
  observatory share one bottom sheet and close each other; the planet picker
  runs along the bottom; HUDs move below the masthead. There are also
  short-height adjustments.
- **Accessibility**: visible keyboard focus rings, `aria-pressed` on toggles and
  band chips, `role="tab"` / `aria-selected` on the observatory tabs, labelled
  canvases, a live region for the tour and info card, and reduced motion
  respected.
- **Adaptive quality**: touch devices cap the pixel ratio at 1.5. If the first
  four seconds run under 40 fps, the page drops to 1× pixels and the cheaper
  shader paths, once.
- **Boot time** measured at 2.0 s from load to running (logged to the console).
  An earlier 6 s reading came from a throttled background tab, so no
  checkpointing is needed.
- **Share card**: `og/cover.png`, a real 1200 × 630 frame rendered by `/?cover`
  and saved through a single-path, localhost-only PUT in `tools/serve.py`.
  Open Graph and Twitter tags point at the deployed address.
- **README** rewritten in full; `vercel.json` and `.vercelignore` added.

**Shipped**: pushed to github.com/vegaa055/trappist-1 and deployed by Vercel
at <https://trappist-1-sim.vercel.app/>.

#### Original plan
- Performance pass (mobile quality tier), accessibility of the panel.
- README in the solar-system project's style: physics, shaders, verification
  table, known approximations.
- OG share card, Vercel deploy.

---

## 5. Known approximations (planned)

- Ω is set to 0 for all planets, as in Agol 2021: the transit data do not
  constrain node longitudes on the sky, and the system is coplanar to < 0.3°.
- The integration from 2015 to today accumulates the uncertainty of the 2021
  fit; predicted transit times drift by minutes to tens of minutes per decade
  for the worst-constrained planets.
- Planet surfaces are hypotheses where JWST is silent; the UI says so.
- No general relativity or tides in the integrator (both negligible on
  simulation timescales: GR precession of b is ~1°/century).

## 6. Sources

- NASA — *What is Webb revealing about the TRAPPIST-1 system?* (updated Jan 2026)
- Agol et al. 2021, PSJ 2, 1 — arXiv:2010.01074
- Greene et al. 2023, Nature (b, 15 µm)
- Zieba et al. 2023, Nature (c, 15 µm)
- Gillon et al. 2026, Nature Astronomy, doi:10.1038/s41550-026-02806-9 (b+c phase curves)
- Piaulet-Ghorayeb et al. 2025, ApJ, doi:10.3847/1538-4357/adf207 (d)
- Espinoza et al. 2025 / Glidden et al. 2025, ApJL, doi:10.3847/2041-8213/adf42e, /adf62e (e)
- Lim et al. 2026, arXiv:2608.17207 (f)
- Kopparapu et al. 2013, 2014 (habitable zone)
- Luger et al. 2017, Nature Astronomy (h, resonance chain, rotation)
