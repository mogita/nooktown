import assert from 'node:assert';
import { catPixels } from '../src/scene.js';

// Counts edge-connected pieces; the cat, tail included, must stay one piece in every frame.
const pieces = (on) => {
  const left = new Set(on);
  let n = 0;
  for (const start of on) {
    if (!left.delete(start)) continue;
    n++;
    for (const stack = [start]; stack.length; ) {
      const [x, y] = stack.pop().split(',').map(Number);
      for (const k of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) if (left.delete(k)) stack.push(k);
    }
  }
  return n;
};

const poses = new Set();
for (let i = 0; i < 3000; i++) {
  const t = i / 100, on = catPixels(t, false, 2);
  assert.equal(pieces(on), 1, `cat splits at t = ${t}`);
  poses.add([...on].sort().join(' '));
}
// The tail holds a few curl poses instead of crawling pixel by pixel.
assert.equal(poses.size, 5, `tail has ${poses.size} poses`);
console.log('PASS: the cat stays in one piece and its tail holds 5 poses');
