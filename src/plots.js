// Canvas plots for the observatory drawer: light curve and transit-timing
// variations. Plain 2D canvas, redrawn a few times a second.

import { PLANETS, PLANET_COLORS } from './data.js';
import { fitEphemeris } from './transits.js';

const INK = 'rgba(232, 238, 247, 0.85)';
const DIM = 'rgba(147, 162, 184, 0.75)';
const GRID = 'rgba(150, 175, 210, 0.12)';
const FONT = '10px ui-monospace, "Cascadia Mono", Consolas, monospace';

function setup(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  return { ctx, w, h };
}

function niceStep(range, target) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

/**
 * Light curve over the last `windowDays`, relative flux in %.
 * Samples are binned per pixel column (min/max) so long windows stay honest.
 */
export function drawLightCurve(canvas, photometer, { windowDays, markers }) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 46, r: 10, t: 10, b: 20 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const latest = photometer.latest();
  if (!latest) {
    ctx.fillStyle = DIM;
    ctx.fillText('waiting for data — let time run', pad.l + 8, pad.t + 16);
    return;
  }
  const tNow = latest.t;
  const t0 = tNow - windowDays;

  // Bin by column.
  const lo = new Float32Array(pw).fill(Infinity);
  const hi = new Float32Array(pw).fill(-Infinity);
  let yMin = Infinity, yMax = -Infinity;
  for (const j of photometer.since(t0)) {
    const x = Math.floor(((photometer.t[j] - t0) / windowDays) * (pw - 1));
    if (x < 0 || x >= pw) continue;
    const v = (photometer.flux[j] - 1) * 100;
    if (v < lo[x]) lo[x] = v;
    if (v > hi[x]) hi[x] = v;
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  }
  // Keep at least ±0.25 % visible so a quiet star does not look noisy.
  yMin = Math.min(yMin, -0.25);
  yMax = Math.max(yMax, 0.1);
  const span = yMax - yMin;
  yMin -= span * 0.08; yMax += span * 0.08;
  const Y = (v) => pad.t + ((yMax - v) / (yMax - yMin)) * ph;
  const X = (t) => pad.l + ((t - t0) / windowDays) * pw;

  // Grid and axes.
  ctx.strokeStyle = GRID;
  ctx.fillStyle = DIM;
  ctx.lineWidth = 1;
  const ys = niceStep(yMax - yMin, 4);
  for (let v = Math.ceil(yMin / ys) * ys; v <= yMax; v += ys) {
    ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(w - pad.r, Y(v)); ctx.stroke();
    ctx.fillText(`${v >= 0 ? '+' : ''}${v.toFixed(ys < 0.1 ? 2 : 1)}%`, 4, Y(v) + 3);
  }
  const hoursWindow = windowDays * 24;
  const xs = niceStep(hoursWindow, 5);
  for (let hAgo = 0; hAgo <= hoursWindow; hAgo += xs) {
    const x = X(tNow - hAgo / 24);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
    const label = hAgo === 0 ? 'now' : hoursWindow > 72 ? `−${(hAgo / 24).toFixed(hAgo % 24 ? 1 : 0)} d` : `−${hAgo} h`;
    ctx.fillText(label, x - ctx.measureText(label).width / 2, h - 6);
  }

  // Data.
  ctx.strokeStyle = '#ffb27a';
  ctx.fillStyle = '#ffb27a';
  ctx.beginPath();
  let started = false;
  for (let x = 0; x < pw; x++) {
    if (lo[x] === Infinity) continue;
    const px = pad.l + x;
    if (hi[x] - lo[x] > 0.002) {
      ctx.moveTo(px + 0.5, Y(hi[x])); ctx.lineTo(px + 0.5, Y(lo[x]));
      started = false;
    } else {
      if (!started) { ctx.moveTo(px, Y(lo[x])); started = true; } else ctx.lineTo(px, Y(lo[x]));
    }
  }
  ctx.stroke();

  // Transit labels at mid-transit times.
  for (const m of markers) {
    if (m.t < t0 || m.t > tNow) continue;
    const x = X(m.t);
    ctx.fillStyle = PLANET_COLORS[m.id];
    ctx.fillText(m.id, x - 3, pad.t + ph - 2);
  }
}

/**
 * Observed-minus-calculated transit times against a linear ephemeris fitted
 * to everything recorded so far, per planet, in minutes.
 */
