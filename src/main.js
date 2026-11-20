// Entry point: renderer, bloom, simulation loop, input.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import {
  DT_MAX, MAX_SUBSTEPS, MAX_DAYS_PER_FRAME, DEFAULT_PLANET_SCALE, DEFAULT_STAR_SCALE,
} from './constants.js';
import { buildSystem, advanceTo, julianDayNow } from './system.js';
import { TrappistScene } from './scene.js';
import { OrbitControls } from './controls.js';
import { createUI } from './ui.js';
import { resonanceState, ConjunctionTracker } from './resonance.js';
import { PLANETS, STAR } from './data.js';
import { Photometer } from './observe.js';
import { TransitDetector } from './transits.js';
import { createObservatory } from './observatory.js';
import { SurfaceView } from './surface.js';
import { TransitChimes } from './sound.js';
import { createTour } from './tour.js';

const canvas = document.getElementById('view');
const boot = document.getElementById('boot');
const bootText = document.getElementById('boot-text');
const bootFill = document.getElementById('boot-fill');

function fail(message) {
  boot.classList.add('boot--error');
  boot.classList.remove('is-done');
  bootText.textContent = message;
}

// ---------------------------------------------------------------- settings --

const settings = {
  paused: false,
  daysPerSecond: 0.25,

  planetScale: DEFAULT_PLANET_SCALE,
  starScale: DEFAULT_STAR_SCALE,

  exposure: 1,
  bloom: 0.8,
  milkyWay: 1,

  spotCoverage: STAR.activity.spotCoverage,
  faculae: 1,
  flareRate: 1,
  flareLighting: true,
  thermalView: false,
  showAtmospheres: true,
  earthView: false,
  showObservatory: false,
  lcBand: 'vis',
  surfaceView: false,
  resonanceView: false,

  showOrbits: true,
  showTrails: false,
  showLabels: true,
  showHabitableZone: true,
  showLineOfSight: true,
  showGlow: true,
  showStars: true,
  showBump: true,
  highDetail: true,
  realisticFalloff: false,

  selected: null,
  following: null,
};

// ------------------------------------------------------------------- setup --

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch (err) {
  fail(`WebGL could not start: ${err.message}`);
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 1);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.0005, 60000);

const sim = buildSystem();
const world = new TrappistScene({
  labelLayer: document.getElementById('labels'),
  sim,
  settings,
});

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.spherical.set(135, Math.PI / 2 - 0.62, 0.55);
controls.minDistance = 0.002;
controls.maxDistance = 4000;

// ---------------------------------------------------------- post-processing --

