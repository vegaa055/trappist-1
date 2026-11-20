// Transit chimes: every transit plays a note whose pitch is proportional to
// that planet's orbital frequency. Because neighbouring periods sit near
// 8:5, 5:3, 3:2, 3:2, 4:3, 3:2, the notes fall near musical intervals — a
// minor sixth, a major sixth, fifths and a fourth — and the system plays its
// own resonance. (b sounds at 880 Hz; the rest scale as P_b / P.)

import { PLANETS } from './data.js';

export class TransitChimes {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.lastPlayed = new Map();
    const Pb = PLANETS[0].agol.P;
    this.freq = Object.fromEntries(PLANETS.map((p) => [p.id, 880 * Pb / p.agol.P]));
  }

  setEnabled(on) {
    this.enabled = on;
    if (on && !this.ctx) {
      // Created on a user gesture (the toggle click), as browsers require.
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
    }
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(id) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    // At high time rates transits arrive faster than notes can ring.
    if (now - (this.lastPlayed.get(id) ?? -1) < 0.12) return;
    this.lastPlayed.set(id, now);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = this.freq[id];
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 1.5);
  }
}
