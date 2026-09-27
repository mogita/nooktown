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
uniform vec4 uCatA, uCatB;
uniform vec2 uPose; // cat sprite row (tail pose) for each scene
uniform vec4 uWinA, uWinB; // window glass indoors; zero size outdoors
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

bool within(vec2 p, vec4 r) { vec2 q = p - r.xy; return all(greaterThanEqual(q, vec2(0))) && all(lessThan(q, r.zw)); }

// Weather shows everywhere outdoors, but indoors only through the window glass and behind the cat; vis returns how much of the outside shows at p. Cloud shadows fall on the rooftop only: through the window they would cross the sky.
vec3 look(sampler2D s, sampler2D g, vec2 p, vec4 fx, vec4 cat, float pose, vec4 win, out float vis) {
  vis = win.z == 0. || within(p, win) ? 1. : 0.;
  vec2 uv = (p + .5) / uArt;
  float y = p.y / uArt.y;
  vec3 c = texture(s, uv).rgb;
  vec3 mid = textureLod(s, uv, 2.5 + log2(uK)).rgb;
  c += texture(g, uv).rgb * vec3(1., .85, .65) * 1.6 * fx.y * (.9 + .1 * sin(uT * 1.1 + p.x * .03));
  // Stars twinkle on the darkest skies only; warm points (moon, windows) hold steady.
  float star = smoothstep(.12, .3, dot(c - mid, vec3(.3, .59, .11))) * (1. - smoothstep(.2, .35, y)) * step(c.r, c.b + .02) * vis;
  c *= 1. + star * smoothstep(.8, 1., fx.y) * .5 * sin(uT * (1.5 + 2. * h2(p)) + h2(p + 3.) * 40.);
  float n = fbm(p / (vec2(70., 34.) * uK) + vec2(uT * .018, uT * .004));
  c *= 1. - step(.5, n + (bayer(p) - .5) * .05) * .14 * fx.w * smoothstep(.2, .38, y) * step(win.z, 0.);
  if (within(p, cat)) {
    vec4 k = texelFetch(uCat, ivec2(p - cat.xy + vec2(0, pose * cat.w)), 0);
    c = mix(c, k.rgb, k.a);
    if (win.z > 0.) vis *= 1. - k.a;
  }
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
  float vA, vB;
  vec3 c = look(uB, uGB, p, uFxB, uCatB, uPose.y, uWinB, vB);
  float vis = vB;
  // Outside a transition only the new scene shows, and fireflies cost nothing where there are none.
  if (uMix < 1.) {
    c = mix(look(uA, uGA, p, uFxA, uCatA, uPose.x, uWinA, vA), c, m);
    vis = mix(vA, vB, m);
  }
  if (fx.z > 0.) c += vec3(1., .86, .45) * fireflies(p) * fx.z * .8 * vis;
  float rn = .3 * rain(p, 260. * uK, 13. * uK, .07 / uK, 1.) + .18 * rain(p, 190. * uK, 9. * uK, .14 / uK, 2.) + .1 * rain(p, 140. * uK, 6. * uK, .22 / uK, 3.) + splash(p);
  c = mix(c, mix(mix(uTintA, uTintB, e), vec3(1.), .4), clamp(rn * fx.x * vis, 0., 1.));
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

// Original cat, a Devon Rex seen from behind, on a 17-wide grid with the ground at y = 22: big low-set ears, a round skull with wide cheekbones narrowing to a wedge at the chin, a chest with straight front legs, and haunches that bulge wider than the head and curve in under the cat. Ellipses are [cx, cy, rx, ry, n] superellipses (n above 2 squares them off); polygons are convex. The tail is drawn procedurally and may hang below the ground, so the sprite is taller.
const SKULL = [8.5, 5.6, 4.9, 3], HAUNCHES = [8.5, 18.6, 6.6, 3.5, 3];
const FACE = [[3.6, 5.8], [13.4, 5.8], [8.5, 11.2]];
const CHEST = [[6.4, 9.6], [10.6, 9.6], [11.6, 11.4], [12.1, 17], [4.9, 17], [5.4, 11.4]];
const EAR = [[2.6, 0.3], [3.6, 5.6], [7.4, 2.8]];
const GROUND = 22, CAT_W = 30, CAT_H = 38, PAD = 12; // PAD: room left of the cat for its shadow

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

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

const css = (c) => `rgb(${c.map((v) => Math.min(255, v * 255) | 0)})`;

const inEllipse = (x, y, [cx, cy, rx, ry, n = 2]) => Math.abs((x - cx) / rx) ** n + Math.abs((y - cy) / ry) ** n < 1;
const cross = (x, y, [ax, ay], [bx, by]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
const inPolygon = (x, y, pts) => {
  const d = pts.map((a, i) => cross(x, y, a, pts[(i + 1) % pts.length]));
  return d.every((v) => v >= 0) || d.every((v) => v <= 0);
};

// The tail's centre line with a radius at each step: slim, with a fuller tip. On a ledge it curls up beside the cat; over a sill edge it hangs down with its tip hooked. pose (0 to 1) sets how far it curls.
function tail(pose, hang) {
  const line = [], n = hang ? 54 : 44;
  // On the ledge the root runs a quarter pixel low, so the flat stretch stays one even width on the pixel grid.
  for (let i = 0, x = hang ? 9.6 : 12.7, y = hang ? 20.8 : 21.25, a = hang ? Math.PI / 2 : 0; i < n; i++) {
    const s = i / (n - 1);
    if (hang) a += s > 0.6 ? (1.2 + 0.8 * pose) / (0.4 * n) : 0;
    else if (i >= 20) a -= (0.3 + 0.25 * pose) / 4;
    x += Math.cos(a) / 4, y += Math.sin(a) / 4;
    line.push([x, y, s < 0.6 ? 0.85 - 0.25 * s : 0.7 + 0.65 * Math.min(1, (s - 0.6) / 0.3)]);
  }
  return line;
}

// Cat pixels at scale k, drawn from shapes so edges stay smooth at any scale. The tail moves between a few held poses: continuous motion makes edge pixels flicker on and off as the curve crosses the grid.
// Returns a map from "x,y" to the part there: tip (the point of an ear), ear (just below it) or fur.
export const tailPose = (t) => Math.round(2 + 2 * Math.sin(t * 0.9)) / 4;
export function catPixels(t, twitch, k = 1, hang = false) {
  const on = new Map(), right = EAR.map(([x, y]) => [17 - x, y]);
  // A twitch flicks the right ear tip outward.
  if (twitch) right[0] = [right[0][0] + 0.8, right[0][1] + 1.2];
  const polygons = [FACE, CHEST];
  for (let py = 0; py < GROUND * k; py++)
    for (let px = 0; px < 17 * k; px++) {
      const x = (px + 0.5) / k, y = (py + 0.5) / k;
      if (inEllipse(x, y, SKULL)) on.set(`${px},${py}`, 'fur');
      else if (inPolygon(x, y, EAR) || inPolygon(x, y, right)) on.set(`${px},${py}`, y < 1.6 ? 'tip' : y < 3.4 ? 'ear' : 'fur');
      else if (inEllipse(x, y, HAUNCHES) || polygons.some((g) => inPolygon(x, y, g))) on.set(`${px},${py}`, 'fur');
    }
  const line = tail(tailPose(t), hang);
  const xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
  for (let py = Math.floor((Math.min(...ys) - 2) * k); py < (Math.max(...ys) + 2) * k; py++)
    for (let px = Math.floor((Math.min(...xs) - 2) * k); px < (Math.max(...xs) + 2) * k; px++)
      if (line.some(([x, y, r]) => Math.hypot((px + 0.5) / k - x, (py + 0.5) / k - y) < r)) on.set(`${px},${py}`, 'fur');
  return on;
}

// Fur tones: pixels with nothing above them catch the light, sides facing the main light (side is -1 for left, 1 for right, 0 for none) brighten and the far sides dim, and pixels with nothing below them fall in shade. Ear points are pink, fading back to white along a one-pixel line down the ear's edge.
function paintCat(g, on, pal, ox = 0, oy = 0, side = 0) {
  const has = (x, y) => on.has(`${x},${y}`);
  for (const [key, part] of on) {
    const [x, y] = key.split(',').map(Number), lit = !has(x, y - 1);
    const edge = lit || !has(x - 1, y) || !has(x + 1, y);
    // Toward the main light a rim of lit fur about three pixels deep, brightest at the edge.
    const toLight = side && [1, 2, 3].findIndex((i) => !has(x + i * side, y));
    g.fillStyle = part === 'tip' ? pal.tip : part === 'ear' && edge ? pal.blush : lit ? pal.rim
      : toLight === 0 ? pal.key : toLight > 0 ? pal.warm : side && !has(x - side, y) ? pal.side : has(x, y + 1) ? pal.fur : pal.shade;
    g.fillRect(ox + x, oy + y, 1, 1);
  }
}

// A flat two-tone shadow on the ledge, in a dusky violet rather than black: a thin contact shadow hugging the cat's base, and a cast shadow stretched away from the main light ([dx, dy, strength], see shadowOf), darker near the cat and paler further out.
function paintShadow(g, [dx, dy, s], ox, oy, k, [top, bottom]) {
  const len = 10 * s, cx = 8.5 + (dx * len) / 2, cy = GROUND - 0.5 + 0.6 * s * dy, rx = 4.8 + (len / 2) * Math.abs(dx), ry = 1.3 + 0.6 * s * Math.abs(dy);
  // Only the ledge's top surface takes the shadow: its front faces the room, away from the light.
  for (let py = Math.max(top, (GROUND - 3) * k); py < Math.min(bottom, (GROUND + 3) * k); py++)
    for (let px = -PAD * k; px < CAT_W * k; px++) {
      const x = (px + 0.5) / k, y = (py + 0.5) / k, near = Math.hypot(Math.max(0, Math.abs(x - 8.5) - 4.3), y - GROUND);
      const contact = ((x - 8.5) / 5.2) ** 2 + ((y - GROUND + 0.1) / 0.7) ** 2 < 1, cast = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
      const a = contact ? 0.38 : cast ? (near < 2 + 0.25 * len ? 0.36 : 0.2) * s : 0;
      if (a) (g.fillStyle = `rgba(28, 20, 48, ${a})`), g.fillRect(ox + px, oy + py, 1, 1);
    }
}

const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

// White fur lit by the light where the cat sits, scaled from the ledge's own daylight lightness (albedo). Only part of the light's colour carries over and dim light is lifted, so the cat still reads as white at sunset and at night.
function whiteFur(light, albedo, colour = 0.4) {
  const l = Math.min(0.92, 0.35 + (0.65 * lum(light) * 0.9) / albedo);
  return light.map((v) => Math.min(1, l * (1 - colour + (colour * v) / lum(light))));
}

// Light from behind the cat rims its outline and shines through its thin ear points (subsurface scattering), which glow pinker against a bright sky.
const PINK = [1, 0.6, 0.66];
function catPalette(fur, litFur, sky) {
  const back = Math.min(1, lum(sky) * 1.6), pink = (k) => css(fur.map((v, i) => v * (1 - k * (0.38 + 0.14 * back) * (1 - PINK[i]))));
  return { fur: css(fur), rim: css(fur.map((v, i) => v + sky[i] * 0.35)), shade: css(fur.map((v) => v * 0.8)), key: css(litFur.map((v) => v * 1.1)), warm: css(litFur.map((v, i) => (v + fur[i]) / 2)), side: css(fur.map((v) => v * 0.86)), tip: pink(1), blush: pink(0.5) };
}

// 32x32 pixel-art tab icon: the cat on the ledge under a day, evening or night sky.
const ICON = {
  day: { sky: ['#7fb6dc', '#9cc8e6', '#bcdced', '#d9ebee'], ledge: ['#c9bfb4', '#a39a92'], cat: [[0.92, 0.91, 0.89], [0.55, 0.72, 0.86]], sun: ['#fff4cc', 25.5, 7.5] },
  evening: { sky: ['#3a3262', '#7a4f82', '#c66f7c', '#f0a176'], ledge: ['#9a7a82', '#6e5864'], cat: [[0.9, 0.78, 0.74], [0.7, 0.42, 0.5]], sun: ['#ffe0a6', 25.5, 16.5] },
  night: { sky: ['#0a1230', '#0f1a40', '#15234f', '#1c2d5c'], ledge: ['#4a4f70', '#33384f'], cat: [[0.64, 0.67, 0.78], [0.12, 0.18, 0.34]], moon: ['#f3e6c4', '#27304f'], stars: [[4, 3], [14, 2], [29, 15]] },
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
  paintCat(g, catPixels(0, false), catPalette(p.cat[0], p.cat[0], p.cat[1]), 4, 28 - GROUND);
  // Rounded corners (app icons stay square: the OS applies its own mask).
  if (rounded) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = Math.max(0, Math.abs(x + 0.5 - 16) - 10), dy = Math.max(0, Math.abs(y + 0.5 - 16) - 10);
    if (Math.hypot(dx, dy) > 6) g.clearRect(x, y, 1, 1);
  }
  return c.toDataURL();
}

// Which way the main light throws shadows on screen ([dx, dy], dy toward the viewer) and how strongly, read off each scene's art: the sun from the upper left, the low sun through the window, and the table lamp right of the sill. Overcast and night rooftops only get the contact shadow.
export function shadowOf(place, weather, time) {
  if (place === 'room') {
    if (time === 'day') return { rain: [-1, 0.2, 0.45], cloud: [0, 1, 0.3], sun: [1, 0.2, 0.8] }[weather];
    return time === 'evening' && weather === 'sun' ? [-0.5, 1, 0.8] : [-1, 0.1, time === 'night' ? 1 : 0.75];
  }
  return weather === 'sun' ? (time === 'day' ? [1, -0.6, 0.9] : time === 'evening' ? [0, 1, 0.5] : [0, 0, 0]) : [0, 0, 0];
}

export function effects(weather, time) {
  const rain = weather === 'rain' ? 1 : 0;
  const glow = { day: 0, evening: 0.55, night: 1 }[time];
  const flies = rain ? 0 : { day: 0, evening: 0.45, night: 1 }[time];
  const shadow = time === 'day' ? { sun: 1, cloud: 0.45, rain: 0 }[weather] : time === 'evening' && weather === 'sun' ? 0.5 : 0;
  return [rain, glow, flies, shadow];
}

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
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

  // spot gives, on the 249-wide base grid, where the cat sits, the ledge's top row and depth, and indoors the window glass.
  async load(key, url, fx, spot, shadow) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const gl = this.gl, tex = this.texture(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (!this.art) this.setSize(img.width, img.height);
    const { width: w, height: h } = img, k = this.k, at = (v) => v.map((x) => x * k);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, w, h).data, tint = [0, 0, 0], win = spot.window ? at(spot.window) : [0, 0, 0, 0];
    // Average sky colour (through the window indoors) drives rain and cat rim-light tint; the top row tints the browser chrome above the page.
    const [sx, sy, sw, sh] = spot.window ? win : [0, 0, w, (h * 0.3) | 0];
    for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) for (let j = 0; j < 3; j++) tint[j] += d[(y * w + x) * 4 + j] / 255 / (sw * sh);
    const sky0 = [0, 0, 0];
    for (let i = 0; i < w * 4; i += 4) for (let j = 0; j < 3; j++) sky0[j] += d[i + j] / w;
    // Glow map: keep only light sources brighter than the scenery, then blur them into a soft halo.
    // Puddle reflections on the ledge are not sources, and nothing glows on the lip or face that faces the viewer.
    const [top, depth] = at(spot.ledge);
    let g = new Float32Array(w * h * 4);
    for (let i = 0; i < top * w * 4; i += 4) {
      const l = Math.max(0, (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255 - 0.55) / 0.45;
      for (let j = 0; j < 3; j++) g[i + j] = d[i + j] * l;
    }
    for (let pass = 0; pass < 6; pass++) g = blur(g, w, h, pass % 2, 2 * k);
    g.fill(0, (top + depth) * w * 4);
    const glow = this.texture(gl.LINEAR, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, Uint8ClampedArray.from(g, (v, i) => (i % 4 === 3 ? 255 : v)));
    const cat = at(spot.cat), rect = [cat[0] - (8 + PAD) * k, cat[1] - GROUND * k, (PAD + CAT_W) * k, CAT_H * k];
    // The light on the ledge between two columns: where the cat sits, and beside it on the side the main light comes from (-1 left, 1 right) to light that side of its fur.
    const ledgeLight = (x0, x1) => {
      const c = [0, 0, 0];
      for (let y = top; y < top + depth; y++) for (let x = x0; x < x1; x++) for (let j = 0; j < 3; j++) c[j] += d[(y * w + x) * 4 + j] / 255 / (depth * (x1 - x0));
      return c;
    };
    const fur = whiteFur(ledgeLight(cat[0] - 12 * k, cat[0] + 12 * k), spot.albedo), side = shadow[2] > 0.3 && Math.abs(shadow[0]) > 0.3 ? -Math.sign(shadow[0]) : 0;
    const x0 = cat[0] + (side > 0 ? 12 : -44) * k, litFur = side ? whiteFur(ledgeLight(x0, x0 + 32 * k), spot.albedo, 1) : fur;
    // The ledge's top surface in sprite rows, where shadows can fall.
    const surface = [top - rect[1], top + depth - rect[1]];
    this.scenes[key] = { tex, glow, fx, tint, fur, litFur, side, shadow, surface, cat, rect, win, pose: spot.hang ? 1 : 0, ledge: [top, depth], top: `#${sky0.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` };
  }

  // Scene positions are given on the 249-wide base grid; finer art scales them by k.
  setSize(w, h) {
    const gl = this.gl, k = (this.k = Math.max(1, Math.round(w / 249)));
    // One row per tail pose: resting on the ledge, and hanging over the edge.
    Object.assign(this.catCanvas, { width: (PAD + CAT_W) * k, height: 2 * CAT_H * k });
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

  // Returns false, skipping the redraw and the texture upload, while nothing in the sprite has changed.
  drawCat(t, fur, litFur, side, sky, shadow, surfaces) {
    const pal = catPalette(fur, litFur, sky), k = this.k === 2 ? 2 : 1;
    if (t > this.twitch + 0.18 && Math.random() < 0.003) this.twitch = t;
    const twitch = t - this.twitch < 0.18, key = JSON.stringify([tailPose(t), twitch, pal, side, shadow, surfaces]);
    if (key === this.catKey) return false;
    this.catKey = key;
    this.cat2d.clearRect(0, 0, this.catCanvas.width, this.catCanvas.height);
    for (const hang of [false, true]) {
      if (surfaces[+hang]) paintShadow(this.cat2d, shadow, PAD * k, hang * CAT_H * k, k, surfaces[+hang]);
      paintCat(this.cat2d, catPixels(t, twitch, k, hang), pal, PAD * k, hang * CAT_H * k, side);
    }
    return true;
  }

  frame() {
    const gl = this.gl, A = this.scenes[this.from], B = this.scenes[this.to];
    if (!A || !B) return;
    const t = performance.now() / 1000;
    this.mix = ease(Math.min(1, (t - this.start) / DUR));
    const [w, h] = this.art, e = this.mix * this.mix * (3 - 2 * this.mix);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.catTex);
    if (this.drawCat(t, lerp(A.fur, B.fur, e), lerp(A.litFur, B.litFur, e), (e < 0.5 ? A : B).side, lerp(A.tint, B.tint, e), lerp(A.shadow, B.shadow, e), { [A.pose]: A.surface, [B.pose]: B.surface }))
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
    gl.uniform4fv(u.uCatA, A.rect), gl.uniform4fv(u.uCatB, B.rect), gl.uniform2f(u.uPose, A.pose, B.pose);
    gl.uniform4fv(u.uWinA, A.win), gl.uniform4fv(u.uWinB, B.win);
    gl.uniform2fv(u.uLedge, B.ledge);
    gl.uniform1f(u.uK, this.k);
    this.draw();

    const dpr = Math.min(devicePixelRatio || 1, 2), c = this.canvas;
    const cw = Math.round(c.clientWidth * dpr), ch = Math.round(c.clientHeight * dpr);
    if (c.width !== cw || c.height !== ch) (c.width = cw), (c.height = ch);
    const scale = Math.max(cw / w, ch / h), vw = cw / scale;
    // Keep the cat in view when the crop is narrow (phones in portrait).
    const ox = Math.min(Math.max(A.cat[0] + (B.cat[0] - A.cat[0]) * e - vw / 2, 0), w - vw), oy = Math.max(0, (h - ch / scale) / 2);
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
