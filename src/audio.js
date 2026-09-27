const BPM = 72;
const BEAT = 60 / BPM;
const STEP = BEAT / 4;
const BAR = BEAT * 4;
const TAPE = 0.012; // resting delay of the tape line
const OPEN = 20000; // ambience low-pass outdoors

// [bass root, chord voicing] per bar, plus a pentatonic scale for melody and chimes. Each place has its own loops.
const SONGS = {
  roof: {
    day: {
      chords: [[36, [52, 55, 59, 62]], [45, [55, 59, 60, 64]], [38, [53, 57, 60, 64]], [43, [53, 57, 59, 64]]],
      scale: [60, 62, 64, 67, 69],
    },
    evening: {
      chords: [[41, [57, 60, 64, 67]], [40, [55, 59, 62, 66]], [38, [53, 57, 60, 64]], [37, [53, 56, 60, 67]]],
      scale: [65, 67, 69, 72, 74],
    },
    night: {
      chords: [[45, [55, 59, 60, 64]], [41, [52, 57, 59, 64]], [38, [53, 57, 60, 64]], [40, [56, 59, 62, 65]]],
      scale: [57, 60, 62, 64, 67],
    },
  },
  room: {
    day: {
      chords: [[39, [55, 58, 62, 65]], [36, [51, 55, 58, 62]], [44, [55, 58, 60, 63]], [46, [56, 60, 63, 67]]],
      scale: [63, 65, 67, 70, 72],
    },
    evening: {
      chords: [[46, [57, 60, 62, 65]], [45, [55, 60, 62, 64]], [43, [53, 57, 58, 62]], [36, [52, 57, 58, 62]]],
      scale: [62, 65, 67, 69, 72],
    },
    night: {
      chords: [[40, [54, 55, 59, 62]], [36, [54, 55, 59, 64]], [45, [52, 55, 59, 60]], [35, [54, 57, 59, 64]]],
      scale: [59, 62, 64, 66, 69],
    },
  },
};

export const CHANNELS = ['keys', 'bass', 'drums', 'weather', 'nature', 'vinyl'];
// Each weather sound keeps its own level; the weather channel plays whichever matches the scene. Snow falls quietly, so only the wind carries.
export const WEATHER_SOUNDS = { rain: 'rain', cloud: 'wind', sun: 'breeze', snow: 'wind' };
export const DEFAULT_LEVELS = { keys: 0.7, bass: 0.6, drums: 0.5, rain: 0.4, wind: 0.55, breeze: 0.3, nature: 0.35, vinyl: 0.35, master: 0.7 };
export const ROOM_LEVELS = { rain: 0.18, wind: 0.18, breeze: 0.18, nature: 0.15, vinyl: 0.17 };
// Per-channel trim so equal slider positions sound roughly equally loud.
const TRIM = { keys: 0.8, bass: 0.1, drums: 0.85, weather: 0.36, nature: 2.5, vinyl: 0.9 };

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

function makeBuffer(ctx, seconds, fill) {
  const b = ctx.createBuffer(2, Math.floor(seconds * ctx.sampleRate), ctx.sampleRate);
  for (let c = 0; c < 2; c++) fill(b.getChannelData(c), ctx.sampleRate);
  return b;
}

const white = (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; };

// Damped sine bursts written with wraparound so the loop seam is inaudible.
function bursts(d, sr, count, freq, decay, amp) {
  for (let n = 0; n < count; n++) {
    const at = (Math.random() * d.length) | 0, f = freq(), k = decay() * sr, a = amp() * (Math.random() < 0.5 ? -1 : 1);
    for (let i = 0; i < k * 5; i++) d[(at + i) % d.length] += a * Math.sin((6.283 * f * i) / sr) * Math.exp(-i / k);
  }
}

