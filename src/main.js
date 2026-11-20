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
import { resonanceState } from './resonance.js';
import { PLANETS, STAR } from './data.js';

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

let busy = false;

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
  }
  if (jd !== null) {
    const span = jd - (sim.epochJD + sim.nbody.time);
    if (span > 200) {
      boot.classList.remove('is-done');
      bootText.textContent = 'integrating from the 2015 epoch…';
    }
    await advanceTo(sim, jd, {
      dt: DT_MAX,
      onProgress: (f) => { bootFill.style.width = `${(f * 100).toFixed(1)}%`; },
    });
    boot.classList.add('is-done');
  }
  world.clearTrails();
  busy = false;
}

// ------------------------------------------------------------------- input --

canvas.addEventListener('pointerup', (e) => {
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

function animate() {
  requestAnimationFrame(animate);
  const dtWall = Math.min(clock.getDelta(), 0.1);

  let simDays = 0;
  if (!settings.paused && !busy) {
    simDays = settings.daysPerSecond * dtWall;
    if (Math.abs(simDays) > MAX_DAYS_PER_FRAME) simDays = Math.sign(simDays) * MAX_DAYS_PER_FRAME;
    lastSteps = sim.nbody.advance(simDays, DT_MAX, MAX_SUBSTEPS);
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
  controls.update(dtWall);

  world.update(dtWall, camera, simDays);
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

window.trappist = { sim, world, settings, camera, controls, renderer, composer, bloom };
