import assert from 'node:assert';
import { Scene } from '../src/scene.js';

// The transition timeline needs no WebGL: set and progress only move it along.
const s = Object.create(Scene.prototype), now = () => performance.now() / 1000;
s.set('rain', true);
assert.equal(s.progress(now()), 1, 'the first scene does not show at once');
s.set('cloud');
assert.deepEqual([s.from, s.to], ['rain', 'cloud']);
// Half a second in, new picks hurry the running transition on from where it is and only the last one waits.
s.start -= 0.5;
const before = s.progress(now());
s.set('sun');
s.set('night');
assert.ok(Math.abs(s.progress(now()) - before) < 0.01, 'the transition jumps when another scene is picked');
assert.equal(s.next, 'night', 'the last pick is not the one waiting');
assert.ok(s.start + s.dur - now() < 0.3, 'the running transition does not hurry');
// Once it is done, the waiting scene sweeps in from where the screen is.
s.start -= s.dur;
assert.ok(s.progress(now()) < 0.01, 'the waiting scene does not start from the beginning');
assert.deepEqual([s.from, s.to, s.next], ['cloud', 'night', null]);
// Picking the current target again cancels a waiting pick.
s.set('sun');
s.set('night');
assert.equal(s.next, null, 'picking the current target again leaves a pick waiting');
console.log('PASS: scene transitions hurry on without jumping, and only the last pick waits');