const drawSize = renderer.getDrawingBufferSize(new THREE.Vector2());
const composerTarget = new THREE.WebGLRenderTarget(drawSize.x, drawSize.y, {
  type: THREE.HalfFloatType,
  samples: 4,
});
const composer = new EffectComposer(renderer, composerTarget);
composer.addPass(new RenderPass(world.scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  settings.bloom, 0.6, 0.85,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------- observing --

// Transit times (for the TTV plot) and the light curve, both sampled at every
// integrator step. The boot integration from 2015 feeds the detector too, so
// the TTV plot opens with the full history.
const photometer = new Photometer({ band: settings.lcBand });
const chimes = new TransitChimes();
const markers = [];
let detector;
let laplace;
let busy = false;

// Laplace angles once per simulated day, from the 2015 epoch on.
function recordLaplace(nb) {
  if (nb.time - laplace.last < 1) return;
  laplace.last = nb.time;
  laplace.t.push(nb.time);
  resonanceState(nb).laplace.forEach((l, k) => laplace.phi[k].push(l.phi));
  if (laplace.t.length > 30000) {
    laplace.t.splice(0, 5000);
    for (const s of laplace.phi) s.splice(0, 5000);
  }
}

function resetObservations() {
  detector = new TransitDetector();
  detector.listeners.push((id, t) => {
    markers.push({ id, t });
    if (markers.length > 400) markers.splice(0, markers.length - 400);
    if (!busy) chimes.play(id);
  });
  markers.length = 0;
  photometer.clear();
  laplace = { t: [], phi: [[], [], [], [], []], last: -Infinity };
}
let observatory = null;
resetObservations();

const conjunctions = new ConjunctionTracker((k, x, y, t) => world.addConjunction(k, x, y, t));
const onStepLive = (nb) => {
  detector.sample(nb);
  photometer.sample(nb, world.activity);
  recordLaplace(nb);
  conjunctions.sample(nb);
};
const onStepBoot = (nb) => { detector.sample(nb); recordLaplace(nb); };

// ---------------------------------------------------------- on the ground --
const surface = new SurfaceView({ camera, canvas, world });
let surfaceSavedScale = null;

function setSurface(id, theta) {
  if (!id) {
    if (!settings.surfaceView) return;
    settings.surfaceView = false;
    surface.exit();
    world.surfaceInfo = null;
    if (surfaceSavedScale) ui.setScale(...surfaceSavedScale);
    controls.enabled = true;
    camera.near = 0.0005;
    camera.fov = 50;
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    document.getElementById('surface-hud').hidden = true;
    document.getElementById('btn-surface').classList.remove('btn--primary');
    if (settings.selected) focusBody(settings.selected);
    return;
  }
  if (settings.earthView) setEarthView(false);
  if (settings.resonanceView) setResonanceView(false);
  if (!settings.surfaceView) surfaceSavedScale = [settings.planetScale, settings.starScale];
  ui.setScale(1, 1);
  controls.enabled = false;
  settings.following = null;
  if (theta !== undefined) { surface.theta = theta; ui.setTheta(theta); }
  surface.enter(id);
  settings.surfaceView = true;
  document.getElementById('surface-hud').hidden = false;
  document.getElementById('btn-surface').classList.add('btn--primary');
}

// ----------------------------------------------------------- resonance view --
// Top-down, with a fading spoke at every conjunction of neighbouring planets.
function setResonanceView(on) {
  settings.resonanceView = on;
  if (on) {
    world.clearConjunctions();
    settings.selected = null;
    ui.setSelected(null);
    settings.following = null;
    controls.target.copy(world.starWorld);
    controls.spherical.set(Math.max(controls.spherical.radius, 130), 0.12, controls.spherical.theta);
    controls.minDistance = 0.002;
  }
  document.getElementById('btn-corotate').classList.toggle('btn--primary', on);
}

// ------------------------------------------------------------ Earth view --
// A telescope looking back along our real line of sight (scene +z), far away
// with a very narrow field so the view is effectively orthographic. Planets
// are shown at true size while it is active.
const EARTH_DISTANCE = 2000;            // scene units (2 AU)
let earthFov = 0.12;                    // degrees
let savedScale = null;

function setEarthView(on) {
  if (on === settings.earthView) return;
  settings.earthView = on;
  document.getElementById('earth-hud').hidden = !on;
  document.getElementById('btn-earth').classList.toggle('btn--primary', on);
  if (on) {
    if (settings.surfaceView) setSurface(null);
    if (settings.resonanceView) setResonanceView(false);
    savedScale = [settings.planetScale, settings.starScale];
    ui.setScale(1, 1);
    settings.following = null;
    controls.enabled = false;
  } else {
    if (savedScale) ui.setScale(...savedScale);
    controls.enabled = true;
    camera.fov = 50;
    camera.updateProjectionMatrix();
  }
}

canvas.addEventListener('wheel', (e) => {
  if (!settings.earthView) return;
  e.preventDefault();
  earthFov = Math.min(8, Math.max(0.03, earthFov * Math.exp(e.deltaY * 0.0012)));
}, { passive: false });

// ---------------------------------------------------------------- focusing --

const focusState = { from: new THREE.Vector3(), to: new THREE.Vector3(), blend: 1 };

function focusBody(id, { frame = true } = {}) {
  settings.selected = id;
  settings.following = id;
  ui.setSelected(id);
  if (!id) return;
  const view = world.viewOf(id);
  focusState.from.copy(controls.target);
  focusState.blend = 0;
  if (frame) controls.frame(Math.max(view.drawRadius, 1e-4), id === STAR.id ? 4.0 : 7.0);
  controls.minDistance = Math.max(0.002, view.drawRadius * 1.15);
}

function release() {
  settings.following = null;
  controls.minDistance = 0.002;
}

// ---------------------------------------------------------------------- UI --

const ui = createUI({
  settings,
  callbacks: {
    onFocus: (id) => focusBody(id),
    onSelect: (id) => {
      if (!id) { settings.selected = null; ui.setSelected(null); release(); } else focusBody(id);
    },
    onFollow: (id) => {
      if (id) focusBody(id, { frame: false }); else release();
    },
    onTogglePause: () => {
      settings.paused = !settings.paused;
      ui.setPaused(settings.paused);
    },
    onEpoch: (which) => jumpTo(which === 'now' ? julianDayNow() : null),
    onToggle: (key) => { if (key === 'showTrails' && settings.showTrails) world.clearTrails(); },
    onBloom: (v) => { bloom.strength = v; },
    onScenario: (id, scenarioId) => {
      world.setScenario(id, scenarioId);
      ui.renderInfo(world.describe(id));
    },
    onEarthView: () => setEarthView(!settings.earthView),
    onSurface: () => (settings.surfaceView ? setSurface(null) : setSurface(settings.selected && settings.selected !== STAR.id ? settings.selected : 'e')),
    onTheta: (v) => { surface.theta = v; },
    onCorotate: () => setResonanceView(!settings.resonanceView),
    onChimes: () => {
      chimes.setEnabled(!chimes.enabled);
      document.getElementById('btn-chimes').classList.toggle('btn--primary', chimes.enabled);
    },
    onTour: () => tour.start(),
    onObservatory: () => { settings.showObservatory = !settings.showObservatory; },
    onSuperflare: () => {
      world.activity.trigger(3e33);
      if (settings.daysPerSecond > 0.05) ui.setSpeed(0.02);
      focusBody(STAR.id);
    },
  },
});
ui.setPaused(settings.paused);

/**
 * Re-seed from the 2015 epoch and integrate forward to `jd` (or stay at the
 * epoch when jd is null). Going backward also restarts from the epoch, so the
 * state is always the result of integrating forward from Agol's elements.
 */
async function jumpTo(jd) {
  if (busy) return;
  busy = true;
  const current = sim.epochJD + sim.nbody.time;
  if (jd === null || jd < current) {
    const fresh = buildSystem();
    sim.nbody = fresh.nbody;
    resetObservations();
  }
  if (jd !== null) {
    const span = jd - (sim.epochJD + sim.nbody.time);
    if (span > 200) {
      boot.classList.remove('is-done');
      bootText.textContent = 'integrating from the 2015 epoch…';
    }
    await advanceTo(sim, jd, {
      dt: DT_MAX,
      onStep: onStepBoot,
      onProgress: (f) => { bootFill.style.width = `${(f * 100).toFixed(1)}%`; },
    });
    photometer.clear();
    boot.classList.add('is-done');
  }
  world.clearTrails();
  busy = false;
}

// ------------------------------------------------------------------- input --

canvas.addEventListener('pointerup', (e) => {
  if (settings.surfaceView || settings.earthView) return;
  if (controls.clickWasDrag || e.button !== 0) return;
  const id = world.pickAt(e.clientX, e.clientY);
  if (id) focusBody(id);
});

document.getElementById('labels').addEventListener('click', (e) => {
  const btn = e.target.closest('.label[data-body-id]');
  if (btn) focusBody(btn.dataset.bodyId);
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const key = e.key.toLowerCase();
  if (key >= '1' && key <= '7') { focusBody(PLANETS[Number(key) - 1].id); return; }
  switch (key) {
    case '0': focusBody(STAR.id); break;
    case ' ':
      e.preventDefault();
      settings.paused = !settings.paused;
      ui.setPaused(settings.paused);
      break;
    case 'h': document.body.classList.toggle('ui-hidden'); break;
    case 'escape':
      if (settings.surfaceView) { setSurface(null); break; }
      settings.selected = null;
      ui.setSelected(null);
      release();
      break;
    case 'o': settings.showOrbits = !settings.showOrbits; ui.syncToggles(); break;
    case 't':
      settings.showTrails = !settings.showTrails;
      if (settings.showTrails) world.clearTrails();
      ui.syncToggles();
      break;
    case 'l': settings.showLabels = !settings.showLabels; ui.syncToggles(); break;
    case 'z': settings.showHabitableZone = !settings.showHabitableZone; ui.syncToggles(); break;
    case 'i': settings.thermalView = !settings.thermalView; ui.syncToggles(); break;
    case 'e': setEarthView(!settings.earthView); break;
    case 'j': settings.showObservatory = !settings.showObservatory; break;
    case 'g': if (tour.active) tour.close(); else tour.start(); break;
    case 'u': ui.callbacks.onSurface(); break;
    case 'r': ui.callbacks.onCorotate(); break;
    case 'm': ui.callbacks.onChimes(); break;
    case 'arrowright': if (tour.active) tour.next(); break;
    case 'arrowleft': if (tour.active) tour.prev(); break;
    default: break;
  }
});

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  world.starfield.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
}
window.addEventListener('resize', onResize);
onResize();

// ------------------------------------------------------------------- loop --

const clock = new THREE.Clock();
let fpsAccum = 0, fpsFrames = 0;
let lastSteps = 0;
let infoTimer = 0;
let resTimer = 0;
let flareTimer = 0;
let surfaceTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dtWall = Math.min(clock.getDelta(), 0.1);

  let simDays = 0;
  if (!settings.paused && !busy) {
    simDays = settings.daysPerSecond * dtWall;
    if (Math.abs(simDays) > MAX_DAYS_PER_FRAME) simDays = Math.sign(simDays) * MAX_DAYS_PER_FRAME;
    lastSteps = sim.nbody.advance(simDays, DT_MAX, MAX_SUBSTEPS, onStepLive);
  } else {
    lastSteps = 0;
  }

  if (settings.following) {
    const view = world.viewOf(settings.following);
    focusState.to.copy(view.renderPos);
    if (focusState.blend < 1) {
      focusState.blend = Math.min(1, focusState.blend + dtWall * 2.2);
      const k = focusState.blend * focusState.blend * (3 - 2 * focusState.blend);
      controls.target.lerpVectors(focusState.from, focusState.to, k);
    } else {
      controls.target.copy(focusState.to);
    }
  }
  // Bodies that cameras ride on must be current before the camera moves.
  world.syncPositions();

  if (settings.surfaceView) {
    surface.update();
    world.surfaceInfo = { id: surface.id, up: surface.upVector(new THREE.Vector3()) };
  } else if (settings.earthView) {
    camera.fov = earthFov;
    camera.position.copy(world.starWorld).add(new THREE.Vector3(0, 0, EARTH_DISTANCE));
    camera.up.set(0, 1, 0);
    camera.lookAt(world.starWorld);
    camera.updateProjectionMatrix();
  } else {
    controls.update(dtWall);
  }

  world.update(dtWall, camera, simDays);
  photometer.commit(world.activity);
  observatory.update(dtWall);
  composer.render(dtWall);

  flareTimer -= dtWall;
  if (flareTimer <= 0) {
    flareTimer = 0.3;
    ui.renderActivity(world.activity, sim.epochJD + sim.nbody.time);
  }

  fpsAccum += dtWall; fpsFrames++;
  if (fpsAccum > 0.4) {
    ui.updateDiagnostics({
      fps: fpsFrames / fpsAccum,
      steps: lastSteps,
      elapsedDays: sim.nbody.time,
      energyDrift: sim.nbody.energyDrift(),
    });
    fpsAccum = 0; fpsFrames = 0;
  }

  ui.updateClock(sim.epochJD + sim.nbody.time, settings.daysPerSecond, settings.paused);

  resTimer -= dtWall;
  if (resTimer <= 0) {
    resTimer = 0.25;
    ui.renderResonance(resonanceState(sim.nbody));
  }

  if (settings.surfaceView) {
    surfaceTimer -= dtWall;
    if (surfaceTimer <= 0) { surfaceTimer = 0.2; ui.renderSurface(surface.describe()); }
  }

  infoTimer -= dtWall;
  if (settings.selected && infoTimer <= 0) {
    infoTimer = 0.2;
    ui.renderInfo(world.describe(settings.selected));
  }
}

