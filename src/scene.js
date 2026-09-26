const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0., 1.); }`;

// Pass 1 runs at the art's native resolution so every effect lands on the pixel grid.
const COMPOSE = `#version 300 es
precision highp float;
uniform sampler2D uA, uB, uCat, uGA, uGB;
uniform vec2 uArt;
uniform float uT, uMix;
uniform vec4 uFxA, uFxB; // rain, glow, fireflies, cloud shadows
uniform vec3 uTintA, uTintB;
uniform vec4 uCatRect;
uniform vec2 uLedge; // top row and depth of the ledge surface, for splashes
uniform float uK; // art pixels per base-grid pixel, so effects keep their size at any art resolution
out vec4 o;

float h1(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bayer(vec2 p) {
  const float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  ivec2 i = ivec2(mod(p, 4.));
  return (m[i.x + i.y * 4] + .5) / 16.;
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + 1.), f.x), f.y);
}
float fbm(vec2 p) { return .55 * noise(p) + .3 * noise(p * 2.1 + 7.) + .15 * noise(p * 4.3 + 13.); }

vec3 look(sampler2D s, sampler2D g, vec2 p, vec4 fx) {
  vec2 uv = (p + .5) / uArt;
  float y = p.y / uArt.y;
  vec3 c = texture(s, uv).rgb;
  vec3 mid = textureLod(s, uv, 2.5 + log2(uK)).rgb;
  c += texture(g, uv).rgb * vec3(1., .85, .65) * 1.6 * fx.y * (.9 + .1 * sin(uT * 1.1 + p.x * .03));
  // Stars twinkle on the darkest skies only; warm points (moon, windows) hold steady.
  float star = smoothstep(.12, .3, dot(c - mid, vec3(.3, .59, .11))) * (1. - smoothstep(.2, .35, y)) * step(c.r, c.b + .02);
  c *= 1. + star * smoothstep(.8, 1., fx.y) * .5 * sin(uT * (1.5 + 2. * h2(p)) + h2(p + 3.) * 40.);
  float n = fbm(p / (vec2(70., 34.) * uK) + vec2(uT * .018, uT * .004));
  c *= 1. - step(.5, n + (bayer(p) - .5) * .05) * .14 * fx.w * smoothstep(.2, .38, y);
  return c;
}

float rain(vec2 p, float speed, float len, float dens, float seed) {
  float col = p.x - floor(p.y / 4.);
  float r = h1(col * 1.37 + seed);
  if (r > dens) return 0.;
  float d = mod(uT * speed * (.85 + .3 * h1(col + seed * 3.)) + r * 997. - p.y, uArt.y * 1.3);
  return d < len ? 1. - d / len : 0.;
}

float fireflies(vec2 p) {
  float f = 0.;
  for (int i = 0; i < 16; i++) {
    float k = float(i);
    vec2 at = vec2((.1 + .8 * h1(k)) * uArt.x, uArt.y * (.5 + .42 * h1(k + 3.)));
    at += vec2(sin(uT * .21 + k * 1.7) * 16., sin(uT * .33 + k * 2.3) * 6.) * uK;
    vec2 d = floor((p - floor(at)) / uK);
    float r2 = dot(d, d);
    f += pow(.5 + .5 * sin(uT * (.7 + .8 * h1(k + 9.)) + k * 4.), 2.) * (r2 < .5 ? 1. : r2 < 1.5 ? .35 : 0.);
  }
  return f;
}

// Rare tiny splashes on the ledge top: a dot, then a two-pixel crown, then a faint wider crown.
float splash(vec2 p) {
  float a = 0.;
  for (int i = 0; i < 4; i++) {
    float k = float(i), per = 2.6 + 1.4 * h1(k + 20.), t = (uT + k * 1.7) / per, n = floor(t), s = fract(t) * per / .36;
    if (s >= 1.) continue;
    vec2 d = p - floor(vec2(h1(n * 3.1 + k) * uArt.x, uLedge.x + h1(n * 7.3 + k) * uLedge.y));
    a += s < .3 ? (d == vec2(0) ? .45 : 0.) : s < .65 ? (abs(d.x) == 1. && d.y == -1. ? .35 : 0.) : (abs(d.x) == 2. && d.y == -1. ? .18 : 0.);
  }
  return a;
}

