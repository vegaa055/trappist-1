// DOM wiring: control panel, body picker, info card, resonance readout.

import { STAR, PLANETS, BODY_BY_ID } from './data.js';
import { STATUS, MEASURED_15UM, MEASURED_NIGHT } from './scenarios.js';
import { OBSERVATIONS } from './observations.js';
import { DEFAULT_PLANET_SCALE, DEFAULT_STAR_SCALE } from './constants.js';

const TOGGLES = [
  { key: 'showOrbits', label: 'Orbits' },
  { key: 'showTrails', label: 'Trails' },
  { key: 'showLabels', label: 'Labels' },
  { key: 'showHabitableZone', label: 'Habitable zone' },
  { key: 'showLineOfSight', label: 'Line of sight' },
  { key: 'thermalView', label: 'Thermal 15 µm' },
  { key: 'showAtmospheres', label: 'Atmospheres' },
  { key: 'showGlow', label: 'Glow' },
  { key: 'flareLighting', label: 'Flare light' },
  { key: 'showStars', label: 'Stars' },
  { key: 'showBump', label: 'Relief' },
  { key: 'highDetail', label: 'High detail' },
  { key: 'realisticFalloff', label: 'True 1/r² light' },
];

// Slider position -> days per second, logarithmic.
const SPEED_MIN = 1e-5;
const SPEED_MAX = 60;
export const sliderToSpeed = (v) => SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, v / 1000);
export const speedToSlider = (s) =>
  Math.round(1000 * Math.log(s / SPEED_MIN) / Math.log(SPEED_MAX / SPEED_MIN));

const fmt = (n, digits = 2) => {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e7)) return n.toExponential(digits);
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
};
const fmtInt = (n) => (isFinite(n) ? Math.round(n).toLocaleString() : '—');

function formatSpeed(s) {
  if (s < 1 / 3600) return `${fmt(s * 86400, 2)} sec / sec`;
  if (s < 1 / 12) return `${fmt(s * 1440, 2)} min / sec`;
  if (s < 1) return `${fmt(s * 24, 2)} hours / sec`;
  return `${fmt(s, 2)} days / sec`;
}

function formatDays(d) {
  if (d < 1) return `${fmt(d * 24, 2)} h`;
  return `${fmt(d, 4)} d`;
}

export function formatDate(jd) {
  const ms = (jd - 2440587.5) * 86400000;
  if (!isFinite(ms) || Math.abs(ms) > 8.64e15) return 'beyond calendar range';
  const d = new Date(ms);
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(d.getUTCDate())} ${month} ${d.getUTCFullYear()}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

const kelvin = (k) => `${fmtInt(k)} K (${fmtInt(k - 273.15)} °C)`;

