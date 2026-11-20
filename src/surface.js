// Standing on a planet.
//
// Every TRAPPIST-1 planet is tidally locked, so where you stand fixes where the
// star is: `theta` is the angle from the substellar point along the equator
// (0° star overhead, 90° on the horizon at the terminator, 180° permanent
// night). The camera sits a few kilometres above the true-size globe, looks
// along the local horizon, and can be turned (drag) and zoomed (scroll) like a
// pair of binoculars.
//
// Planets are switched to true size while this is active, so every angular
// size on screen — the star, the neighbouring planets — is the real one.

import * as THREE from 'three';
import { AU_KM, UNITS_PER_AU } from './constants.js';
import { STAR, PLANETS, BODY_BY_ID } from './data.js';

const DEG = Math.PI / 180;
const MOON_DEG = 0.52;

export class SurfaceView {
  constructor({ camera, canvas, world }) {
    this.camera = camera;
    this.world = world;
    this.active = false;
    this.id = 'e';
    this.theta = 40;          // degrees from the substellar point
    this.yaw = 0;             // radians, relative to facing the star
    this.pitch = null;        // radians; null = automatic
    this.fov = 70;

    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    // Look around by dragging; zoom with the wheel.
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active || !drag) return;
      const k = 0.004 * this.fov / 60;
      this.yaw -= (e.clientX - drag.x) * k;
      this.pitch = Math.max(-0.2, Math.min(1.55, (this.pitch ?? this._autoPitch) + (e.clientY - drag.y) * k));
      drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.fov = Math.min(100, Math.max(0.3, this.fov * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
  }

  enter(id) {
    this.id = id;
    this.active = true;
    this.yaw = 0;
    this.pitch = null;
  }

  exit() {
    this.active = false;
  }

  /** Local "up" at the observer, in world space. */
  upVector(out) {
    const view = this.world.viewOf(this.id);
    view.spin.getWorldQuaternion(this._q);
    const t = this.theta * DEG;
    // Along the equator, eastward of the substellar point (local −z is east).
    return out.set(Math.cos(t), 0, -Math.sin(t)).applyQuaternion(this._q).normalize();
  }

  update() {
    if (!this.active) return;
    const cam = this.camera;
    const view = this.world.viewOf(this.id);
    const up = this.upVector(this._up);

    // A few km up: 0.08 % of the radius.
    this._pos.copy(view.renderPos).addScaledVector(up, view.drawRadius * 1.0008);

    // Horizontal frame: forward points at the star's azimuth (east if overhead).
    const toStar = this._d.copy(this.world.starWorld).sub(this._pos).normalize();
    const f = this._f.copy(toStar).addScaledVector(up, -toStar.dot(up));
    // Star exactly overhead: face north (the spin axis is scene +y).
    if (f.lengthSq() < 1e-8) f.set(0, 1, 0).addScaledVector(up, -up.y);
    f.normalize();
    const r = this._r.crossVectors(f, up).normalize();

    const elev = Math.asin(Math.max(-1, Math.min(1, toStar.dot(up))));
    this._autoPitch = Math.max(8 * DEG, Math.min(35 * DEG, elev * 0.6));
    const pitch = this.pitch ?? this._autoPitch;

    const dir = this._tmp.copy(f).multiplyScalar(Math.cos(this.yaw)).addScaledVector(r, Math.sin(this.yaw));
    dir.multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch));

    cam.position.copy(this._pos);
    cam.up.copy(up);
    cam.lookAt(this._pos.clone().add(dir));
    cam.fov = this.fov;
    cam.near = 1e-6;
    cam.updateProjectionMatrix();
  }

  /** What the observer sees: star size and height, and the biggest planets. */
  describe() {
    const view = this.world.viewOf(this.id);
    const up = this.upVector(new THREE.Vector3());
    const pos = view.renderPos.clone().addScaledVector(up, view.drawRadius);
    const toStar = this.world.starWorld.clone().sub(pos);
    const dStar = toStar.length();
    const starDeg = 2 * Math.atan(this.world.starDrawRadius / dStar) / DEG;
    const starElev = Math.asin(toStar.normalize().dot(up)) / DEG;

    const sky = [];
    for (const p of PLANETS) {
      if (p.id === this.id) continue;
      const pv = this.world.viewOf(p.id);
      const rel = pv.renderPos.clone().sub(pos);
      const dist = rel.length();
      const sizeDeg = 2 * Math.atan(pv.drawRadius / dist) / DEG;
      const elev = Math.asin(rel.clone().normalize().dot(up)) / DEG;
      // Illuminated fraction from the star–planet–observer angle.
      const toS = this.world.starWorld.clone().sub(pv.renderPos).normalize();
      const toO = pos.clone().sub(pv.renderPos).normalize();
      const phase = (1 + toS.dot(toO)) / 2;
      sky.push({ id: p.id, sizeDeg, elev, phase, km: (dist / UNITS_PER_AU) * AU_KM, moons: sizeDeg / MOON_DEG });
    }
    sky.sort((a, b) => b.sizeDeg - a.sizeDeg);
    return { planet: BODY_BY_ID[this.id], theta: this.theta, starDeg, starElev, sky, starName: STAR.name };
  }
}