export function drawTTV(canvas, detector, { epochJD, hidden = new Set() }) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 46, r: 10, t: 16, b: 20 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;

  const series = [];
  let tMin = Infinity, tMax = -Infinity, rMax = 5;
  for (const p of PLANETS) {
    const times = detector.times.get(p.id);
    if (!times || times.length < 4) continue;
    const fit = fitEphemeris(times);
    series.push({ id: p.id, times, resid: fit.resid });
    tMin = Math.min(tMin, times[0]);
    tMax = Math.max(tMax, times[times.length - 1]);
    if (!hidden.has(p.id)) for (const r of fit.resid) rMax = Math.max(rMax, Math.abs(r) * 1440);
  }
  if (!series.length) {
    ctx.fillStyle = DIM;
    ctx.fillText('collecting transits…', pad.l + 8, pad.t + 16);
    return;
  }
  rMax *= 1.1;
  const year = (t) => 2000 + (t + epochJD - 2451544.5) / 365.25;
  const X = (t) => pad.l + ((t - tMin) / Math.max(tMax - tMin, 1)) * pw;
  const Y = (m) => pad.t + ph / 2 - (m / rMax) * (ph / 2);

  ctx.strokeStyle = GRID;
  ctx.fillStyle = DIM;
  const ys = niceStep(2 * rMax, 4);
  for (let m = -Math.floor(rMax / ys) * ys; m <= rMax; m += ys) {
    ctx.beginPath(); ctx.moveTo(pad.l, Y(m)); ctx.lineTo(w - pad.r, Y(m)); ctx.stroke();
    ctx.fillText(`${m > 0 ? '+' : ''}${m.toFixed(0)}m`, 6, Y(m) + 3);
  }
  const y0 = year(tMin), y1 = year(tMax);
  const ystep = niceStep(Math.max(y1 - y0, 0.5), 6);
  for (let y = Math.ceil(y0 / ystep) * ystep; y <= y1; y += ystep) {
    const t = (y - 2000) * 365.25 + 2451544.5 - epochJD;
    const x = X(t);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
    const label = ystep < 1 ? y.toFixed(1) : String(Math.round(y));
    ctx.fillText(label, x - ctx.measureText(label).width / 2, h - 6);
  }

  for (const s of series) {
    if (hidden.has(s.id)) continue;
    ctx.fillStyle = PLANET_COLORS[s.id];
    for (let i = 0; i < s.times.length; i++) {
      ctx.fillRect(X(s.times[i]) - 1, Y(s.resid[i] * 1440) - 1, 2, 2);
    }
  }

  // Legend.
  let lx = pad.l + 4;
  for (const s of series) {
    ctx.fillStyle = hidden.has(s.id) ? DIM : PLANET_COLORS[s.id];
    ctx.fillText(`● ${s.id}`, lx, 11);
    lx += 30;
  }
  ctx.fillStyle = INK;
}

const TRIPLET_COLORS = ['#ff9a6a', '#ffd166', '#6fd3a0', '#5ec5e8', '#a98bff'];

/**
 * Laplace angles over time. In a resonant chain they librate — swing back and
 * forth within a band — instead of circulating through all 360°.
 */
export function drawLaplace(canvas, history, { epochJD, labels }) {
  const { ctx, w, h } = setup(canvas);
  const pad = { l: 46, r: 10, t: 16, b: 20 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const n = history.t.length;
  if (n < 2) {
    ctx.fillStyle = DIM;
    ctx.fillText('collecting…', pad.l + 8, pad.t + 16);
    return;
  }
  const t0 = history.t[0], t1 = history.t[n - 1];
  const X = (t) => pad.l + ((t - t0) / Math.max(t1 - t0, 1)) * pw;
  const Y = (deg) => pad.t + ((180 - deg) / 360) * ph;

  ctx.strokeStyle = GRID;
  ctx.fillStyle = DIM;
  for (const d of [-180, -90, 0, 90, 180]) {
    ctx.beginPath(); ctx.moveTo(pad.l, Y(d)); ctx.lineTo(w - pad.r, Y(d)); ctx.stroke();
    ctx.fillText(`${d}°`, 8, Y(d) + 3);
  }
  const year = (t) => 2000 + (t + epochJD - 2451544.5) / 365.25;
  const y0 = year(t0), y1 = year(t1);
  const ystep = niceStep(Math.max(y1 - y0, 0.5), 6);
  for (let y = Math.ceil(y0 / ystep) * ystep; y <= y1; y += ystep) {
    const x = X((y - 2000) * 365.25 + 2451544.5 - epochJD);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
    const label = ystep < 1 ? y.toFixed(1) : String(Math.round(y));
    ctx.fillText(label, x - ctx.measureText(label).width / 2, h - 6);
  }

  const step = Math.max(1, Math.floor(n / (pw * 2)));
  history.phi.forEach((series, k) => {
    ctx.fillStyle = TRIPLET_COLORS[k];
    for (let i = 0; i < n; i += step) ctx.fillRect(X(history.t[i]) - 0.75, Y(series[i]) - 0.75, 1.5, 1.5);
  });

  let lx = pad.l + 4;
  labels.forEach((label, k) => {
    ctx.fillStyle = TRIPLET_COLORS[k];
    ctx.fillText(`● φ ${label}`, lx, 11);
    lx += 62;
  });
}
