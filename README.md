# TRAPPIST-1

An interactive 3D model of the TRAPPIST-1 system in the browser. The seven
planets move under direct N-body gravity, seeded from the transit-timing
solution of Agol et al. 2021. Each planet's card carries what JWST has found
about it as of late 2026.

Built on the same foundation as `../3d-solar-system`: three.js r160 vendored
under `vendor/`, no build step, procedural GLSL, no image textures.

See [PLAN.md](PLAN.md) for the science summary, the architecture and the
phased roadmap.

## The star

TRAPPIST-1 is an M8 dwarf at 2566 K. Its photosphere is rendered from a
temperature map converted to colour with Planck's law, so cool spots, bright
faculae and 9000 K flares get their colours from physics rather than a palette.
Spots and flares are drawn from the star's measured statistics (K2 rotational
modulation and flare frequency distribution). Each flare's extra light,
strongest in the blue, reaches only the planets facing it. See
[PLAN.md](PLAN.md) for the numbers and the liberties taken.

## The planets

Each planet has a set of scenarios graded against what JWST has measured
(*matches*, *consistent*, *hypothesis*, *disfavoured*, *ruled out*). Choosing
one changes the surface, any atmosphere, and the thermal model. The planet's
card then shows the 15 µm dayside temperature that scenario predicts next to
the JWST value, with the difference in σ. Press `I` for the thermal view: the
same temperature field, on a fixed 0–600 K scale.

## Observing it

Press `E` to look back along our real line of sight. Planets drop to true size
and cross the star's disc on their real impact parameters. Press `J` for the
observatory, which has three tabs:
- a synthetic light curve sampled every 5.8 simulated minutes (transits, spot
  modulation and flares, in the visible or near-IR);
- transit-timing variations from 2015 to now;
- a timeline of what has been learned.

## Running it

ES modules need a server:

```bash
python -m http.server 8124
```

then open <http://localhost:8124>. On load, the page integrates the system from
the 2015 reference epoch to today (about a second).

## Verifying the physics

```bash
node tools/verify-transits.mjs 1500
```

This integrates 1,500 days and compares the simulated transit times, durations,
TTVs and Laplace angles against Agol et al. 2021. The results are in
[PLAN.md](PLAN.md#phase-1--foundation--dynamics--done-20-nov-2026).

## Controls

| Input | Action |
| --- | --- |
| drag / scroll / right-drag | orbit / zoom / pan |
| click a body or label, or `1`–`7`, `0` | select and follow it (`0` is the star) |
| `space` | pause |
| `O` / `T` / `L` / `Z` | orbits / trails / labels / habitable zone |
| `I` | thermal 15 µm view |
| `E` | view from Earth (scroll to zoom) |
| `J` | observatory: light curve, TTVs, timeline |
| `H` | hide the interface |
| `Esc` | deselect and free the camera |