// Compile shaders behind the overlay, then integrate from 2015 to today.
requestAnimationFrame(async () => {
  try {
    world.update(0, camera);
    composer.render(0);
    bootText.textContent = 'integrating from the 2015 epoch to today…';
    busy = true;
    await advanceTo(sim, julianDayNow(), {
      dt: DT_MAX,
      onStep: onStepBoot,
      onProgress: (f) => { bootFill.style.width = `${(f * 100).toFixed(1)}%`; },
    });
    busy = false;
    clock.getDelta();
    animate();
    requestAnimationFrame(() => boot.classList.add('is-done'));
  } catch (err) {
    fail(`Startup failed: ${err.message}`);
    throw err;
  }
});

/**
 * Frame a planet from its day side, `offset` radians around from the
 * substellar direction (0 = full phase, π/2 = half lit). Handy from the
 * console, and used by the guided tour later.
 */
function viewDayside(id, offset = 0.8, elevation = 0.25) {
  focusBody(id);
  const view = world.viewOf(id);
  const d = new THREE.Vector3().copy(world.starWorld).sub(view.renderPos).normalize();
  const theta = Math.atan2(d.x, d.z) + offset;
  controls.spherical.theta = theta;
  controls.spherical.phi = Math.PI / 2 - elevation;
}

