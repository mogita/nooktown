import assert from 'node:assert';
import { catPixels, tailPose } from '../src/scene.js';

// Counts edge-connected pieces; the cat, tail included, must stay one piece in every frame.
const pieces = (on) => {
  const left = new Set(on.keys());
  let n = 0;
  for (const start of on.keys()) {
    if (!left.delete(start)) continue;
    n++;
    for (const stack = [start]; stack.length; ) {
      const [x, y] = stack.pop().split(',').map(Number);
      for (const k of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) if (left.delete(k)) stack.push(k);
    }
  }
  return n;
};

for (const hang of [false, true]) {
  const poses = new Map();
  for (let i = 0; i < 3000; i++) {
    const t = i / 100, on = catPixels(t, false, 2, hang), shape = [...on].sort().join(' ');
    assert.equal(pieces(on), 1, `cat splits at t = ${t}${hang ? ' with its tail hanging' : ''}`);
    // The sprite is only redrawn when the tail pose changes, so time may change the shape through it alone.
    assert.equal(poses.get(tailPose(t)) ?? shape, shape, `shape changes within one tail pose at t = ${t}`);
    poses.set(tailPose(t), shape);
  }
  // The tail holds a few poses instead of crawling pixel by pixel.
  const shapes = new Set(poses.values()).size;
  assert.equal(shapes, 5, `tail has ${shapes} poses`);
}
// An ear twitch changes the outline, and the favicon's small cat stays whole too.
for (const k of [1, 2]) {
  assert.notEqual([...catPixels(0, true, k)].sort().join(' '), [...catPixels(0, false, k)].sort().join(' '), `no ear twitch at k = ${k}`);
  assert.equal(pieces(catPixels(0, true, k)), 1, `twitching cat splits at k = ${k}`);
}
assert.equal(pieces(catPixels(0, false, 1)), 1, 'small cat splits');
// The ears are marked so they can glow pink.
for (const k of [1, 2]) assert.ok([...catPixels(0, false, k).values()].some((part) => part !== 'fur'), `no ears at k = ${k}`);
console.log('PASS: the cat stays in one piece, its tail holds 5 poses resting or hanging, and its ear twitches');
