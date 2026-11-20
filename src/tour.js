// A guided tour: ten stops, each setting up the view and saying what it shows.
// Every stop starts from a clean state (api.reset) so they can be visited in
// any order.

export const TOUR = [
  {
    title: 'Seven worlds, one small star',
    text: 'TRAPPIST-1 is 40.7 light-years away in Aquarius. Its seven Earth-sized planets all orbit closer than Mercury does to the Sun; the outermost takes under 19 days. The green band is the habitable zone — e, f and g sit inside it.',
    run(api) { api.overview(); api.setSpeed(0.25); },
  },
  {
    title: 'An ultracool, restless star',
    text: 'At 2,566 K and 12 % of the Sun\'s width, TRAPPIST-1 gives out 0.055 % of the Sun\'s light. It is covered in dark spots and bright faculae and flares a couple of times a day. Those flares and spots imprint on every JWST transit — the main reason the planets\' atmospheres are so hard to read. A superflare is going off now.',
    run(api) { api.focus('star'); api.setSpeed(0.02); setTimeout(() => api.superflare(), 600); },
  },
  {
    title: 'b: a bare, hot rock',
    text: 'JWST measured b\'s day side at 490 ± 17 K in thermal infrared. A dark airless rock re-radiating heat where it lands predicts 489 K. The 2026 phase curve found the night side below −200 °C: nothing carries heat around. This is the 15 µm view.',
    run(api) { api.viewDayside('b', 1.0); api.setThermal(true); api.setSpeed(0.02); },
  },
  {
    title: 'c: not a Venus',
    text: 'c\'s dayside (369 ± 23 K) is too hot for a cloudy Venus-like atmosphere, which would reflect most of the light. Bare, fairly reflective rock fits, as does a very thin CO₂ layer. Use the scenario list on its card to compare each case with the JWST numbers.',
    run(api) { api.viewDayside('c', 0.9); api.setSpeed(0.02); },
  },
  {
    title: 'e: the habitable-zone question',
    text: 'Hydrogen-rich and CO₂-dominated atmospheres are ruled out. A nitrogen atmosphere with a trace of methane is still allowed — and so is bare rock; the odds are even. Shown here is the ocean hypothesis: open water beneath the star, ice beyond, a cloud deck where the heat rises. Fifteen more JWST transits are coming.',
    run(api) { api.setScenario('e', 'eyeball'); api.viewDayside('e', 0.55); api.setSpeed(0.02); },
  },
  {
    title: 'f, g, h: the cold outer worlds',
    text: 'f gets 37 % of Earth\'s sunlight, g 25 %, h 14 %. Their densities leave room for a lot of water, which out here would most likely be ice. JWST has ruled out a hydrogen envelope on f; g and h are still unconstrained.',
    run(api) { api.viewDayside('g', 0.7); api.setSpeed(0.02); },
  },
  {
    title: 'A resonant chain',
    text: 'Neighbouring periods sit near 8:5, 5:3, 3:2, 3:2, 4:3, 3:2. Each spoke marks a conjunction — two neighbours lining up. Because of the resonances they keep happening at the same few places: three spokes for b–c, two for c–d, one for each of the others. Those places creep around together, all six pairs at once, once every ~491 days — the spokes turn with them. Below, the five three-body Laplace angles since 2015 swing within narrow bands instead of drifting: the chain is holding.',
    run(api) { api.setResonanceView(true); api.setSpeed(6); api.openObservatory('laplace'); },
  },
  {
    title: 'What JWST sees',
    text: 'From Earth the orbits are edge-on: every planet crosses the star. Each transit dims it by under 1 %. In the light curve below, the star\'s rotating spots and its flares move the brightness as much as the planets do — which is why separating star from planet takes so many visits.',
    run(api) { api.setEarthView(true); api.setSpeed(0.06); api.openObservatory('lc'); },
  },
  {
    title: 'Standing on e',
    text: 'The star hangs fixed in the sky, 2.2° across — four times the Sun\'s width from Earth — and never sets. Neighbouring planets cross the sky as discs, at closest approach about as large as our Moon. The Sun is a faint fifth-magnitude star in Leo. Drag to look around; scroll to zoom.',
    run(api) { api.setScenario('e', 'eyeball'); api.setSurface('e', 35); api.setSpeed(0.08); },
  },
  {
    title: 'What comes next',
    text: 'JWST will add transits of e timed back-to-back with b, so the star\'s variability can be subtracted. Beyond it, the Extremely Large Telescope and the Habitable Worlds Observatory. Until then: no TRAPPIST-1 planet has a confirmed atmosphere, and the habitable-zone worlds are still open questions.',
    run(api) { api.overview(); api.setSpeed(0.25); api.openObservatory('timeline'); },
  },
];

export function createTour({ api }) {
  const $ = (id) => document.getElementById(id);
  const card = $('tour');
  let index = -1;

  function show(i) {
    index = Math.max(0, Math.min(TOUR.length - 1, i));
    const stop = TOUR[index];
    api.reset();
    stop.run(api);
    card.hidden = false;
    $('tour-step').textContent = `${index + 1} / ${TOUR.length}`;
    $('tour-title').textContent = stop.title;
    $('tour-text').textContent = stop.text;
    $('tour-prev').disabled = index === 0;
    $('tour-next').textContent = index === TOUR.length - 1 ? 'Finish' : 'Next';
  }

  function close() {
    card.hidden = true;
    index = -1;
    api.reset();
  }

  $('tour-prev').addEventListener('click', () => show(index - 1));
  $('tour-next').addEventListener('click', () => (index === TOUR.length - 1 ? close() : show(index + 1)));
  $('tour-close').addEventListener('click', close);

  return {
    start: () => show(0),
    close,
    get active() { return index >= 0; },
    next: () => index >= 0 && index < TOUR.length - 1 && show(index + 1),
    prev: () => index > 0 && show(index - 1),
  };
}