export class Engine {
  constructor(ctx, { place, weather, time, levels }) {
    this.ctx = ctx;
    this.noise = makeBuffer(ctx, 4, white);

    this.vol = new GainNode(ctx, { gain: 0 });
    this.fade = new GainNode(ctx, { gain: 0 });
    const comp = new DynamicsCompressorNode(ctx, { threshold: -12, knee: 12, ratio: 2.5, attack: 0.01, release: 0.25 });
    comp.connect(this.vol).connect(this.fade).connect(ctx.destination);

    this.ch = Object.fromEntries(CHANNELS.map((k) => [k, new GainNode(ctx, { gain: 0 })]));

    // Music runs through a slowly modulated delay (tape wow), a warm low-pass and soft saturation.
    // Growing the delay lowers pitch, which also drives the turntable stop and spin-up.
    const tape = (this.tape = new DelayNode(ctx, { maxDelayTime: 3, delayTime: TAPE }));
    this.lfo(0.45, 0.0016, tape.delayTime);
    this.lfo(5.3, 0.00006, tape.delayTime);
    const warm = (this.warm = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4200, Q: 0.4 }));
    const sat = new WaveShaperNode(ctx, { curve: Float32Array.from({ length: 2048 }, (_, i) => Math.tanh(1.4 * (i / 1023.5 - 1)) / Math.tanh(1.4)), oversample: '2x' });
    tape.connect(warm).connect(sat).connect(comp);

    const verb = new ConvolverNode(ctx, { buffer: this.impulse(2.8) });
    verb.connect(new GainNode(ctx, { gain: 0.9 })).connect(tape);
    const send = (from, amount) => from.connect(new GainNode(ctx, { gain: amount })).connect(verb);

    this.keysIn = new StereoPannerNode(ctx);
    this.lfo(2.2, 0.25, this.keysIn.pan);
    this.keysIn.connect(this.ch.keys);
    this.drumsIn = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 5500 });
    this.drumsIn.connect(this.ch.drums);
    for (const k of ['keys', 'bass', 'drums']) this.ch[k].connect(tape);
    send(this.ch.keys, 0.3);
    send(this.ch.drums, 0.08);
    this.ch.vinyl.connect(tape);
    // Indoors the window muffles the outside.
    this.walls = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: OPEN, Q: 0.5 });
    this.walls.connect(comp);
    for (const k of ['weather', 'nature']) this.ch[k].connect(this.walls);
    send(this.ch.nature, 0.25);

    this.vinyl().connect(this.ch.vinyl);
    this.crickets = [0, 1, 2].map(() => ({ f: rand(4100, 5200), pan: rand(-0.8, 0.8) }));

    this.next = this.nextNature = ctx.currentTime + 0.1;
    this.i = 0;
    this.mi = 4;
    this.ch.weather.gain.value = TRIM.weather;
    this.levels = { ...levels };
    this.setScene(weather, time, place, true);
    for (const [k, v] of Object.entries(levels)) this.setLevel(k, v);
  }

  lfo(freq, depth, param) {
    const o = new OscillatorNode(this.ctx, { frequency: freq });
    o.connect(new GainNode(this.ctx, { gain: depth })).connect(param);
    o.start();
    this.sources?.push(o);
  }

  loop(buffer = this.noise) {
    const s = new AudioBufferSourceNode(this.ctx, { buffer, loop: true });
    s.start(0, rand(0, buffer.duration));
    this.sources?.push(s);
    return s;
  }

  impulse(seconds) {
    return makeBuffer(this.ctx, seconds, (d) => {
      let y = 0;
      for (let i = 0; i < d.length; i++) {
        y += (Math.random() * 2 - 1 - y) * 0.35;
        d[i] = y * (1 - i / d.length) ** 3.2;
      }
    });
  }

  chain(src, ...nodes) {
    nodes.reduce((a, b) => a.connect(b), src);
    return nodes[nodes.length - 1];
  }

  rain() {
    const ctx = this.ctx, out = new GainNode(ctx, { gain: 0 });
    const patter = makeBuffer(ctx, 8, (d, sr) => bursts(d, sr, 8 * 55, () => rand(1300, 5200), () => rand(0.0008, 0.0025), () => rand(0.02, 0.25) ** 1.5));
    this.chain(this.loop(), new BiquadFilterNode(ctx, { type: 'highpass', frequency: 450 }), new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4000 }), new GainNode(ctx, { gain: 0.3 })).connect(out);
    this.chain(this.loop(patter), new GainNode(ctx, { gain: 0.9 })).connect(out);
    this.chain(this.loop(), new BiquadFilterNode(ctx, { type: 'highpass', frequency: 90 }), new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420 }), new GainNode(ctx, { gain: 0.3 })).connect(out);
    return out;
  }

  // Band-passed noise with slowly wandering pitch and gusts; low for wind, high for leaf rustle.
  wind(freq, q, level) {
    const ctx = this.ctx, out = new GainNode(ctx, { gain: 0 });
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: freq, Q: q });
    const gust = new GainNode(ctx, { gain: level });
    this.lfo(0.061, freq * 0.45, bp.frequency);
    this.lfo(0.093, level * 0.6, gust.gain);
    this.chain(this.loop(), bp, gust).connect(out);
    return out;
  }

  // One weather's sound, carrying the sources that feed it so they can be stopped once it has faded out.
  weatherSound(weather) {
    this.sources = [];
    const out = weather === 'rain' ? this.rain() : weather === 'sun' ? this.wind(2400, 0.5, 0.28) : this.wind(420, 0.8, 0.9);
    out.sources = this.sources;
    this.sources = null;
    out.connect(this.ch.weather);
    return out;
  }

  vinyl() {
    const ctx = this.ctx, out = new GainNode(ctx);
    const crackle = makeBuffer(ctx, 9, (d, sr) => {
      bursts(d, sr, 9 * 28, () => rand(2500, 7000), () => rand(0.00008, 0.0003), () => Math.random() ** 3 * 0.8);
      bursts(d, sr, 9 * 0.5, () => rand(300, 900), () => rand(0.001, 0.003), () => rand(0.2, 0.45));
    });
    this.chain(this.loop(crackle), new BiquadFilterNode(ctx, { type: 'highpass', frequency: 700 }), new GainNode(ctx, { gain: 0.9 })).connect(out);
    this.chain(this.loop(), new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 5000, Q: 0.4 }), new GainNode(ctx, { gain: 0.035 })).connect(out);
    return out;
  }

  setLevel(name, v, tau = 0.06) {
    this.levels[name] = v;
    if (Object.values(WEATHER_SOUNDS).includes(name)) return this.mixWeather(tau);
    const g = name === 'master' ? this.vol : this.ch[name];
    if (g) g.gain.setTargetAtTime(v * v * (TRIM[name] ?? 1), this.ctx.currentTime, tau);
  }

  mixWeather(tau) {
    this.sound.gain.setTargetAtTime((this.levels[WEATHER_SOUNDS[this.weather]] ?? 0) ** 2, this.ctx.currentTime, tau);
  }

  setScene(weather, time, place, instant) {
    const now = this.ctx.currentTime, tau = instant ? 0.01 : 1.2;
    // Only the current weather's sound runs: the one it replaces fades out, then stops.
    if (weather !== this.weather) {
      if (this.sound) {
        this.sound.gain.setTargetAtTime(0, now, tau);
        for (const s of this.sound.sources) s.stop(now + 8 * tau);
      }
      this.sound = this.weatherSound(weather);
    }
    this.weather = weather;
    this.mixWeather(tau);
    this.walls.frequency.setTargetAtTime(place === 'room' ? 3500 : OPEN, now, instant ? 0.01 : 0.6);
    // Snow deadens sound, so the music darkens with it.
    this.warm.frequency.setTargetAtTime(weather === 'snow' ? 2800 : 4200, now, tau);
    this.time = time;
    this.place = place;
    if (instant) this.song = SONGS[place][time];
  }

  fadeTo(v, seconds) {
    const g = this.fade.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(v, now + seconds);
  }

  // Turntable brake: the record (music, crackle, reverb) slows toward a stop as everything fades out.
  stop(seconds = 0.8) {
    this.bend(seconds, (x) => 0.75 * seconds * x * x / 2);
    this.fadeTo(0, seconds);
    return seconds;
  }

  // Spin-up: pitch climbs from a slow crawl back to speed while the sound returns.
  start(seconds = 0.5) {
    this.bend(seconds, (x) => 0.8 * seconds * (x - x * x / 2));
    this.fadeTo(1, 0.35);
  }

  // Once silent, return the tape line to its resting delay so latency never accumulates.
  settle() {
    this.tape.delayTime.cancelScheduledValues(0);
    this.tape.delayTime.setValueAtTime(TAPE, this.ctx.currentTime);
    this.curve = null;
  }

  delayAt(t) {
    const c = this.curve;
    return c ? c.d + c.f(Math.min(1, (t - c.at) / c.seconds)) : TAPE;
  }

  // Pitch follows 1 - d'(t), so f(x) is the extra delay at progress x (0..1).
  bend(seconds, f) {
    const at = this.ctx.currentTime, d = this.delayAt(at), p = this.tape.delayTime;
    if (d > 2) return;
    p.cancelScheduledValues(0);
    p.setValueCurveAtTime(Float32Array.from({ length: 64 }, (_, i) => d + f(i / 63)), at, seconds);
    this.curve = { at, seconds, d, f };
  }

  tick(until) {
    while (this.next < until) this.step(this.next, this.i++), (this.next += STEP);
    while (this.nextNature < until) this.nature(this.nextNature);
  }

  step(t, i) {
    const s = i % 16, bar = Math.floor(i / 16), r = Math.random();
    // Songs and arrangements change on the bar line.
    if (s === 0) (this.song = SONGS[this.place][this.time]), (this.hush = this.weather === 'snow');
    const [root, chord] = this.song.chords[bar % 4];
    const at = t + (s % 2 ? STEP * 0.28 : 0) + rand(-0.004, 0.004);
    // Two-bar intro, then a two-bar drum break at the end of every sixteen bars.
    const drums = bar >= 2 && bar % 16 < 14;
    if (this.hush) return this.hushed(at, s, bar, r, root, chord, drums);

    if (s === 0) chord.forEach((m, k) => this.epiano(at + k * 0.014, m, rand(0.2, 0.26), BAR * 0.95));
    if (s === 10 && r < 0.35) chord.slice(1).forEach((m, k) => this.epiano(at + k * 0.012, m, 0.12, BEAT * 1.2));

    if (s === 0) this.bass(at, root, 0.8, BEAT * 1.6);
    if (s === 10 && r < 0.6) this.bass(at, root + (Math.random() < 0.3 ? 7 : 0), 0.6, BEAT * 0.9);

    if (drums) {
      if (s === 0 || s === 10 || (s === 7 && r < 0.25) || (s === 3 && r < 0.12)) this.kick(at, s === 0 ? 0.9 : 0.7);
      if (s === 4 || s === 12) this.snare(at + 0.012, rand(0.45, 0.55));
      if (s === 15 && r < 0.15) this.snare(at, 0.12);
      if (s % 2 === 0) this.hat(at, s % 4 ? 0.14 : 0.22, s === 14 && r < 0.1);
      else if (r < 0.18) this.hat(at, 0.07);
    }

    if (s % 2 === 0) this.melody(at, s, bar);
  }

  // Snow keeps the scene's chords and hushes the playing: chords struck softly and slowly rolled, one long bass note a bar, a soft kick and the odd brush, and a melody that moves by step and leaves room between notes.
  hushed(at, s, bar, r, root, chord, drums) {
    if (s === 0) {
      chord.forEach((m, k) => this.epiano(at + k * 0.07, m, rand(0.12, 0.15), BAR));
      this.bass(at, root, 0.45, BAR * 0.9);
      this.phrase = Math.random() < (bar % 4 < 2 ? 0.6 : 0.1);
    }
    if (drums) {
      if (s === 0 || (s === 10 && r < 0.25)) this.kick(at, s ? 0.25 : 0.4);
      if (s === 8 && bar % 2) this.brush(at, rand(0.1, 0.14));
      if (s === 4 || s === 12) this.hit(at, 0.05, 0.06, { type: 'bandpass', frequency: 4000, Q: 0.7 });
    }
    if (s % 4 === 0 && this.phrase && r < 0.35) this.lead(at, [-1, -1, 0, 1, 1], rand(0.08, 0.11), [4, 6, 8]);
  }

  melody(t, s, bar) {
    if (s === 0) this.phrase = Math.random() < (bar % 4 < 2 ? 0.75 : 0.2);
    if (this.phrase && Math.random() < (s % 4 ? 0.22 : 0.42)) this.lead(t, [-2, -1, -1, 0, 1, 1, 2], rand(0.1, 0.16), [2, 3, 4]);
  }

  // The melody wanders the scale by one of the given moves.
  lead(t, moves, vel, steps) {
    const sc = this.song.scale;
    this.mi = Math.min(9, Math.max(0, this.mi + pick(moves)));
    this.epiano(t, sc[this.mi % 5] + 12 * Math.floor(this.mi / 5), vel, STEP * pick(steps));
  }

  // Two-operator FM electric piano.
  epiano(t, midi, vel, dur) {
    const ctx = this.ctx, f = mtof(midi);
    const car = new OscillatorNode(ctx, { frequency: f, detune: rand(-4, 4) });
    const mod = new OscillatorNode(ctx, { frequency: f });
    const idx = new GainNode(ctx, { gain: 0 });
    idx.gain.setValueAtTime(f * (0.8 + vel * 2), t);
    idx.gain.exponentialRampToValueAtTime(f * 0.08, t + 1.2);
    mod.connect(idx).connect(car.frequency);
    const amp = new GainNode(ctx, { gain: 0 });
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + 0.008);
    amp.gain.setTargetAtTime(vel * 0.35, t + 0.01, 0.35);
    amp.gain.setTargetAtTime(0, t + dur, 0.25);
    car.connect(amp).connect(this.keysIn);
    car.start(t), mod.start(t), car.stop(t + dur + 1.5), mod.stop(t + dur + 1.5);
  }

  bass(t, midi, vel, dur) {
    const ctx = this.ctx, f = mtof(midi);
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 380 });
    const amp = new GainNode(ctx, { gain: 0 });
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + 0.012);
    amp.gain.setTargetAtTime(vel * 0.6, t + 0.02, 0.3);
    amp.gain.setTargetAtTime(0, t + dur, 0.06);
    lp.connect(amp).connect(this.ch.bass);
    for (const type of ['triangle', 'sine']) {
      const o = new OscillatorNode(ctx, { type, frequency: f });
      o.connect(lp);
      o.start(t), o.stop(t + dur + 0.5);
    }
  }

  kick(t, v) {
    const ctx = this.ctx, o = new OscillatorNode(ctx, { frequency: 120 }), g = new GainNode(ctx, { gain: v });
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g).connect(this.drumsIn);
    o.start(t), o.stop(t + 0.5);
  }

  hit(t, v, decay, filter) {
    const ctx = this.ctx, s = new AudioBufferSourceNode(ctx, { buffer: this.noise }), g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    s.connect(new BiquadFilterNode(ctx, filter)).connect(g).connect(this.drumsIn);
    s.start(t, rand(0, 3)), s.stop(t + decay + 0.05);
  }

  snare(t, v) {
    this.hit(t, v, 0.2, { type: 'bandpass', frequency: 1800, Q: 0.8 });
    const ctx = this.ctx, o = new OscillatorNode(ctx, { type: 'triangle', frequency: 190 }), g = new GainNode(ctx, { gain: v * 0.5 });
    g.gain.setValueAtTime(v * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(this.drumsIn);
    o.start(t), o.stop(t + 0.12);
  }

  // A brush swept across the snare: noise that swells and fades instead of striking.
  brush(t, v) {
    const ctx = this.ctx, s = new AudioBufferSourceNode(ctx, { buffer: this.noise }), g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.03);
    g.gain.setTargetAtTime(0, t + 0.03, 0.06);
    s.connect(new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2400, Q: 0.6 })).connect(g).connect(this.drumsIn);
    s.start(t, rand(0, 3)), s.stop(t + 0.5);
  }

  hat(t, v, open) {
    this.hit(t, v, open ? 0.3 : 0.045, { type: 'highpass', frequency: 7000 });
  }

  // Birds stay quiet in the rain; wind chimes take their place. Crickets thin out when it rains, and in the snow only the chimes are left.
  nature(t) {
    const wet = this.weather === 'rain', snow = this.weather === 'snow';
    if (this.time === 'night' && !snow) this.cricket(t), (this.nextNature = t + (wet ? rand(1.8, 4.5) : rand(0.8, 2.2)));
    else if (wet || snow) this.chime(t), (this.nextNature = t + rand(3, 8));
    else if (this.time === 'day') this.bird(t), (this.nextNature = t + rand(1.2, 4.5));
    else (Math.random() < 0.7 ? this.chime(t) : this.bird(t)), (this.nextNature = t + rand(2, 6));
  }

  voice(t, pan, freq) {
    const ctx = this.ctx, o = new OscillatorNode(ctx, { frequency: freq }), g = new GainNode(ctx, { gain: 0 });
    o.connect(g).connect(new StereoPannerNode(ctx, { pan })).connect(this.ch.nature);
    o.start(t);
    return [o, g.gain];
  }

  bird(t) {
    const [o, g] = this.voice(t, rand(-0.7, 0.7), 3000), v = rand(0.05, 0.12), kind = pick(['tweet', 'tweet', 'whistle', 'trill']);
    let at = t;
    if (kind === 'tweet') {
      const f = rand(2600, 4000);
      for (let n = 2 + ((Math.random() * 4) | 0); n > 0; n--, at += rand(0.09, 0.14)) {
        o.frequency.setValueAtTime(f, at);
        o.frequency.exponentialRampToValueAtTime(f * rand(1.2, 1.45), at + 0.05);
        g.setValueAtTime(0, at), g.linearRampToValueAtTime(v, at + 0.01), g.linearRampToValueAtTime(0, at + 0.055);
      }
    } else if (kind === 'whistle') {
      const f = rand(2400, 3200);
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * 0.72, at + 0.32);
      g.setValueAtTime(0, at), g.linearRampToValueAtTime(v, at + 0.04), g.linearRampToValueAtTime(0, at + 0.34);
      at += 0.4;
    } else {
      let f = rand(4200, 5200);
      for (let n = 8 + ((Math.random() * 7) | 0); n > 0; n--, at += 0.04, f *= 0.99) {
        o.frequency.setValueAtTime(f, at);
        g.setValueAtTime(0, at), g.linearRampToValueAtTime(v * 0.7, at + 0.008), g.linearRampToValueAtTime(0, at + 0.025);
      }
    }
    o.stop(at + 0.1);
  }

  chime(t) {
    const f = mtof(pick(this.song.scale) + 24), v = rand(0.03, 0.06), pan = rand(-0.5, 0.5);
    [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([ratio, a]) => {
      const [o, g] = this.voice(t, pan, f * ratio);
      g.setValueAtTime(0, t), g.linearRampToValueAtTime(v * a, t + 0.003), g.setTargetAtTime(0, t + 0.003, 1.1 / ratio);
      o.stop(t + 6);
    });
  }

  cricket(t) {
    const c = pick(this.crickets), v = rand(0.04, 0.075), [o, g] = this.voice(t, c.pan, c.f);
    const pulses = 3 + (Math.random() < 0.5);
    for (let k = 0; k < pulses; k++) {
      const at = t + k * 0.045;
      g.setValueAtTime(0, at), g.linearRampToValueAtTime(v, at + 0.006), g.linearRampToValueAtTime(0, at + 0.022);
    }
    o.stop(t + pulses * 0.045 + 0.05);
  }
}