void main() {
  vec2 p = vec2(floor(gl_FragCoord.x), uArt.y - 1. - floor(gl_FragCoord.y));
  // A narrow dithered band sweeps down from the sky.
  float th = .22 * bayer(p) + .64 * (p.y / uArt.y) + .14 * h2(floor(p / (3. * uK)));
  float m = smoothstep(th - .05, th + .05, uMix * 1.1 - .05);
  float e = smoothstep(0., 1., uMix);
  vec4 fx = mix(uFxA, uFxB, e);
  vec3 c = mix(look(uA, uGA, p, uFxA), look(uB, uGB, p, uFxB), m);
  vec2 q = p - uCatRect.xy;
  if (all(greaterThanEqual(q, vec2(0))) && all(lessThan(q, uCatRect.zw))) {
    vec4 cat = texelFetch(uCat, ivec2(q), 0);
    c = mix(c, cat.rgb, cat.a);
  }
  c += vec3(1., .86, .45) * fireflies(p) * fx.z * .8;
  float rn = .3 * rain(p, 260. * uK, 13. * uK, .07 / uK, 1.) + .18 * rain(p, 190. * uK, 9. * uK, .14 / uK, 2.) + .1 * rain(p, 140. * uK, 6. * uK, .22 / uK, 3.) + splash(p);
  c = mix(c, mix(mix(uTintA, uTintB, e), vec3(1.), .4), clamp(rn * fx.x, 0., 1.));
  o = vec4(c, 1.);
}`;

// Pass 2 covers the viewport with crisp pixels: nearest inside a texel, one screen pixel of blend at its edges.
const PRESENT = `#version 300 es
precision highp float;
uniform sampler2D uFrame;
uniform vec2 uArt, uRes, uOff;
uniform float uScale;
out vec4 o;
void main() {
  vec2 t = uOff + vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  vec2 f = fract(t) - .5, r = vec2(.5 - .5 / uScale);
  t = floor(t) + (f - clamp(f, -r, r)) * uScale + .5;
  vec3 c = texture(uFrame, vec2(t.x / uArt.x, 1. - t.y / uArt.y)).rgb;
  vec2 v = gl_FragCoord.xy / uRes - .5;
  o = vec4(c * (1. - dot(v, v) * .45), 1.);
}`;

// Original cat, seen from behind, sitting on the ledge. The tail is drawn procedurally.
const CAT = [
  '....#.......#....',
  '....##.....##....',
  '...####...####...',
  '...###########...',
  '..#############..',
  '..#############..',
  '..#############..',
  '...###########...',
  '....#########....',
  '.....#######.....',
  '....#########....',
  '....#########....',
  '....#########....',
  '...###########...',
  '...###########...',
  '...###########...',
  '.###############.',
  '#################',
  '#################',
  '#################',
  '.###############.',
];
const CAT_W = 30, CAT_H = CAT.length + 1;

const DUR = 2.4;

// One horizontal or vertical box-blur pass over RGBA floats; alternating passes approximate a Gaussian.
function blur(src, w, h, vertical, r) {
  const out = new Float32Array(src.length), step = vertical ? w * 4 : 4, n = vertical ? h : w;
  for (let i = 0; i < src.length; i += 4) {
    const at = vertical ? ((i / 4 / w) | 0) : (i / 4) % w;
    for (let o = -r; o <= r; o++) {
      if (at + o < 0 || at + o >= n) continue;
      for (let j = 0; j < 3; j++) out[i + j] += src[i + j + o * step] / (2 * r + 1);
    }
  }
  return out;
}

// Scale2x (EPX): doubles a pixel set while rounding its stair steps, so the cat matches finer art.
function scale2x(on) {
  const has = (x, y) => on.has(`${x},${y}`), out = new Set();
  const pts = [...on].map((k) => k.split(',').map(Number));
  const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
  for (let y = Math.min(...ys) - 1; y <= Math.max(...ys) + 1; y++)
    for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x++) {
      const P = has(x, y), A = has(x, y - 1), B = has(x + 1, y), C = has(x - 1, y), D = has(x, y + 1);
      const q = [C === A && C !== D && A !== B ? A : P, A === B && A !== C && B !== D ? B : P, D === C && D !== B && C !== A ? C : P, B === D && B !== A && D !== C ? D : P];
      q.forEach((v, i) => v && out.add(`${2 * x + (i & 1)},${2 * y + (i >> 1)}`));
    }
  return out;
}
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

const css = (c) => `rgb(${c.map((v) => (v * 255) | 0)})`;

function catPixels(t, twitch) {
  const on = new Set();
  const put = (x, y) => on.add(`${x},${y}`);
  CAT.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && !(twitch && y === 0 && x === 5) && put(x, y + 1)));
  // Tail rests along the ledge; only the tip curls and flicks.
  let x = 15, y = CAT.length + 0.5, a = 0;
  const lift = 0.5 + 0.5 * Math.sin(t * 0.9);
  for (let k = 0; k < 11; k++) {
    if (k >= 5) a += -0.3 - 0.25 * lift + 0.08 * Math.sin(t * 2.1 - k);
    x += Math.cos(a), y += Math.sin(a);
    const w = k < 6 ? 2 : 1;
    for (let i = 0; i < w; i++) for (let j = 0; j < w; j++) put(Math.floor(x) + i, Math.floor(y) - j);
  }
  return on;
}

// Top-lit silhouette: pixels with nothing above them catch the sky light.
function paintCat(g, on, body, rim, ox = 0, oy = 0) {
  for (const key of on) {
    const [x, y] = key.split(',').map(Number);
    g.fillStyle = on.has(`${x},${y - 1}`) ? body : rim;
    g.fillRect(ox + x, oy + y, 1, 1);
  }
}

// 32x32 pixel-art tab icon: the cat on the ledge under a day, evening or night sky.
const ICON = {
  day: { sky: ['#7fb6dc', '#9cc8e6', '#bcdced', '#d9ebee'], ledge: ['#c9bfb4', '#a39a92'], body: '#15181f', rim: '#4a5a70', sun: ['#fff4cc', 25.5, 7.5] },
  evening: { sky: ['#3a3262', '#7a4f82', '#c66f7c', '#f0a176'], ledge: ['#9a7a82', '#6e5864'], body: '#17131b', rim: '#8a5a66', sun: ['#ffe0a6', 25.5, 16.5] },
  night: { sky: ['#0a1230', '#0f1a40', '#15234f', '#1c2d5c'], ledge: ['#4a4f70', '#33384f'], body: '#07090f', rim: '#3a4674', moon: ['#f3e6c4', '#27304f'], stars: [[4, 3], [14, 2], [29, 15]] },
};

export function favicon(time, rounded = true) {
  const p = ICON[time], c = Object.assign(document.createElement('canvas'), { width: 32, height: 32 }), g = c.getContext('2d');
  const px = (x, y, color) => ((g.fillStyle = color), g.fillRect(x, y, 1, 1));
  // Sky in four bands, checker-dithered where they meet.
  for (let y = 0; y < 28; y++) for (let x = 0; x < 32; x++) px(x, y, p.sky[Math.min(3, ((y + (y % 7 === 6 && (x + y) % 2 ? 1 : 0)) / 7) | 0)]);
  const [cx, cy] = p.sun ? p.sun.slice(1) : [25.5, 7.5];
  for (let y = 0; y < 28; y++) for (let x = 0; x < 32; x++) {
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > 3.2) continue;
    if (p.sun) px(x, y, p.sun[0]);
    else px(x, y, Math.hypot(x + 0.5 - cx + 1.6, y + 0.5 - cy + 0.6) > 3 ? p.moon[0] : p.moon[1]);
  }
  for (const [x, y] of p.stars ?? []) px(x, y, '#cfd8ff');
  for (let y = 28; y < 32; y++) for (let x = 0; x < 32; x++) px(x, y, p.ledge[y === 28 ? 0 : 1]);
  paintCat(g, catPixels(0, false), p.body, p.rim, 4, 28 - CAT_H);
  // Rounded corners (app icons stay square: the OS applies its own mask).
  if (rounded) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = Math.max(0, Math.abs(x + 0.5 - 16) - 10), dy = Math.max(0, Math.abs(y + 0.5 - 16) - 10);
    if (Math.hypot(dx, dy) > 6) g.clearRect(x, y, 1, 1);
  }
  return c.toDataURL();
}

export function effects(weather, time) {
  const rain = weather === 'rain' ? 1 : 0;
  const glow = { day: 0, evening: 0.55, night: 1 }[time];
  const flies = rain ? 0 : { day: 0, evening: 0.45, night: 1 }[time];
  const shadow = time === 'day' ? { sun: 1, cloud: 0.45, rain: 0 }[weather] : time === 'evening' && weather === 'sun' ? 0.5 : 0;
  return [rain, glow, flies, shadow];
}

export class Scene {
  constructor(canvas, { cat, ledge }) {
    this.canvas = canvas;
    this.base = { cat, ledge };
    const gl = (this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false }));
    if (!gl) throw new Error('WebGL2 unavailable');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.compose = this.program(COMPOSE);
    this.present = this.program(PRESENT);
    this.scenes = {};
    this.catCanvas = document.createElement('canvas');
    this.cat2d = this.catCanvas.getContext('2d');
    this.catTex = this.texture();
    this.twitch = 0;
  }

  program(fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    const u = {};
    for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--; ) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  texture(min = this.gl.NEAREST, mag = this.gl.NEAREST) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  async load(key, url, fx) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const gl = this.gl, tex = this.texture(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (!this.art) this.setSize(img.width, img.height);
    const { width: w, height: h } = img;
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, w, h).data, tint = [0, 0, 0], sky = ((h * 0.3) | 0) * w;
    // Average sky colour drives rain and cat rim-light tint; the top row tints the browser chrome above the page.
    for (let i = 0; i < sky * 4; i += 4) for (let k = 0; k < 3; k++) tint[k] += d[i + k] / 255 / sky;
    const sky0 = [0, 0, 0];
    for (let i = 0; i < w * 4; i += 4) for (let k = 0; k < 3; k++) sky0[k] += d[i + k] / w;
    // Glow map: keep only light sources brighter than the scenery, then blur them into a soft halo.
    // Puddle reflections on the ledge are not sources, and nothing glows on the lip or face that faces the viewer.
    const [top, depth] = this.ledge;
    let g = new Float32Array(w * h * 4);
    for (let i = 0; i < top * w * 4; i += 4) {
      const k = Math.max(0, (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255 - 0.55) / 0.45;
      for (let j = 0; j < 3; j++) g[i + j] = d[i + j] * k;
    }
    for (let pass = 0; pass < 6; pass++) g = blur(g, w, h, pass % 2, 2 * this.k);
    g.fill(0, (top + depth) * w * 4);
    const glow = this.texture(gl.LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, Uint8ClampedArray.from(g, (v, i) => (i % 4 === 3 ? 255 : v)));
    this.scenes[key] = { tex, glow, fx, tint, top: `#${sky0.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` };
  }

  // Scene positions are given on the 249-wide base grid; finer art scales them by k.
  setSize(w, h) {
    const gl = this.gl, k = (this.k = Math.max(1, Math.round(w / 249)));
    this.catAt = this.base.cat.map((v) => v * k);
    this.ledge = this.base.ledge.map((v) => v * k);
    Object.assign(this.catCanvas, { width: CAT_W * k, height: CAT_H * k });
    this.art = [w, h];
    this.frameTex = this.texture(gl.LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.frameTex, 0);
  }

  set(key, instant) {
    if (key === this.to) return;
    if (instant || !this.to) this.from = key;
    else if (this.mix >= 0.5) this.from = this.to;
    this.to = key;
    this.start = instant ? -Infinity : performance.now() / 1000;
  }

  drawCat(t, tint) {
    const body = tint.map((v) => v * 0.14);
    if (t > this.twitch + 0.18 && Math.random() < 0.003) this.twitch = t;
    this.cat2d.clearRect(0, 0, this.catCanvas.width, this.catCanvas.height);
    const on = catPixels(t, t - this.twitch < 0.18);
    paintCat(this.cat2d, this.k === 2 ? scale2x(on) : on, css(body), css(lerp(body, tint, 0.4)));
  }

  frame() {
    const gl = this.gl, A = this.scenes[this.from], B = this.scenes[this.to];
    if (!A || !B) return;
    const t = performance.now() / 1000;
    this.mix = ease(Math.min(1, (t - this.start) / DUR));
    const [w, h] = this.art, e = this.mix * this.mix * (3 - 2 * this.mix);

    this.drawCat(t, lerp(A.tint, B.tint, e));
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.catTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.catCanvas);

    let { p, u } = this.compose;
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, B.tex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, A.glow);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, B.glow);
    gl.uniform1i(u.uA, 0), gl.uniform1i(u.uB, 1), gl.uniform1i(u.uCat, 2), gl.uniform1i(u.uGA, 3), gl.uniform1i(u.uGB, 4);
    gl.uniform2f(u.uArt, w, h);
    gl.uniform1f(u.uT, t % 3600), gl.uniform1f(u.uMix, this.mix);
    gl.uniform4fv(u.uFxA, A.fx), gl.uniform4fv(u.uFxB, B.fx);
    gl.uniform3fv(u.uTintA, A.tint), gl.uniform3fv(u.uTintB, B.tint);
    const k = this.k;
    gl.uniform4f(u.uCatRect, this.catAt[0] - 8 * k, this.catAt[1] - CAT_H * k, CAT_W * k, CAT_H * k);
    gl.uniform2fv(u.uLedge, this.ledge);
    gl.uniform1f(u.uK, k);
    this.draw();

    const dpr = Math.min(devicePixelRatio || 1, 2), c = this.canvas;
    const cw = Math.round(c.clientWidth * dpr), ch = Math.round(c.clientHeight * dpr);
    if (c.width !== cw || c.height !== ch) (c.width = cw), (c.height = ch);
    const scale = Math.max(cw / w, ch / h), vw = cw / scale;
    // Keep the cat in view when the crop is narrow (phones in portrait).
    const ox = Math.min(Math.max(this.catAt[0] - vw / 2, 0), w - vw), oy = Math.max(0, (h - ch / scale) / 2);
    ({ p, u } = this.present);
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.uniform1i(u.uFrame, 0);
    gl.uniform2f(u.uArt, w, h), gl.uniform2f(u.uRes, cw, ch), gl.uniform2f(u.uOff, ox, oy);
    gl.uniform1f(u.uScale, scale);
    this.draw();
  }

  draw() {
    const gl = this.gl;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
