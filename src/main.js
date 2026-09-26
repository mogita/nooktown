import { Engine, DEFAULT_LEVELS, WEATHER_SOUNDS } from './audio.js';
import { Scene, effects, favicon } from './scene.js';

const WEATHERS = ['rain', 'cloud', 'sun'];
const TIMES = ['day', 'evening', 'night'];
const natureSound = () => (state.time === 'night' ? 'Crickets' : state.weather === 'rain' || state.time === 'evening' ? 'Chimes' : 'Birds');
const FADERS = [
  ['music', 'keys', 'Keys'], ['music', 'bass', 'Bass'], ['music', 'drums', 'Drums'],
  ['ambience', 'weather'], ['ambience', 'nature'], ['ambience', 'vinyl', 'Vinyl'],
  ['master', 'master', 'Master'],
];
const CAT_AT = [124, 105];
const LEDGE = [101, 7];
const IDLE_MS = 3500;

const $ = (s) => document.querySelector(s);
const body = document.body, ui = $('#ui'), mixer = $('#mixer'), mixBtn = $('#mix'), caption = $('#caption'), canvas = $('#scene');

const hour = new Date().getHours();
const custom = {};
const state = { weather: 'rain', time: hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'evening' : 'night', levels: { ...DEFAULT_LEVELS } };
try {
  const saved = JSON.parse(localStorage.getItem('nook:v3'));
  if (WEATHERS.includes(saved?.weather)) state.weather = saved.weather;
  if (TIMES.includes(saved?.time)) state.time = saved.time;
  for (const k in state.levels) if (Number.isFinite(saved?.levels?.[k])) custom[k] = state.levels[k] = Math.min(1, Math.max(0, saved.levels[k]));
} catch {}
// Only sliders the listener moved are stored, so untouched ones follow future default changes.
const save = () => { try { localStorage.setItem('nook:v3', JSON.stringify({ weather: state.weather, time: state.time, levels: custom })); } catch {} };

const sceneKey = () => `${state.weather}-${state.time}`;
const sceneName = () => `${{ rain: 'Rainy', cloud: 'Cloudy', sun: state.time === 'day' ? 'Sunny' : 'Clear' }[state.weather]} ${state.time}`;

// Scene: the CSS background shows the art instantly and stays as a fallback if WebGL2 is unavailable.
let scene;
const loads = {};
const icons = {};
function showScene(instant) {
  const key = sceneKey();
  $('#icon').href = icons[state.time] ??= favicon(state.time);
  body.style.backgroundImage = `url(assets/${key}.png)`;
  loads[key]?.then(() => {
    if (key !== sceneKey()) return;
    scene.set(key, instant);
    // Match the browser chrome (status bar, notch) to the top of the sky.
    $('#theme').content = document.documentElement.style.backgroundColor = scene.scenes[key].top;
  });
}
try {
  scene = new Scene(canvas, { cat: CAT_AT, ledge: LEDGE });
  const first = sceneKey();
  const keys = [first, ...WEATHERS.flatMap((w) => TIMES.map((t) => `${w}-${t}`)).filter((k) => k !== first)];
  for (const key of keys) {
    const [w, t] = key.split('-');
    loads[key] = (loads[keys[0]] ?? Promise.resolve()).then(() => scene.load(key, `assets/${key}.png`, effects(w, t)));
  }
  loads[first].then(() => {
    showScene(true);
    canvas.classList.add('ready');
    const loop = () => (scene.frame(), requestAnimationFrame(loop));
    loop();
  });
} catch (e) {
  console.warn(e);
}
showScene(true);

// Audio starts on the first tap because browsers only allow sound after a user gesture.
let ctx, engine, playing = false;
function play() {
  const first = !ctx;
  if (first) {
    if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
    ctx = new AudioContext({ latencyHint: 'playback' });
    engine = new Engine(ctx, state);
    // Long lookahead so throttled background-tab timers never starve the schedule.
    const tick = () => engine.tick(ctx.currentTime + 1.5);
    tick();
    setInterval(tick, 200);
  }
  playing = true;
  body.classList.remove('paused');
  $('#toggle').setAttribute('aria-label', 'Pause');
  ctx.resume();
  if (first) engine.fadeTo(1, 1.5);
  else engine.start();
}
function pause() {
  playing = false;
  body.classList.add('paused');
  $('#toggle').setAttribute('aria-label', 'Play');
  const seconds = engine.stop();
  setTimeout(() => playing || (engine.settle(), ctx.suspend()), seconds * 1000 + 150);
}
const toggle = () => (playing ? pause() : play());

function flashCaption() {
  caption.textContent = sceneName();
  caption.classList.add('show');
  clearTimeout(flashCaption.t);
  flashCaption.t = setTimeout(() => caption.classList.remove('show'), 2600);
}

