'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./room-engine.js');

const item = (changes = {}) => ({ id: 'one', name: '抽屜櫃', type: 'drawer', x: 100, y: 100, width: 80, depth: 40, rotation: 0, clearance: 60, active: true, ...changes });
const project = items => ({ version: 1, room: { width: 360, depth: 300 }, items });

test('90 degree rotations swap body bounds and rotate the opening side around the rotated top-left', () => {
  const expected = [
    [0, { x: 100, y: 100, width: 80, height: 40 }, { x: 100, y: 140, width: 80, height: 60 }],
    [90, { x: 100, y: 100, width: 40, height: 80 }, { x: 40, y: 100, width: 60, height: 80 }],
    [180, { x: 100, y: 100, width: 80, height: 40 }, { x: 100, y: 40, width: 80, height: 60 }],
    [270, { x: 100, y: 100, width: 40, height: 80 }, { x: 140, y: 100, width: 60, height: 80 }],
  ];
  for (const [rotation, body, use] of expected) {
    assert.deepEqual(E.bodyRect(item({ rotation })), body);
    assert.deepEqual(E.useRect(item({ rotation })), use);
  }
});

test('inactive furniture and zero clearance have no operation area', () => {
  assert.equal(E.useRect(item({ active: false })), null);
  assert.equal(E.useRect(item({ clearance: 0 })), null);
  assert.deepEqual(E.analyze(project([item()])), [], 'Own body must never trigger a use collision.');
});

test('overlap returns the actual intersection and excludes edge-touching rectangles', () => {
  const a = { x: 0, y: 0, width: 80, height: 40 };
  assert.equal(E.overlap(a, { x: 80, y: 0, width: 20, height: 40 }), null);
  assert.equal(E.overlap(a, { x: 0, y: 40, width: 20, height: 40 }), null);
  assert.deepEqual(E.overlap(a, { x: 60, y: 30, width: 50, height: 50 }), { x: 60, y: 30, width: 20, height: 10 });
  assert.equal(E.overlap(a, null), null);
});

test('sample before identifies exactly 20cm interference; after is genuinely collision-free', () => {
  const alerts = E.analyze(E.sampleProject('before'));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'use');
  assert.equal(alerts[0].level, 'error');
  assert.deepEqual(alerts[0].rect, { x: 240, y: 120, width: 80, height: 20 });
  assert.match(alerts[0].message, /20 公分/);
  assert.deepEqual(E.analyze(E.sampleProject('after')), []);
});

test('body collision is distinct from simultaneous-use warning', () => {
  const bodyAlerts = E.analyze(project([item({ clearance: 0 }), item({ id: 'two', name: '床', x: 130, y: 110, clearance: 0 })]));
  assert.equal(bodyAlerts.length, 1);
  assert.equal(bodyAlerts[0].kind, 'body');
  const sharedAlerts = E.analyze(project([
    item({ x: 40, y: 40, width: 40, depth: 20, clearance: 80 }),
    item({ id: 'two', name: '椅子', x: 60, y: 160, width: 40, depth: 20, rotation: 180, clearance: 80 }),
  ]));
  assert.equal(sharedAlerts.length, 1);
  assert.equal(sharedAlerts[0].kind, 'shared');
  assert.equal(sharedAlerts[0].level, 'warning');
});

test('body and operation-area boundaries are checked separately, including negative coordinates', () => {
  const alerts = E.analyze(project([item({ x: -10, y: 250 })]));
  assert.equal(alerts.filter(a => a.kind === 'boundary').length, 2);
  assert.ok(alerts.some(a => a.id.startsWith('boundary:body:')));
  assert.ok(alerts.some(a => a.id.startsWith('boundary:use:')));
  assert.deepEqual(E.analyze(project([item({ x: 280, y: 200 })])), [], 'Exact room edge contact is permitted.');
});

test('rotation changes operation collisions, rather than just rotating the drawing', () => {
  const initial = project([item({ x: 100, y: 100 }), item({ id: 'two', name: '床', x: 150, y: 150, clearance: 0 })]);
  assert.ok(E.analyze(initial).some(a => a.kind === 'use'));
  initial.items[0].rotation = 90;
  assert.deepEqual(E.analyze(initial), []);
});

test('validation roundtrips without mutations or shared nested references', () => {
  const raw = E.sampleProject();
  const frozen = JSON.stringify(raw);
  const result = E.validateProject(raw);
  assert.deepEqual(result, raw);
  result.items[0].name = '新名稱';
  result.room.width = 500;
  assert.equal(JSON.stringify(raw), frozen);
  assert.deepEqual(E.parseBackup(frozen), raw);
  E.analyze(raw);
  assert.equal(JSON.stringify(raw), frozen);
});

test('validation rejects malformed numbers, types, booleans, directions, ids and unknown fields atomically', () => {
  const mutations = [
    p => { p.version = 2; },
    p => { p.room.width = 0; },
    p => { p.room.depth = Infinity; },
    p => { p.items[0].x = NaN; },
    p => { p.items[0].width = '80'; },
    p => { p.items[0].clearance = -1; },
    p => { p.items[0].rotation = '90'; },
    p => { p.items[0].rotation = 45; },
    p => { p.items[0].active = 'true'; },
    p => { p.items[0].type = ['drawer']; },
    p => { p.items[0].name = ' '; },
    p => { p.items[0].name = '字'.repeat(61); },
    p => { p.items[0].id = '<script>'; },
    p => { p.items[1].id = p.items[0].id; },
    p => { p.items[0].extra = true; },
    p => { delete p.items[0].active; },
    p => { p.room.extra = true; },
    p => { p.items = Array(51).fill(p.items[0]); },
  ];
  for (const mutate of mutations) {
    const raw = E.sampleProject(); mutate(raw);
    const snapshot = structuredClone(raw);
    assert.throws(() => E.validateProject(raw));
    assert.deepEqual(raw, snapshot, 'Validation failure must not mutate input.');
  }
  assert.throws(() => E.parseBackup('{invalid json}'));
  assert.throws(() => E.parseBackup('null'));
  assert.throws(() => E.validateProject([]));
});

test('factory items validate, samples are independent and unsupported types fail clearly', () => {
  const items = E.TYPES.map((type, index) => E.makeItem(type, index));
  assert.equal(new Set(items.map(i => i.id)).size, items.length);
  assert.deepEqual(E.validateProject(project(items)), project(items));
  const first = E.sampleProject(); first.items[0].x = 999;
  assert.equal(E.sampleProject().items[0].x, 40);
  assert.deepEqual(E.sampleProject('empty').items, []);
  assert.throws(() => E.makeItem('__proto__'));
  assert.throws(() => E.sampleProject('unknown'));
});
