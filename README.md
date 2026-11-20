# TRAPPIST-1

An interactive 3D model of the TRAPPIST-1 system in the browser. The seven
planets move under direct N-body gravity, seeded from the transit-timing
solution of Agol et al. 2021. Each planet's card carries what JWST has found
about it as of late 2026.

Built on the same foundation as `../3d-solar-system`: three.js r160 vendored
under `vendor/`, no build step, procedural GLSL, no image textures.

See [PLAN.md](PLAN.md) for the science summary, the architecture and the
phased roadmap.

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
| `H` | hide the interface |
| `Esc` | deselect and free the camera |