observatory = createObservatory({
  settings,
  photometer,
  getDetector: () => detector,
  getLaplace: () => laplace,
  markers,
  epochJD: sim.epochJD,
  onBand: (id) => { settings.lcBand = id; photometer.setBand(id); observatory.setBand(id); },
});

// ------------------------------------------------------------------ tour --
const tour = createTour({
  api: {
    reset() {
      settings.selected = null;
      ui.setSelected(null);
      release();
      setSurface(null);
      setEarthView(false);
      setResonanceView(false);
      settings.thermalView = false;
      settings.showTrails = false;
      settings.showObservatory = false;
      settings.paused = false;
      ui.setPaused(false);
      ui.syncToggles();
    },
    overview() {
      settings.selected = null;
      ui.setSelected(null);
      release();
      controls.target.copy(world.starWorld);
      controls.spherical.set(135, Math.PI / 2 - 0.62, 0.55);
    },
    focus: (id) => focusBody(id),
    viewDayside: (id, offset) => viewDayside(id, offset),
    setSpeed: (dps) => ui.setSpeed(dps),
    setThermal: (on) => { settings.thermalView = on; ui.syncToggles(); },
    setEarthView,
    setSurface,
    setResonanceView,
    setScenario: (id, sc) => world.setScenario(id, sc),
    openObservatory: (tab) => { settings.showObservatory = true; observatory.selectTab(tab); },
    superflare: () => world.activity.trigger(3e33),
  },
});

window.trappist = {
  sim, world, settings, camera, controls, renderer, composer, bloom, viewDayside, photometer, surface, tour,
  get detector() { return detector; },
};