export function createUI({ settings, callbacks }) {
  const $ = (id) => document.getElementById(id);
  const els = {
    date: $('date-readout'),
    speed: $('speed-readout'),
    panel: $('panel'),
    bodyList: $('body-list'),
    toggles: $('toggles'),
    info: $('info'),
    infoName: $('info-name'),
    infoBadge: $('info-badge'),
    infoStats: $('info-stats'),
    infoFindings: $('info-findings'),
    infoSources: $('info-sources'),
    ratios: $('res-ratios'),
    laplace: $('res-laplace'),
    diagFps: $('diag-fps'),
    diagSteps: $('diag-steps'),
    diagElapsed: $('diag-elapsed'),
    diagEnergy: $('diag-energy'),
    btnPlay: $('btn-play'),
  };

  // ------------------------------------------------------------ body picker
  const bodyButtons = new Map();
  for (const body of [STAR, ...PLANETS]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `body-btn body-btn--${body.kind}`;
    const color = body.uiColor || STAR.color;
    const text = body.kind === 'star' ? 'TRAPPIST-1' : body.letter;
    btn.innerHTML = `<span class="body-btn__dot" style="background:${color};color:${color}"></span>${text}`;
    btn.title = body.name;
    btn.addEventListener('click', () => callbacks.onFocus(body.id));
    els.bodyList.appendChild(btn);
    bodyButtons.set(body.id, btn);
  }

  // --------------------------------------------------------------- toggles
  const toggleButtons = new Map();
  for (const { key, label } of TOGGLES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      settings[key] = !settings[key];
      btn.classList.toggle('is-on', settings[key]);
      callbacks.onToggle?.(key, settings[key]);
    });
    els.toggles.appendChild(btn);
    toggleButtons.set(key, btn);
  }
  const syncToggles = () => {
    for (const [key, btn] of toggleButtons) {
      btn.classList.toggle('is-on', !!settings[key]);
      btn.setAttribute('aria-pressed', String(!!settings[key]));
    }
    $('thermal-legend').hidden = !settings.thermalView;
  };
  syncToggles();

  // --------------------------------------------------------------- sliders
  function slider(id, valueId, apply, format) {
    const input = $(id);
    const out = $(valueId);
    const run = () => {
      const v = Number(input.value);
      apply(v);
      out.textContent = format(v);
    };
    input.addEventListener('input', run);
    run();
    return { input, run };
  }

  const speedSlider = slider('in-speed', 'val-speed',
    (v) => { settings.daysPerSecond = sliderToSpeed(v); },
    (v) => formatSpeed(sliderToSpeed(v)));
  const planetSlider = slider('in-planet', 'val-planet',
    (v) => { settings.planetScale = v; }, (v) => `${fmtInt(v)}×`);
  const starSlider = slider('in-star', 'val-star',
    (v) => { settings.starScale = v; }, (v) => `${fmtInt(v)}×`);

  slider('in-spots', 'val-spots',
    (v) => { settings.spotCoverage = v / 1000; }, (v) => `${(v / 10).toFixed(1)}% of surface`);
  slider('in-faculae', 'val-faculae',
    (v) => { settings.faculae = v / 100; }, (v) => `${fmtInt(v)}%`);
  slider('in-flare-rate', 'val-flare-rate',
    (v) => { settings.flareRate = v / 100; }, (v) => (v === 100 ? 'observed (K2)' : `${(v / 100).toFixed(1)}× observed`));
  $('btn-superflare').addEventListener('click', () => callbacks.onSuperflare?.());
  $('btn-earth').addEventListener('click', () => callbacks.onEarthView?.());
  $('btn-tour').addEventListener('click', () => callbacks.onTour?.());
  $('btn-surface').addEventListener('click', () => callbacks.onSurface?.());
  $('btn-corotate').addEventListener('click', () => callbacks.onCorotate?.());
  $('btn-chimes').addEventListener('click', () => callbacks.onChimes?.());
  const thetaSlider = slider('in-theta', 'val-theta',
    (v) => callbacks.onTheta?.(v),
    (v) => (v < 3 ? 'star overhead' : v > 177 ? 'antistellar point' : Math.abs(v - 90) < 3 ? 'terminator' : `${v}° from substellar`));
  function setTheta(v) { thetaSlider.input.value = String(v); thetaSlider.run(); }

  function renderSurface(d) {
    $('surface-title').innerHTML = `Standing on <b>${d.planet.name}</b> · ${d.theta.toFixed(0)}° from the substellar point`;
    const rows = [
      ['star', `${d.starDeg.toFixed(2)}° across (${(d.starDeg / 0.53).toFixed(1)}× the Sun from Earth) · ${d.starElev >= 0 ? `${d.starElev.toFixed(0)}° up` : 'below horizon'}`],
    ];
    for (const p of d.sky.slice(0, 3)) {
      rows.push([`${p.id}`, `${p.sizeDeg < 0.1 ? `${(p.sizeDeg * 60).toFixed(1)}′` : `${p.sizeDeg.toFixed(2)}°`} (${p.moons.toFixed(2)}× Moon) · ${Math.round(p.km).toLocaleString()} km · ${Math.round(p.phase * 100)}% lit · ${p.elev >= 0 ? `${p.elev.toFixed(0)}° up` : 'below horizon'}`]);
    }
    $('surface-stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }
  $('btn-observatory').addEventListener('click', () => callbacks.onObservatory?.());

  slider('in-exposure', 'val-exposure',
    (v) => { settings.exposure = v / 100; }, (v) => (v / 100).toFixed(2));
  slider('in-bloom', 'val-bloom',
    (v) => { settings.bloom = v / 100; callbacks.onBloom?.(v / 100); }, (v) => (v / 100).toFixed(2));
  slider('in-mw', 'val-mw',
    (v) => { settings.milkyWay = v / 100; }, (v) => `${fmtInt(v)}%`);

  for (const chip of document.querySelectorAll('.chip[data-speed]')) {
    chip.addEventListener('click', () => {
      speedSlider.input.value = String(speedToSlider(Number(chip.dataset.speed)));
      speedSlider.run();
    });
  }

  const setScale = (planet, star) => {
    planetSlider.input.value = String(planet);
    starSlider.input.value = String(star);
    planetSlider.run(); starSlider.run();
  };
  $('btn-true-scale').addEventListener('click', () => setScale(1, 1));
  $('btn-default-scale').addEventListener('click', () => setScale(DEFAULT_PLANET_SCALE, DEFAULT_STAR_SCALE));

  // ------------------------------------------------------------- buttons
  els.btnPlay.addEventListener('click', () => callbacks.onTogglePause());
  $('btn-now').addEventListener('click', () => callbacks.onEpoch('now'));
  $('btn-epoch').addEventListener('click', () => callbacks.onEpoch('agol'));
  $('btn-follow').addEventListener('click', () => callbacks.onFollow(settings.selected));
  $('btn-release').addEventListener('click', () => callbacks.onFollow(null));
  $('info-close').addEventListener('click', () => callbacks.onSelect(null));

  $('panel-toggle').addEventListener('click', () => {
    els.panel.hidden = true;
    $('panel-open').classList.add('is-visible');
  });
  $('panel-open').addEventListener('click', () => {
    els.panel.hidden = false;
    $('panel-open').classList.remove('is-visible');
  });

  // --------------------------------------------------------------- public
  function setPaused(paused) {
    els.btnPlay.textContent = paused ? 'Play' : 'Pause';
  }

  function setSelected(id) {
    for (const [bid, btn] of bodyButtons) btn.classList.toggle('body-btn--active', bid === id);
    if (!id) { els.info.hidden = true; return; }
    const body = BODY_BY_ID[id];
    els.info.hidden = false;
    els.infoName.textContent = body.name;
    els.info.style.setProperty('--accent', body.uiColor || STAR.color);

    if (body.kind === 'star') {
      els.infoBadge.textContent = `${STAR.spectralType} · ultracool dwarf`;
      els.infoFindings.textContent =
        'Fully convective and far more magnetically active than expected. Dark spots and bright faculae '
        + 'imprint on every transit spectrum, and flares hit roughly every JWST visit — which is why '
        + 'separating the star from the planets takes many more transits than planned.';
      els.infoSources.textContent = 'Agol+ 2021 (PSJ); Vida+ 2017 (K2 flares); Lim+ 2026 (NIRISS); NASA/STScI, Jan 2026';
    } else {
      els.infoBadge.textContent = `JWST: ${body.findings.status}`;
      els.infoFindings.textContent = body.findings.summary;
      els.infoSources.textContent = body.findings.sources;
    }
    renderScenarios(body);
    renderObservations(body);
  }

  function renderObservations(body) {
    const list = OBSERVATIONS[body.id];
    $('info-obs-wrap').hidden = !list;
    if (!list) return;
    $('info-obs').innerHTML = list.map((o) => `<li><span class="obs__when">${o.date} · ${o.facility}</span>`
      + `<span class="obs__what">${o.what}: ${o.result}</span>`
      + `<span class="obs__ref">${o.url ? `<a href="${o.url}" target="_blank" rel="noopener">${o.ref}</a>` : o.ref}</span></li>`).join('');
  }

  // ------------------------------------------------------------ scenarios
  const scenarioButtons = new Map();

  function renderScenarios(body) {
    const wrap = $('info-scenarios-wrap');
    scenarioButtons.clear();
    const isPlanet = body.kind === 'planet';
    wrap.hidden = !isPlanet;
    if (!isPlanet) return;
    const list = $('info-scenarios');
    list.innerHTML = '';
    for (const sc of body.scenarios) {
      const st = STATUS[sc.status];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scenario';
      btn.innerHTML = `<span class="scenario__label">${sc.label}</span>`
        + `<span class="scenario__status" style="color:${st.color};border-color:${st.color}">${st.label}</span>`;
      btn.addEventListener('click', () => callbacks.onScenario?.(body.id, sc.id));
      list.appendChild(btn);
      scenarioButtons.set(sc.id, btn);
    }
  }

  function markScenario(scenario) {
    if (!scenario) return;
    for (const [id, btn] of scenarioButtons) btn.classList.toggle('is-active', id === scenario.id);
    $('info-scenario-note').textContent = scenario.note;
  }

  function renderInfo(desc) {
    if (!desc) return;
    const b = desc.body;
    const stats = [];
    if (b.kind === 'star') {
      stats.push(['mass', `${b.massSun} M☉ (${fmtInt(b.massSun * 1047.6)} M♃)`]);
      stats.push(['radius', `${b.radiusSun} R☉ (${fmtInt(b.radiusKm)} km)`]);
      stats.push(['temperature', `${fmtInt(b.teff)} K`]);
      stats.push(['luminosity', `${(b.luminositySun * 100).toFixed(3)} % of the Sun`]);
      stats.push(['rotation', `${b.rotPeriod} d`]);
      stats.push(['age', `${b.ageGyr} ± 2.2 Gyr`]);
      stats.push(['distance', `${b.distanceLy} ly`]);
      stats.push(['habitable zone', `${fmt(desc.hz.runawayGreenhouse.au, 4)}–${fmt(desc.hz.maxGreenhouse.au, 4)} AU`]);
      const a = desc.activity;
      stats.push(['spot coverage', `${(a.coverage * 100).toFixed(1)} % (${a.spots.length} spots)`]);
      stats.push(['spot dimming to Earth', `${(a.modulation.deficit * 100).toFixed(2)} %`]);
      stats.push(['flare output now', a.bolometricBoost > 1e-5 ? `+${(a.bolometricBoost * 100).toFixed(3)} % L★` : 'quiet']);
    } else {
      stats.push(['radius', `${fmt(b.radiusEarth, 3)} R⊕ (${fmtInt(b.radiusKm)} km)`]);
      stats.push(['mass', `${fmt(b.massEarth, 3)} M⊕`]);
      stats.push(['density', `${fmt(b.densityGcc, 2)} g/cm³`]);
      stats.push(['orbital period', formatDays(desc.periodDays)]);
      stats.push(['distance', `${fmt(desc.distanceAU, 5)} AU (${fmtInt(desc.distanceKm)} km)`]);
      stats.push(['eccentricity', fmt(desc.eccentricity, 4)]);
      stats.push(['orbital speed', `${fmt(desc.speedKms, 2)} km/s`]);
      stats.push(['starlight', `${fmt(b.irradiation, 3)} × Earth's`]);
      stats.push(['star in the sky', `${fmt(desc.starSizeDeg, 2)}° (Sun from Earth: 0.53°)`]);
      stats.push(['equilibrium temp', kelvin(desc.teq)]);
      stats.push(['habitable zone', desc.inHZ ? 'inside (conservative)' : 'outside']);
      const th = desc.thermal;
      stats.push(['<b>this scenario</b>', `albedo ${desc.scenario.albedo}, heat transport ${Math.round(desc.scenario.redistribution * 100)} %`]);
      stats.push(['substellar surface', kelvin(th.substellar)]);
      stats.push(['dayside at 15 µm', `<b>${fmtInt(th.day15)} K</b>`]);
      for (const m of MEASURED_15UM[b.id] || []) {
        const z = (th.day15 - m.value) / m.err;
        const tone = Math.abs(z) <= 1 ? 'good' : Math.abs(z) <= 2 ? 'fair' : 'poor';
        stats.push([`JWST: ${m.source}`, `${m.value} ± ${m.err} K <span class="z z--${tone}">${z >= 0 ? '+' : ''}${z.toFixed(1)}σ</span>`]);
      }
      stats.push(['night side at 15 µm', `${fmtInt(th.night15)} K (${fmtInt(th.night15 - 273.15)} °C)`]);
      const night = MEASURED_NIGHT[b.id];
      if (night) {
        const ok = th.night15 <= night.max;
        stats.push([`JWST: ${night.source}, night`, `below ${night.max} K <span class="z z--${ok ? 'good' : 'poor'}">${ok ? 'passes' : 'too warm'}</span>`]);
      }
    }
    markScenario(desc.scenario);
    els.infoStats.innerHTML = stats
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
      .join('');
  }

  function renderResonance(res) {
    els.ratios.innerHTML = res.ratios.map((r) => {
      const pct = r.offset * 100;
      return `<div><dt>${r.pair} <span class="muted">${r.label}</span></dt>`
        + `<dd>${r.ratio.toFixed(4)} <span class="muted">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span></dd></div>`;
    }).join('');
    els.laplace.innerHTML = res.laplace.map((l) =>
      `<div><dt>φ<sub>${l.triplet}</sub> <span class="muted">(${l.p},${l.q})</span></dt><dd>${l.phi.toFixed(1)}°</dd></div>`,
    ).join('');
  }

  const expo = (e) => {
    const k = Math.floor(Math.log10(e));
    return `${(e / 10 ** k).toFixed(1)}×10<sup>${k}</sup>`;
  };

  function renderActivity(act, nowJD) {
    const rate = act.observedFlareRate();
    $('act-stats').innerHTML = [
      ['spot coverage', `${(act.coverage * 100).toFixed(1)} %`],
      ['dimming toward Earth', `${(act.modulation.deficit * 100).toFixed(2)} %`],
      ['modulation, last rotation', `${(act.modulation.p2p * 100).toFixed(2)} % p-p <span class="muted">(K2: ~1 %)</span>`],
      ['flares / day > 10<sup>29</sup> erg', `${fmt(act.flareRate(), 2)} expected · ${isFinite(rate) ? fmt(rate, 2) : '—'} seen`],
      ['flare light now', act.bolometricBoost > 1e-5
        ? `+${(act.bolometricBoost * 100).toFixed(3)} % bol · +${(act.channelBoost[2] * 100).toFixed(1)} % blue`
        : 'quiet'],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    $('flare-log').innerHTML = act.log.length
      ? act.log.map((f) => {
        const jd = nowJD - (act.time - f.simTime);
        const blue = f.peakFrac * act.blueBoostPerFrac;
        return `<li class="${f.shown ? '' : 'is-skipped'}"><span class="flare-log__when">${formatDate(jd).slice(0, 18)}</span>`
          + `<span class="flare-log__e">${expo(f.energy)} erg</span>`
          + `<span class="flare-log__peak">+${(blue * 100).toFixed(blue < 0.1 ? 1 : 0)} % blue</span></li>`;
      }).join('')
      : '<li class="muted">no flares yet — speed time up or trigger one</li>';
  }

  function setSpeed(daysPerSecond) {
    speedSlider.input.value = String(speedToSlider(daysPerSecond));
    speedSlider.run();
  }

  function updateClock(jd, daysPerSecond, paused) {
    els.date.textContent = formatDate(jd);
    els.speed.textContent = paused ? 'paused' : formatSpeed(daysPerSecond);
  }

  function updateDiagnostics({ fps, steps, elapsedDays, energyDrift }) {
    els.diagFps.textContent = fps.toFixed(0);
    els.diagSteps.textContent = fmtInt(steps);
    els.diagElapsed.textContent = `${fmt(elapsedDays / 365.25, 2)} yr since 2015 epoch`;
    els.diagEnergy.textContent = energyDrift < 1e-13 ? '< 1e-13' : energyDrift.toExponential(2);
  }

  return {
    setPaused, setSelected, renderInfo, renderResonance, renderActivity, setSpeed, setScale,
    setTheta, renderSurface, callbacks,
    updateClock, updateDiagnostics, syncToggles,
  };
}
