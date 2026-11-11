import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeather, weatherLabel } from '../src/widgets/weather/weatherClient.js';
import { cleanWidgets } from '../src/dashboardModel.js';

test('weather resolves each city independently and displays actual provider values including zero', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.credentials, 'omit');
    return { ok: true, json: async () => url.hostname.startsWith('geocoding')
      ? { results: [{ name: url.searchParams.get('name'), latitude: 48, longitude: 2, country: 'France' }] }
      : { current: { temperature_2m: 0, weather_code: 71, time: '2026-10-05T12:00' }, timezone: 'Europe/Paris' } };
  };
  const [paris, lyon] = await Promise.all(['Paris', 'Lyon'].map(city => loadWeather(city, { fetchImpl })));
  assert.equal(paris.temperature, 0);
  assert.equal(paris.condition, 'Neige');
  assert.equal(paris.location, 'Paris, France');
  assert.equal(lyon.location, 'Lyon, France');
  assert.equal(calls.length, 4);
  assert.equal(weatherLabel(999), 'Conditions non renseignées');
});

test('missing city, quota and incomplete response never produce fake weather', async () => {
  await assert.rejects(loadWeather('Paris', { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /introuvable/);
  await assert.rejects(loadWeather('Paris', { fetchImpl: async () => ({ ok: false, status: 429 }) }), /Quota/);
  let n = 0;
  await assert.rejects(loadWeather('Paris', { fetchImpl: async () => ({ ok: true, json: async () => n++ === 0
    ? { results: [{ name: 'Paris', latitude: 48, longitude: 2 }] } : { current: { temperature_2m: null } } }) }), /incomplètes/);
});

test('two weather configurations survive export validation with distinct intervals', () => {
  const widgets = ['Paris', 'Lyon'].map((city, index) => ({ id: index, type: 'weather', title: city, city,
    x: 1, y: 1 + index * 2, width: 6, height: 2, refreshInterval: 300 + index * 600 }));
  assert.deepEqual(cleanWidgets(widgets), widgets);
  assert.throws(() => cleanWidgets([{ ...widgets[0], refreshInterval: 30 }]), /300/);
  assert.throws(() => cleanWidgets([{ ...widgets[0], city: 'x' }]), /Ville/);
});
