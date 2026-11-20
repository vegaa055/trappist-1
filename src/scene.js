// Scene graph and the per-frame sync between integrator state and drawing.
//
// Frames: the integrator works in the "system" frame (x on the sky, +y toward
// Earth, orbit normal ≈ −z). The scene is three.js y-up with the orbital plane
// horizontal and orbits running counter-clockwise seen from above:
//     scene = (x, −z, y)
// which puts Earth along scene +z.

import * as THREE from 'three';
import { UNITS_PER_AU, AU_KM, AUD_TO_KMS } from './constants.js';
import { STAR, PLANETS, BODY_BY_ID } from './data.js';
import { sampleOrbitEllipse, stateToElements } from './orbital.js';
import { primaryMu, radiusAU, EARTH_DIR } from './system.js';
import {
  habitableZone, bareRockDaysideTemp, equilibriumTemp, starAngularDiameter,
} from './habitable.js';
import { createPlanetMaterial } from './shaders/planet.js';
import { createSunMaterial } from './shaders/sun.js';
import { createStarfield, createMilkyWay } from './shaders/stars.js';
import {
  createGlowMaterial, GLOW_EXTENT, createHabitableZone, TRAIL_VERT, TRAIL_FRAG,
} from './shaders/fx.js';

const TRAIL_POINTS = 720;

export const toScene = (v, out) => (out ? out.set(v[0], -v[2], v[1]) : [v[0], -v[2], v[1]]);

const SPHERE = new THREE.SphereGeometry(1, 96, 64);
const STAR_SPHERE = new THREE.SphereGeometry(1, 160, 110);

// Starlight colour. A 2566 K blackbody is a deep orange; a visitor's eye would
// partly adapt to it, so the light that falls on the planets is a warm but not
// fully saturated version. (Phase 3 makes this an explicit choice.)
const STARLIGHT = new THREE.Color(1.0, 0.76, 0.56);

class BodyView {
  constructor(body) {
    this.body = body;
    this.id = body.id;
    this.pivot = new THREE.Group();
    this.spin = new THREE.Group();
    this.pivot.add(this.spin);
    this.renderPos = new THREE.Vector3();
    this.drawRadius = 1;
    this.screen = new THREE.Vector3();
    this.screenVisible = false;
    this.screenRadius = 0;
  }
}

export class TrappistScene {
  constructor({ labelLayer, sim, settings }) {
    this.settings = settings;
    this.sim = sim;
    this.labelLayer = labelLayer;

    this.scene = new THREE.Scene();
    this.views = new Map();
    this.orbitLines = new Map();
    this.trails = new Map();

    this.milkyWay = createMilkyWay();
    this.starfield = createStarfield();
    this.scene.add(this.milkyWay, this.starfield);

    this.orbitGroup = new THREE.Group();
    this.trailGroup = new THREE.Group();
    this.scene.add(this.orbitGroup, this.trailGroup);

    this.hz = habitableZone();
    this.hzMesh = createHabitableZone(this.hz);
    this.hzMesh.scale.setScalar(UNITS_PER_AU);
    this.scene.add(this.hzMesh);

    this._buildEarthMarker();

    this.starWorld = new THREE.Vector3();
    this.starDrawRadius = 1;
    this.stellarClock = 0;

    this._tmpA = new THREE.Vector3();
    this._r = [0, 0, 0];
    this._v = [0, 0, 0];
    this._orbitTimer = 0;

    for (const body of sim.bodies) this._buildBody(body);
    this._buildLabels();
  }

  // ------------------------------------------------------------ construction

