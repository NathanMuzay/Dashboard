import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, buildEvent, eventsOnDay, localDate, period, eventMetadata } from '../src/widgets/calendar/calendarModel.js';
import { listEvents, calendarRequest } from '../src/widgets/calendar/calendarClient.js';

const draft = { title: 'Livraison', startDate: '2026-09-21', endDate: '2026-09-21', startTime: '09:00', endTime: '10:00', allDay: false, labels: 'backend, API, backend', priority: 'high', deadline: '2026-09-25', description: 'Revue', location: 'Marseille' };
test('month/year boundaries, Monday weeks and daylight-saving days use local dates', () => {
  const month = period(new Date(2026, 11, 31), 'month');
  assert.equal(localDate(month.start), '2026-12-01');
  assert.equal(localDate(month.end), '2027-01-01');
  assert.equal(localDate(period(new Date(2027, 0, 3), 'week').start), '2026-12-28');
  assert.equal(localDate(addDays(new Date(2026, 2, 29), 1)), '2026-03-30');
});
test('all-day end is exclusive and multiday events overlap only relevant days', () => {
  const body = buildEvent({ ...draft, allDay: true, endDate: '2026-09-23' });
  assert.deepEqual(body.end, { date: '2026-09-24' });
  assert.equal(eventsOnDay([body], new Date(2026, 8, 23)).length, 1);
  assert.equal(eventsOnDay([body], new Date(2026, 8, 24)).length, 0);
  const night = buildEvent({ ...draft, startTime: '23:00', endDate: '2026-09-22', endTime: '01:00' });
  assert.equal(eventsOnDay([night], new Date(2026, 8, 22)).length, 1);
});
test('priority, deduplicated labels and deadline round-trip via Google private properties', () => {
  const body = buildEvent(draft);
  assert.deepEqual(eventMetadata(body), { priority: 'high', labels: ['backend', 'API'], deadline: '2026-09-25' });
  assert.equal(eventMetadata({}).priority, 'normal');
  assert.equal(eventMetadata({ extendedProperties: { private: { lumiPriority: '__proto__' } } }).priority, 'normal');
});
test('invalid ranges and blank titles cannot be sent', () => {
  assert.throws(() => buildEvent({ ...draft, title: ' ' }));
  assert.throws(() => buildEvent({ ...draft, endTime: '08:00' }));
  assert.throws(() => buildEvent({ ...draft, allDay: true, endDate: '2026-09-20' }));
  assert.throws(() => buildEvent({ ...draft, labels: 'a'.repeat(201) }));
});
test('Paris spring clock change: nonexistent times rejected and timed duration preserved', () => {
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Europe/Paris') return;
  assert.throws(() => buildEvent({ ...draft, startDate: '2026-03-29', endDate: '2026-03-29', startTime: '02:30', endTime: '04:00' }));
  const event = buildEvent({ ...draft, startDate: '2026-03-29', endDate: '2026-03-29', startTime: '01:30', endTime: '03:30' });
  assert.equal(+new Date(event.end.dateTime) - +new Date(event.start.dateTime), 3600000);
});
test('Google event pagination preserves range and ignores cancelled events', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: new URL(url), options });
    return Response.json(calls.length === 1 ? { items: [{ id: 'a' }], nextPageToken: 'next' } : { items: [{ id: 'b' }, { id: 'deleted', status: 'cancelled' }] });
  });
  const events = await listEvents('test-token', '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z');
  assert.deepEqual(events.map(e => e.id), ['a', 'b']);
  assert.equal(calls[1].url.searchParams.get('pageToken'), 'next');
  assert.equal(calls[1].url.searchParams.get('singleEvents'), 'true');
  assert.equal(calls[1].url.searchParams.get('timeMin'), '2026-09-01T00:00:00Z');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-token');
});
test('expired authorization and quota errors remain actionable without exposing API details', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'private data' }, { status: 401 }));
  await assert.rejects(() => listEvents('test-token', 'start', 'end'), err => err.status === 401 && !err.message.includes('private data'));
});
test('creation posts metadata and never retries an ambiguous network failure', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).extendedProperties.private.lumiPriority, 'high');
    throw new TypeError('network');
  });
  await assert.rejects(() => calendarRequest('test-token', '', { body: buildEvent(draft) }), /vérifier si l’événement/);
  assert.equal(calls, 1);
});

test('403 distinguishes disabled API, missing consent and quota from structured Google reasons', async t => {
  const cases = [
    [{ errors: [{ reason: 'accessNotConfigured' }] }, 'SERVICE_DISABLED'],
    [{ details: [{ reason: 'SERVICE_DISABLED' }] }, 'SERVICE_DISABLED'],
    [{ errors: [{ reason: 'insufficientPermissions' }] }, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'],
    [{ details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] }, 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'],
    [{ errors: [{ reason: 'userRateLimitExceeded' }] }, 'QUOTA_EXCEEDED'],
    [{ errors: [{ reason: 'quotaExceeded' }] }, 'QUOTA_EXCEEDED'],
  ];
  let payload;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { ...payload, message: 'private upstream details' } }, { status: 403 }));
  for (const [value, expected] of cases) {
    payload = value;
    await assert.rejects(() => listEvents('test-token', 'start', 'end'), error =>
      error.status === 403 && error.message.includes(expected) && !error.message.includes('private upstream details'));
  }
});
test('non-JSON and malformed 403 errors preserve a safe fallback', async t => {
  let response = new Response('<html>private proxy details</html>', { status: 403 });
  t.mock.method(globalThis, 'fetch', async () => response);
  await assert.rejects(() => listEvents('test-token', 'start', 'end'), error => error.status === 403 && error.message.includes('Google refuse') && !error.message.includes('private'));
  response = Response.json({ error: { errors: [null], details: 'invalid' } }, { status: 403 });
  await assert.rejects(() => listEvents('test-token', 'start', 'end'), error => error.status === 403);
});