// Controls
const faders = FADERS.map(([group, name, label]) => {
  const el = document.createElement('div');
  el.className = 'fader';
  el.innerHTML = '<div class="track" role="slider" tabindex="0" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100"></div><span class="label"></span>';
  const track = el.firstElementChild, text = el.lastElementChild;
  // The weather fader drives whichever weather sound is playing, so its value follows the scene.
  const key = () => (name === 'weather' ? WEATHER_SOUNDS[state.weather] : name);
  const f = { label: () => label ?? (name === 'weather' ? key()[0].toUpperCase() + key().slice(1) : natureSound()) };
  f.render = () => {
    const v = state.levels[key()], pct = Math.round(v * 100), l = f.label();
    track.style.setProperty('--v', v);
    track.setAttribute('aria-valuenow', pct);
    track.setAttribute('aria-valuetext', `${pct}%`);
    track.setAttribute('aria-label', l);
    text.textContent = el.classList.contains('active') ? pct : l;
  };
  const set = (v) => {
    custom[key()] = state.levels[key()] = Math.min(1, Math.max(0, v));
    engine?.setLevel(key(), state.levels[key()]);
    f.render();
  };
  // Mouse jumps to the pointer; touch drags relative to where the finger lands, like a phone's control centre.
  let from;
  const at = (e) => {
    const r = track.getBoundingClientRect();
    return e.pointerType === 'mouse' ? 1 - (e.clientY - r.top) / r.height : from.v + (from.y - e.clientY) / r.height;
  };
  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture(e.pointerId);
    from = { y: e.clientY, v: state.levels[key()] };
    el.classList.add('active');
    set(at(e));
  });
  track.addEventListener('pointermove', (e) => track.hasPointerCapture(e.pointerId) && set(at(e)));
  track.addEventListener('lostpointercapture', () => {
    el.classList.remove('active');
    f.render();
    save();
  });
  track.addEventListener('keydown', (e) => {
    const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2, Home: -1, End: 1 }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    set(state.levels[key()] + d);
    save();
  });
  $(`.faders[data-group="${group}"]`).append(el);
  return f;
});

const segs = [...document.querySelectorAll('.seg')];
function render() {
  for (const seg of segs) {
    const key = seg.dataset.key, list = key === 'weather' ? WEATHERS : TIMES;
    seg.style.setProperty('--i', list.indexOf(state[key]));
    for (const b of seg.querySelectorAll('button')) {
      const on = b.dataset.value === state[key];
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
    }
  }
  const sun = $('[data-value="sun"]'), sunName = state.time === 'day' ? 'Sunny' : 'Clear';
  sun.title = sunName;
  sun.setAttribute('aria-label', sunName);
  faders.forEach((f) => f.render());
}

function choose(key, value) {
  if (state[key] === value) return;
  state[key] = value;
  save();
  render();
  showScene();
  engine?.setScene(state.weather, state.time);
  flashCaption();
}

for (const seg of segs) {
  const key = seg.dataset.key, list = key === 'weather' ? WEATHERS : TIMES;
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) choose(key, b.dataset.value);
  });
  seg.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    choose(key, list[(list.indexOf(state[key]) + d + list.length) % list.length]);
    seg.querySelector('[aria-checked="true"]').focus();
  });
}

function setMixer(open) {
  mixer.classList.toggle('open', open);
  mixer.inert = !open;
  mixBtn.setAttribute('aria-expanded', open);
  place();
  wake();
}
const mixerOpen = () => mixer.classList.contains('open');
// Put the mixer beside the toolbar when there is room.
function place() {
  const x = $('.dock').getBoundingClientRect().right + 12;
  body.classList.toggle('side', innerWidth > 720 && x + mixer.offsetWidth + 16 <= innerWidth);
  mixer.style.setProperty('--x', `${x}px`);
}
addEventListener('resize', place);
mixBtn.addEventListener('click', () => setMixer(!mixerOpen()));
$('#toggle').addEventListener('click', toggle);

// The interface fades away when idle so the scene is all that remains.
let idle, pointer = 'mouse';
addEventListener('pointerdown', (e) => (pointer = e.pointerType), true);
function sleep() {
  const focused = ui.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
  // Touch browsers leave a sticky :hover on the last tapped button, so hover only counts for a mouse.
  const hovered = pointer === 'mouse' && ui.querySelector(':hover');
  if (!mixerOpen() && !hovered && !focused) body.classList.add('idle');
}
function wake() {
  if (!body.classList.contains('started')) return;
  body.classList.remove('idle');
  clearTimeout(idle);
  idle = setTimeout(sleep, IDLE_MS);
}
addEventListener('pointermove', (e) => e.pointerType === 'mouse' && wake());
ui.addEventListener('pointerdown', wake);
canvas.addEventListener('click', () => (mixerOpen() ? setMixer(false) : body.classList.contains('idle') ? wake() : (clearTimeout(idle), body.classList.add('idle'))));
addEventListener('keydown', (e) => {
  if (!body.classList.contains('started')) return;
  wake();
  if (e.key === 'Escape' && mixerOpen()) setMixer(false), mixBtn.focus();
  if (e.code === 'Space' && !e.target.closest('button, [role="slider"]')) e.preventDefault(), toggle();
});

$('#start').addEventListener('click', () => {
  play();
  body.classList.add('started');
  ui.inert = false;
  setTimeout(() => ($('#start').hidden = true), 800);
  setTimeout(flashCaption, 600);
  wake();
}, { once: true });

render();
place();

// Installed app: network first, cache only as an offline fallback. Skipped in dev so it never caches dev modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