  _buildBody(body) {
    const view = new BodyView(body);
    this.scene.add(view.pivot);

    if (body.kind === 'star') {
      // Phase 1 stand-in: the solar photosphere shader, recoloured to 2566 K
      // and slowed. Phase 2 replaces it with a purpose-built M-dwarf surface.
      const mat = createSunMaterial();
      const u = mat.uniforms;
      u.uColorDeep.value.setRGB(0.16, 0.012, 0.002);
      u.uColorMid.value.setRGB(0.95, 0.22, 0.035);
      u.uColorHot.value.setRGB(1.0, 0.48, 0.16);
      u.uColorFlare.value.setRGB(0.85, 0.9, 1.0);   // flares are hot: blue-white
      u.uDisplace.value = 0.4;
      u.uFlareRate.value = 0.3;
      const mesh = new THREE.Mesh(STAR_SPHERE, mat);
      view.spin.add(mesh);
      view.mesh = mesh;
      view.material = mat;

      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createGlowMaterial('#ff6a22'));
      glow.renderOrder = 7;
      glow.frustumCulled = false;
      view.pivot.add(glow);
      view.glow = glow;
    } else {
      const mat = createPlanetMaterial(body);
      mat.uniforms.uLightColor.value.copy(STARLIGHT);
      mat.uniforms.uFluxNorm.value = 0.02925;      // e's orbit = irradiance 1
      const mesh = new THREE.Mesh(SPHERE, mat);
      mesh.userData.bodyId = body.id;
      view.spin.add(mesh);
      view.mesh = mesh;
      view.material = mat;
      this._buildOrbit(body);
      this._buildTrail(body);
    }