test('timetable keeps same-day timed courses, including recurring instances, but excludes nights and all-day events', async () => {
  const { isTimetableEvent } = await import('../src/widgets/calendar/calendarModel.js');
  assert.equal(isTimetableEvent({ ...buildEvent(draft), recurringEventId: 'course' }), true);
  assert.equal(isTimetableEvent(buildEvent({ ...draft, allDay: true })), false);
  assert.equal(isTimetableEvent(buildEvent({ ...draft, endDate: '2026-09-22', endTime: '00:00' })), false);
  assert.equal(isTimetableEvent(buildEvent({ ...draft, startTime: '23:00', endDate: '2026-09-22', endTime: '01:00' })), false);
  assert.equal(isTimetableEvent({ start: { dateTime: 'invalid' }, end: { dateTime: 'invalid' } }), false);
  assert.equal(isTimetableEvent({ start: { dateTime: '2026-09-21T10:00:00+02:00' }, end: { dateTime: '2026-09-21T09:00:00+02:00' } }), false);
});
test('timetable classifies dates in the display timezone instead of comparing raw ISO date prefixes', async () => {
  const { isTimetableEvent } = await import('../src/widgets/calendar/calendarModel.js');
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Europe/Paris') return;
  assert.equal(isTimetableEvent({ start: { dateTime: '2026-09-21T21:30:00Z' }, end: { dateTime: '2026-09-21T22:30:00Z' } }), false);
  assert.equal(isTimetableEvent({ start: { dateTime: '2026-09-21T23:00:00Z' }, end: { dateTime: '2026-09-22T00:00:00Z' } }), true);
});

test('long events require seven calendar days, including all-day exclusive ends and DST', async () => {
  const { isLongEvent } = await import('../src/widgets/calendar/calendarModel.js');
  assert.equal(isLongEvent(buildEvent(draft)), false);
  assert.equal(isLongEvent(buildEvent({ ...draft, allDay: true, endDate: '2026-09-26' })), false);
  assert.equal(isLongEvent(buildEvent({ ...draft, allDay: true, endDate: '2026-09-27' })), true);
  assert.equal(isLongEvent(buildEvent({ ...draft, endDate: '2026-09-28', endTime: '08:59' })), false);
  assert.equal(isLongEvent(buildEvent({ ...draft, endDate: '2026-09-28', endTime: '09:00' })), true);
  assert.equal(isLongEvent(buildEvent({ ...draft, allDay: true, startDate: '2026-03-25', endDate: '2026-03-31' })), true);
  assert.equal(isLongEvent({}), false);
});
test('long event ordering uses deadlines before end dates and preserves input', async () => {
  const { longEventsByDeadline, eventDeadline } = await import('../src/widgets/calendar/calendarModel.js');
  const a = { id: 'a', ...buildEvent({ ...draft, endDate: '2026-10-20', deadline: '2026-09-25' }) };
  const b = { id: 'b', ...buildEvent({ ...draft, endDate: '2026-10-01', deadline: '' }) };
  const c = { id: 'c', ...buildEvent({ ...draft, allDay: true, endDate: '2026-09-28', deadline: '' }) };
  const input = [b, c, a, buildEvent(draft)];
  assert.deepEqual(longEventsByDeadline(input, new Date(2026, 8, 21)).map(e => e.id), ['a', 'c', 'b']);
  assert.equal(input[0], b);
  assert.equal(localDate(eventDeadline(c)), '2026-09-28');
  assert.deepEqual(longEventsByDeadline(input, new Date(2026, 10, 1)), []);
  assert.equal(longEventsByDeadline(input, new Date(2026, 10, 1), true).length, 3);
});

test('compact week ignores empty gaps, fits dense days and adapts to widget dimensions', async () => {
  const { compactWeekLayout, slotDuration } = await import('../src/widgets/calendar/calendarModel.js');
  const early = buildEvent(draft);
  const late = buildEvent({ ...draft, startTime: '20:00', endTime: '22:00' });
  const days = [[early, late], [], [], [], [], [], []];
  const wide = compactWeekLayout(days, 900, 400);
  assert.equal(wide.columns, 7);
  assert.equal(slotDuration(late), slotDuration(early) * 2);
  assert.ok(Math.max(44, slotDuration(early) * wide.scale) + Math.max(44, slotDuration(late) * wide.scale) + 5 <= 342);
  assert.equal(compactWeekLayout(days, 500, 400).columns, 4);
  assert.equal(compactWeekLayout(days, 250, 400).columns, 2);
  assert.ok(compactWeekLayout(days, 900, 200).scale < wide.scale);
  assert.equal(compactWeekLayout([[early]], 200, 400).columns, 1);
  assert.ok(Number.isFinite(compactWeekLayout([[], [], []], 200, 10).scale));
});
