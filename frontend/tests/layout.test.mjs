import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayout } from '../src/dashboard/layout.js';
import { widgetConfigKey } from '../src/dashboard/widgetConfig.js';

test('moving a widget preserves its position and relocates collisions without mutating inputs', () => {
  const widgets = [
    { id: 1, x: 1, y: 1, width: 6, height: 2 },
    { id: 2, x: 1, y: 1, width: 6, height: 2 },
    { id: 3, x: 7, y: 1, width: 6, height: 2 },
  ];
  const original = structuredClone(widgets);
  const placed = resolveLayout(widgets, 2);
  assert.deepEqual(widgets, original);
  assert.deepEqual(placed.find(w => w.id === 2), widgets[1]);
  assert.deepEqual(placed.map(w => w.id).sort(), [1, 2, 3]);
  for (const a of placed) {
    assert.ok(a.x >= 1 && a.x + a.width <= 13 && a.y >= 1);
    for (const b of placed.filter(w => w.id !== a.id)) {
      assert.ok(a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height);
    }
  }
});

test('duplicate detection ignores geometry but preserves differences in widget settings', () => {
  const widget = { type: 'notes', title: 'Notes', content: 'Hello', x: 1, y: 1 };
  assert.equal(widgetConfigKey(widget), widgetConfigKey({ ...widget, id: 42, x: 7, title: ' Notes ' }));
  assert.notEqual(widgetConfigKey(widget), widgetConfigKey({ ...widget, content: 'Different' }));
  assert.deepEqual(resolveLayout([], null), []);
});


test('duplicate comparison ignores text case and surrounding spaces without altering widgets', () => {
  const note = { type: 'notes', title: 'Mes Notes', content: 'Bonjour' };
  assert.equal(widgetConfigKey(note), widgetConfigKey({ ...note, title: ' MES NOTES ', content: ' bonjour ', refreshInterval: 60 }));
  assert.deepEqual(note, { type: 'notes', title: 'Mes Notes', content: 'Bonjour' });
  const weather = { type: 'weather', title: 'Météo', city: 'Paris, France' };
  assert.equal(widgetConfigKey(weather), widgetConfigKey({ ...weather, title: 'MÉTÉO', city: 'PARIS, FRANCE', refreshInterval: 900 }));
  assert.notEqual(widgetConfigKey(weather), widgetConfigKey({ ...weather, city: 'Lyon, France' }));
  const spotify = { type: 'spotify_player', title: 'Musique', clientId: 'AbC' };
  assert.notEqual(widgetConfigKey(spotify), widgetConfigKey({ ...spotify, clientId: 'abc' }));
});