    this.views.set(body.id, view);
  }

  _buildOrbit(body) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(513 * 3), 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(body.uiColor),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    const holder = new THREE.Group();
    holder.add(line);
    holder.scale.setScalar(UNITS_PER_AU);
    this.orbitGroup.add(holder);
    this.orbitLines.set(body.id, { holder, line, geo });
  }

  _buildTrail(body) {
    const positions = new Float32Array(TRAIL_POINTS * 3);
    const ages = new Float32Array(TRAIL_POINTS);
    for (let i = 0; i < TRAIL_POINTS; i++) ages[i] = i / (TRAIL_POINTS - 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAge', new THREE.BufferAttribute(ages, 1));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(body.uiColor) }, uOpacity: { value: 0.9 } },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    const holder = new THREE.Group();
    holder.add(line);
    holder.scale.setScalar(UNITS_PER_AU);
    this.trailGroup.add(holder);
    this.trails.set(body.id, { holder, line, geo, positions, count: 0, lastSample: -1e9 });
  }

  /** Dashed line from the star toward the Solar System — the line of sight. */
  _buildEarthMarker() {
    const dir = toScene(EARTH_DIR);
    const len = 0.085 * UNITS_PER_AU;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(len),
    ]);
    const mat = new THREE.LineDashedMaterial({
      color: 0x8fb4ff, dashSize: 1.2, gapSize: 1.0, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    this.earthMarker = line;
    this.earthMarkerTip = new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(len);
    this.scene.add(line);
  }

  _buildLabels() {
    this.labels = new Map();
    for (const body of this.sim.bodies) {
      const el = document.createElement('button');
      el.className = `label label--${body.kind}`;
      el.type = 'button';
      const text = body.kind === 'star' ? body.name : body.letter;
      el.innerHTML = `<span class="label__dot" style="color:${body.uiColor || STAR.color};background:${body.uiColor || STAR.color}"></span><span class="label__text">${text}</span>`;
      el.dataset.bodyId = body.id;
      this.labelLayer.appendChild(el);
      this.labels.set(body.id, el);
    }
    const earth = document.createElement('div');
    earth.className = 'label label--earth';
    earth.innerHTML = '<span class="label__text">to the Sun &amp; JWST · 40.7 ly</span>';
    this.labelLayer.appendChild(earth);
    this.earthLabel = earth;
  }

  // ------------------------------------------------------------------ update

  drawRadiusOf(body) {
    const s = this.settings;
    const mult = body.kind === 'star' ? s.starScale : s.planetScale;
    return radiusAU(body) * UNITS_PER_AU * mult;
  }

  update(dtWall, camera) {
    const s = this.settings;
    const nb = this.sim.nbody;
    const simDays = nb.time;

    if (!s.paused) {
      this.stellarClock += dtWall * (0.35 + Math.min(s.daysPerSecond, 5) * 0.12) * s.stellarActivity;
    }

    // 1. Positions and sizes.
    for (const body of this.sim.bodies) {
      const view = this.views.get(body.id);
      nb.getPosition(body.id, this._r);
      toScene(this._r, view.renderPos).multiplyScalar(UNITS_PER_AU);
      view.pivot.position.copy(view.renderPos);
      view.drawRadius = this.drawRadiusOf(body);
      view.spin.scale.setScalar(view.drawRadius);
    }

    const starView = this.views.get(STAR.id);
    this.starWorld.copy(starView.renderPos);
    this.starDrawRadius = starView.drawRadius;

    // 2. Rotation. The star turns once per 3.3 d. Planets are tidally locked:
    //    the local +x meridian (the substellar point) always faces the star.
    starView.spin.rotation.y = (simDays / STAR.rotPeriod) * Math.PI * 2;
    for (const p of PLANETS) {
      const view = this.views.get(p.id);
      const dx = this.starWorld.x - view.renderPos.x;
      const dz = this.starWorld.z - view.renderPos.z;
      view.spin.rotation.y = Math.atan2(-dz, dx);
    }

    // 3. Star glow quad.
    starView.glow.scale.setScalar(this.starDrawRadius * 2 * GLOW_EXTENT);
    starView.glow.quaternion.copy(camera.quaternion);
    starView.glow.visible = s.showGlow;
    starView.glow.material.uniforms.uIntensity.value = s.exposure * 1.4;

    // 4. Uniforms.
    const su = starView.material.uniforms;
    su.uTime.value = this.stellarClock;
    su.uSpotAmount.value = s.starspots;
    su.uFlareGain.value = s.flares;
    su.uDetail.value = s.highDetail ? 1 : 0;
    su.uBrightness.value = 0.95 * s.exposure;

    for (const p of PLANETS) {
      const u = this.views.get(p.id).material.uniforms;
      const view = this.views.get(p.id);
      u.uTime.value = simDays;
      u.uSunPos.value.copy(this.starWorld);
      u.uSunRadius.value = this.starDrawRadius;
      u.uSunFalloff.value = s.realisticFalloff ? 2.0 : 0.35;
      u.uUnitsPerAU.value = UNITS_PER_AU;
      u.uExposure.value = s.exposure;
      u.uDetail.value = s.highDetail ? 1 : 0;
      u.uBump.value = s.showBump ? (p.params?.bump ?? 0) : 0;
      view.mesh.updateWorldMatrix(true, false);
      u.uModelRot.value.setFromMatrix4(view.mesh.matrixWorld);
      u.uOccluderCount.value = 0;
    }

    // 5. Sky, HZ, line of sight.
    this.starfield.material.uniforms.uTime.value = this.stellarClock;
    this.starfield.visible = s.showStars;
    this.milkyWay.visible = s.showStars;
    this.milkyWay.material.uniforms.uIntensity.value = s.milkyWay;
    this.starfield.position.copy(camera.position);
    this.milkyWay.position.copy(camera.position);

    this.hzMesh.visible = s.showHabitableZone;
    this.hzMesh.position.copy(this.starWorld);
    this.earthMarker.visible = s.showLineOfSight;
    this.earthMarker.position.copy(this.starWorld);

    // 6. Orbits and trails.
    this.orbitGroup.visible = s.showOrbits;
    this.trailGroup.visible = s.showTrails;
    this._orbitTimer -= dtWall;
    if (s.showOrbits && this._orbitTimer <= 0) {
      this._orbitTimer = 0.25;
      this._updateOrbits();
    }
    for (const entry of this.orbitLines.values()) entry.holder.position.copy(this.starWorld);
    if (s.showTrails) this._updateTrails(simDays);

    // 7. Labels.
    this._updateLabels(camera);
  }

  _updateOrbits() {
    const nb = this.sim.nbody;
    for (const p of PLANETS) {
      const entry = this.orbitLines.get(p.id);
      nb.relativePosition(p.id, STAR.id, this._r);
      nb.relativeVelocity(p.id, STAR.id, this._v);
      const sampled = sampleOrbitEllipse(primaryMu(p), this._r, this._v, 512);
      if (!sampled) { entry.line.visible = false; continue; }
      entry.line.visible = true;
      const arr = entry.geo.attributes.position.array;
      const pts = sampled.points;
      for (let i = 0; i < 513; i++) {
        arr[i * 3] = pts[i * 3];
        arr[i * 3 + 1] = -pts[i * 3 + 2];
        arr[i * 3 + 2] = pts[i * 3 + 1];
      }
      entry.geo.attributes.position.needsUpdate = true;
      entry.geo.computeBoundingSphere();
      entry.elements = sampled.elements;
    }
  }

  _updateTrails(simDays) {
    const nb = this.sim.nbody;
    for (const p of PLANETS) {
      const t = this.trails.get(p.id);
      t.holder.position.copy(this.starWorld);
      const interval = p.agol.P / TRAIL_POINTS * 1.6;
      if (Math.abs(simDays - t.lastSample) < interval) continue;
      t.lastSample = simDays;
      nb.relativePosition(p.id, STAR.id, this._r);
      const v = toScene(this._r);
      let i;
      if (t.count < TRAIL_POINTS) {
        i = t.count++;
      } else {
        t.positions.copyWithin(0, 3);
        i = TRAIL_POINTS - 1;
      }
      t.positions[i * 3] = v[0]; t.positions[i * 3 + 1] = v[1]; t.positions[i * 3 + 2] = v[2];
      t.geo.setDrawRange(0, t.count);
      t.geo.attributes.position.needsUpdate = true;
      t.geo.computeBoundingSphere();
    }
  }

  clearTrails() {
    for (const t of this.trails.values()) {
      t.count = 0;
      t.lastSample = -1e9;
      t.geo.setDrawRange(0, 0);
    }
  }

  _project(world, camera, half) {
    this._tmpA.copy(world).project(camera);
    const behind = this._tmpA.z > 1 || this._tmpA.z < -1;
    return {
      behind,
      x: (this._tmpA.x + 1) * half.x,
      y: (1 - this._tmpA.y) * half.y,
      z: this._tmpA.z,
    };
  }

  _updateLabels(camera) {
    const s = this.settings;
    const half = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
    const fov = camera.fov * Math.PI / 180;

    for (const body of this.sim.bodies) {
      const view = this.views.get(body.id);
      const el = this.labels.get(body.id);
      const pr = this._project(view.renderPos, camera, half);
      view.screen.set(pr.x, pr.y, pr.z);
      view.screenVisible = !pr.behind;
      const dist = camera.position.distanceTo(view.renderPos);
      view.screenRadius = (view.drawRadius / Math.max(dist, 1e-9)) / Math.tan(fov / 2) * half.y;

      if (!s.showLabels || pr.behind || view.screenRadius > half.y * 0.6) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.transform = `translate(-50%, -50%) translate(${pr.x}px, ${pr.y}px)`;
      el.classList.toggle('label--selected', s.selected === body.id);
    }

    const tipWorld = this._tmpA.copy(this.earthMarkerTip).add(this.starWorld).clone();
    const tp = this._project(tipWorld, camera, half);
    const showEarth = s.showLineOfSight && s.showLabels && !tp.behind;
    this.earthLabel.style.display = showEarth ? 'block' : 'none';
    if (showEarth) this.earthLabel.style.transform = `translate(-50%, -50%) translate(${tp.x}px, ${tp.y}px)`;
  }

  pickAt(x, y, grabPx = 28) {
    let best = null;
    let bestScore = Infinity;
    for (const body of this.sim.bodies) {
      const view = this.views.get(body.id);
      if (!view.screenVisible) continue;
      const d = Math.hypot(view.screen.x - x, view.screen.y - y);
      const reach = Math.max(grabPx, (view.screenRadius || 0) * 1.05);
      if (d > reach) continue;
      const score = d / reach;
      if (score < bestScore) { bestScore = score; best = body.id; }
    }
    return best;
  }

  /** Live readout for the info card. */
  describe(id) {
    const body = BODY_BY_ID[id];
    const nb = this.sim.nbody;
    if (body.kind === 'star') {
      return { body, hz: this.hz };
    }
    nb.relativePosition(id, STAR.id, this._r);
    nb.relativeVelocity(id, STAR.id, this._v);
    const el = stateToElements(primaryMu(body), this._r, this._v);
    const dist = Math.hypot(...this._r);
    return {
      body,
      distanceAU: dist,
      distanceKm: dist * AU_KM,
      speedKms: Math.hypot(...this._v) * AUD_TO_KMS,
      periodDays: el.period,
      eccentricity: el.e,
      semiMajorAU: el.a,
      starSizeDeg: starAngularDiameter(dist),
      teq: equilibriumTemp(body.aAU),
      tDayBareRock: bareRockDaysideTemp(body.aAU),
      inHZ: body.aAU >= this.hz.runawayGreenhouse.au && body.aAU <= this.hz.maxGreenhouse.au,
    };
  }

  viewOf(id) { return this.views.get(id); }
}
