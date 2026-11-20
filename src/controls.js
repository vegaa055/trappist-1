// Orbit / dolly / pan camera controls.
//
// Written by hand rather than pulled from three's examples so that the dolly
// step can stay exponential across the eleven orders of magnitude between a
// moon's surface and Pluto's aphelion, and so the target can be handed off to a
// moving body without fighting the damping.

import * as THREE from 'three';

const EPS = 1e-6;

export class OrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;

    this.target = new THREE.Vector3();

    // Spherical camera offset from the target.
    this.spherical = new THREE.Spherical(300, Math.PI / 2 - 0.45, 0.6);
    this.sphericalDelta = { theta: 0, phi: 0 };
    this.panOffset = new THREE.Vector3();
    this.scaleAccum = 1;

    this.minDistance = 0.05;
    this.maxDistance = 40000;
    this.minPolar = 0.001;
    this.maxPolar = Math.PI - 0.001;

    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.0;
    this.panSpeed = 1.0;
    this.damping = 0.12;

    this.enabled = true;

    this._state = 'none';
    this._pointers = new Map();
    this._last = new THREE.Vector2();
    this._pinchDist = 0;
    this._pinchMid = new THREE.Vector2();
    this._moved = 0;

    this._offset = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();

    this._bind();
    this.update(1);
  }

  _bind() {
    const d = this.dom;
    this._onDown = this._pointerDown.bind(this);
    this._onMove = this._pointerMove.bind(this);
    this._onUp = this._pointerUp.bind(this);
    this._onWheel = this._wheel.bind(this);
    this._onContext = (e) => e.preventDefault();

    d.addEventListener('pointerdown', this._onDown);
    d.addEventListener('wheel', this._onWheel, { passive: false });
    d.addEventListener('contextmenu', this._onContext);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  dispose() {
    const d = this.dom;
    d.removeEventListener('pointerdown', this._onDown);
    d.removeEventListener('wheel', this._onWheel);
    d.removeEventListener('contextmenu', this._onContext);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
  }

  _pointerDown(e) {
    if (!this.enabled) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));
    this._moved = 0;

    if (this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      this._pinchDist = a.distanceTo(b);
      this._pinchMid.copy(a).add(b).multiplyScalar(0.5);
      this._state = 'pinch';
    } else {
      const pan = e.button === 2 || e.button === 1 || e.shiftKey;
      this._state = pan ? 'pan' : 'rotate';
      this._last.set(e.clientX, e.clientY);
    }
  }

  _pointerMove(e) {
    if (!this.enabled || !this._pointers.has(e.pointerId)) return;
    this._pointers.get(e.pointerId).set(e.clientX, e.clientY);

    const h = this.dom.clientHeight || 1;

    if (this._state === 'pinch' && this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      const dist = a.distanceTo(b);
      if (this._pinchDist > 0) this.dolly(Math.pow(this._pinchDist / dist, 1.6));
      this._pinchDist = dist;

      const mid = new THREE.Vector2().copy(a).add(b).multiplyScalar(0.5);
      this._panPixels(mid.x - this._pinchMid.x, mid.y - this._pinchMid.y);
      this._pinchMid.copy(mid);
      return;
    }

    const dx = e.clientX - this._last.x;
    const dy = e.clientY - this._last.y;
    this._last.set(e.clientX, e.clientY);
    this._moved += Math.abs(dx) + Math.abs(dy);

    if (this._state === 'rotate') {
      this.sphericalDelta.theta -= (2 * Math.PI * dx / h) * this.rotateSpeed;
      this.sphericalDelta.phi -= (2 * Math.PI * dy / h) * this.rotateSpeed;
    } else if (this._state === 'pan') {
      this._panPixels(dx, dy);
    }
  }

  _pointerUp(e) {
    this._pointers.delete(e.pointerId);
    this.dom.releasePointerCapture?.(e.pointerId);
    if (this._pointers.size === 0) this._state = 'none';
    else if (this._pointers.size === 1) {
      this._state = 'rotate';
      const p = [...this._pointers.values()][0];
      this._last.copy(p);
    }
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    // Normalise the three deltaMode units to something comparable.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const amount = e.deltaY * unit;
    this.dolly(Math.exp(amount * 0.0012 * this.zoomSpeed));
  }

  /** True while the user is actively dragging — used to suppress click-select. */
  get dragging() {
    return this._state !== 'none';
  }

  get clickWasDrag() {
    return this._moved > 6;
  }

  dolly(factor) {
    this.scaleAccum *= factor;
  }

  _panPixels(dx, dy) {
    // Move the target across the view plane, scaled so the world appears to
    // track the cursor regardless of how far away we are.
    const dist = this.spherical.radius;
    const fov = this.camera.fov * Math.PI / 180;
    const h = this.dom.clientHeight || 1;
    const worldPerPixel = (2 * Math.tan(fov / 2) * dist) / h;

    this.camera.updateMatrixWorld();
    this._right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this._up.setFromMatrixColumn(this.camera.matrixWorld, 1);

    this.panOffset.addScaledVector(this._right, -dx * worldPerPixel * this.panSpeed);
    this.panOffset.addScaledVector(this._up, dy * worldPerPixel * this.panSpeed);
  }

  /** Frame the camera on a sphere of the given radius without changing angles. */
  frame(radius, multiple = 4.5) {
    this.spherical.radius = Math.max(this.minDistance, radius * multiple);
    this.scaleAccum = 1;
  }

  update(dt = 1 / 60) {
    // Frame-rate independent damping.
    const k = this.damping <= 0 ? 1 : 1 - Math.pow(1 - this.damping, dt * 60);

    this.spherical.theta += this.sphericalDelta.theta * k;
    this.spherical.phi += this.sphericalDelta.phi * k;
    this.sphericalDelta.theta *= 1 - k;
    this.sphericalDelta.phi *= 1 - k;

    this.spherical.phi = Math.max(this.minPolar, Math.min(this.maxPolar, this.spherical.phi));

    const scaleStep = Math.pow(this.scaleAccum, k);
    this.spherical.radius *= scaleStep;
    this.scaleAccum /= scaleStep;
    if (Math.abs(this.scaleAccum - 1) < 1e-4) this.scaleAccum = 1;

    this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));

    this.target.addScaledVector(this.panOffset, k);
    this.panOffset.multiplyScalar(1 - k);

    this._offset.setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(this._offset);
    this.camera.lookAt(this.target);

    // Keep the near plane tight against whatever we are looking at so the
    // logarithmic depth buffer has an easy job.
    const near = Math.max(0.0008, this.spherical.radius * 0.0015);
    if (Math.abs(this.camera.near - near) > near * 0.1) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    return Math.abs(this.sphericalDelta.theta) + Math.abs(this.sphericalDelta.phi) > EPS;
  }
}
