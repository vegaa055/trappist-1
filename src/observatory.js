// The observatory drawer: light curve, transit-timing variations, timeline.

import { drawLightCurve, drawTTV, drawLaplace } from './plots.js';
import { BANDS, centralDepths } from './observe.js';
import { TIMELINE } from './observations.js';
import { PLANETS } from './data.js';

export function createObservatory({ settings, photometer, getDetector, getLaplace, markers, epochJD, onBand }) {
  const $ = (id) => document.getElementById(id);
  const root = $('observatory');
  const lcCanvas = $('lc-canvas');
  const ttvCanvas = $('ttv-canvas');
  const lapCanvas = $('lap-canvas');
  const lcNote = $('lc-note');
  const hiddenTTV = new Set();
  let tab = 'lc';
  let lcTimer = 0, ttvTimer = 0;
  let windowDays = 1;

  // ------------------------------------------------------------- tabs
  function selectTab(name) {
    tab = name;
    for (const b of root.querySelectorAll('.tab')) {
      b.classList.toggle('is-active', b.dataset.tab === name);
      b.setAttribute('aria-selected', String(b.dataset.tab === name));
    }
    for (const pane of root.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== name;
    $('lc-tools').hidden = name !== 'lc';
    lcTimer = ttvTimer = 0;
  }
  for (const btn of root.querySelectorAll('.tab')) btn.addEventListener('click', () => selectTab(btn.dataset.tab));

  for (const chip of root.querySelectorAll('.chip[data-band]')) {
    chip.addEventListener('click', () => {
      for (const c of root.querySelectorAll('.chip[data-band]')) {
        c.classList.toggle('is-active', c === chip);
        c.setAttribute('aria-pressed', String(c === chip));
      }
      onBand(chip.dataset.band);
      lcTimer = 0;
    });
  }

  // Click a legend entry to hide/show that planet's TTVs.
  ttvCanvas.addEventListener('click', (e) => {
    const r = ttvCanvas.getBoundingClientRect();
    if (e.clientY - r.top > 16) return;
    const i = Math.floor((e.clientX - r.left - 50) / 30);
    const p = PLANETS[i];
    if (!p) return;
    if (hiddenTTV.has(p.id)) hiddenTTV.delete(p.id); else hiddenTTV.add(p.id);
    ttvTimer = 0;
  });

  $('timeline').innerHTML = TIMELINE.map((e) => `<li><span class="timeline__date">${e.date}</span>`
    + `<span class="timeline__text">${e.text} <em>${e.url ? `<a href="${e.url}" target="_blank" rel="noopener">${e.ref}</a>` : e.ref}</em></span></li>`).join('');

  $('observatory-close').addEventListener('click', () => { settings.showObservatory = false; sync(); });

  function sync() {
    root.hidden = !settings.showObservatory;
  }

  const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(3)} %`;

  function update(dtWall) {
    sync();
    if (!settings.showObservatory) return;

    // Window follows the time rate: about eight seconds of history on screen.
    if (!settings.paused) windowDays = Math.min(20, Math.max(0.25, settings.daysPerSecond * 8));

    if (tab === 'lc') {
      lcTimer -= dtWall;
      if (lcTimer <= 0) {
        lcTimer = 1 / 20;
        drawLightCurve(lcCanvas, photometer, { windowDays, markers });
        const L = photometer.latest();
        if (L) {
          const band = BANDS[photometer.band.id];
          lcNote.innerHTML = `<b>${pct(L.flux - 1)}</b> now · transits ${pct(-L.transit)} · spots ${pct(-L.spot)} · flares ${pct(L.flare)}`
            + ` <span class="muted">· ${band.label} · window ${windowDays < 2 ? `${(windowDays * 24).toFixed(0)} h` : `${windowDays.toFixed(1)} d`} · one sample per 5.8 min</span>`;
        }
      }
    } else if (tab === 'ttv') {
      ttvTimer -= dtWall;
      if (ttvTimer <= 0) {
        ttvTimer = 0.5;
        drawTTV(ttvCanvas, getDetector(), { epochJD, hidden: hiddenTTV });
      }
    } else if (tab === 'laplace') {
      ttvTimer -= dtWall;
      if (ttvTimer <= 0) {
        ttvTimer = 0.5;
        drawLaplace(lapCanvas, getLaplace(), { epochJD, labels: ['bcd', 'cde', 'def', 'efg', 'fgh'] });
      }
    }
  }

  // Reference transit depths, shown under the light curve tab title.
  function depthsText(bandId) {
    return centralDepths(bandId).map((d) => `${d.id} ${(d.depth * 100).toFixed(2)}%`).join(' · ');
  }
  $('lc-depths').textContent = `central transit depths: ${depthsText(settings.lcBand)}`;

  return {
    update,
    sync,
    selectTab,
    setBand(id) { $('lc-depths').textContent = `central transit depths: ${depthsText(id)}`; },
  };
}
