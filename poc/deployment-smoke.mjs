import assert from 'node:assert/strict';
const base = new URL(process.argv[2] || 'http://127.0.0.1:8080');
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname), 'Ce test de rafale est réservé au déploiement local.');
const get = path => fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) });
const index = await get('/');
assert.equal(index.status, 200);
const csp = index.headers.get('content-security-policy');
assert.ok(csp.includes('https://api.open-meteo.com') && csp.includes('https://geocoding-api.open-meteo.com'));
assert.ok(!index.headers.get('server').includes('/'), 'La version Nginx doit être masquée.');
const response = await get('/about.json');
assert.equal(response.status, 200);
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
assert.equal(response.headers.get('cache-control'), 'no-store');
const about = await response.json();
assert.equal(typeof about.client.host, 'string');
assert.ok(Number.isInteger(about.server.current_time));
assert.equal(about.server.services.length, 7);
assert.equal(about.server.services.flatMap(s => s.widgets).length, 13);
const oversized = await fetch(new URL('/api/auth/register', base), {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'x'.repeat(1024 * 1024) }), signal: AbortSignal.timeout(15000),
});
assert.equal(oversized.status, 413);
const privateResponse = await get('/api/auth/me');
assert.equal(privateResponse.status, 401);
const apiStatuses = await Promise.all(Array.from({ length: 60 }, async () => (await get('/api/health')).status));
assert.ok(apiStatuses.includes(200) && apiStatuses.includes(429));
const authStatuses = await Promise.all(Array.from({ length: 15 }, async () => (await get('/api/auth/me')).status));
assert.ok(authStatuses.includes(401) && authStatuses.includes(429));
console.log(JSON.stringify({ frontend: 200, about: 200, services: 7, widgets: 13, oversized: 413,
  unauthenticated: 401, apiRateLimit: 429, authRateLimit: 429, weatherCsp: true, hiddenNginxVersion: true }));
