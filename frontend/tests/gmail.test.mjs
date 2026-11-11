import test from 'node:test';
import assert from 'node:assert/strict';
import { gmailRequest, listUnread, messageChange, mailLimit, gmailLink } from '../src/widgets/gmail/gmailClient.js';

test('Gmail actions affect only the intended labels', () => {
  assert.deepEqual(messageChange('read'), { removeLabelIds: ['UNREAD'] });
  assert.deepEqual(messageChange('archive'), { removeLabelIds: ['INBOX'] });
  assert.deepEqual(messageChange('spam'), { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] });
  assert.throws(() => messageChange('delete'));
  assert.equal(mailLimit(99), 20);
  assert.equal(mailLimit(-1), 1);
  assert.equal(mailLimit(undefined), 5);
});
test('Gmail links select the configured account and encode identifiers', () => {
  const url = new URL(gmailLink('person+test@gmail.com', 'abc/def'));
  assert.equal(url.searchParams.get('authuser'), 'person+test@gmail.com');
  assert.equal(url.hash, '#all/abc%2Fdef');
  assert.equal(new URL(gmailLink()).hash, '#inbox?compose=new');
});
test('list requests only unread inbox messages and ignores messages changed since listing', async () => {
  const original = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (url, options) => {
    paths.push(new URL(url));
    assert.equal(options.headers.Authorization, 'Bearer token');
    return { ok: true, json: async () => paths.length === 1 ? { messages: [{ id: 'one' }, { id: 'two' }] } : {
      id: url.includes('/one?') ? 'one' : 'two', labelIds: url.includes('/one?') ? ['INBOX', 'UNREAD'] : ['INBOX'],
    } };
  };
  try {
    const result = await listUnread({ token: 'token', expiresAt: Date.now() + 60000 }, 7);
    assert.equal(paths[0].searchParams.get('q'), 'in:inbox is:unread');
    assert.equal(paths[0].searchParams.get('maxResults'), '7');
    assert.deepEqual(result.map(item => item.id), ['one']);
  } finally { globalThis.fetch = original; }
});
test('expired sessions fail before contacting Gmail; API errors are actionable', async () => {
  await assert.rejects(gmailRequest({ expiresAt: 0 }, 'profile'), /expirée/);
  const original = globalThis.fetch;
  try {
    for (const [status, expected] of [[401, /expirée/], [403, /refusé/], [429, /Trop de requêtes/]]) {
      globalThis.fetch = async () => ({ ok: false, status });
      await assert.rejects(gmailRequest({ token: 'test', expiresAt: Date.now() + 60000 }, 'profile'), expected);
    }
  } finally { globalThis.fetch = original; }
});

test('outgoing MIME preserves Unicode, recipients and multiline body', async () => {
  const { buildRawMessage } = await import('../src/widgets/gmail/gmailClient.js');
  const raw = buildRawMessage({ to: 'alice@example.com, bob@example.com', cc: 'cc@example.com', bcc: 'secret@example.com', subject: 'Été ☀️', body: 'Bonjour à tous !\nÇa va ? 🐈' });
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /To: alice@example.com, bob@example.com\r\n/);
  assert.match(mime, /Cc: cc@example.com\r\nBcc: secret@example.com/);
  const encodedSubject = mime.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1];
  assert.equal(Buffer.from(encodedSubject, 'base64').toString(), 'Été ☀️');
  assert.equal(Buffer.from(mime.split('\r\n\r\n')[1], 'base64').toString(), 'Bonjour à tous !\r\nÇa va ? 🐈');
  assert.throws(() => buildRawMessage({ to: 'a@example.com\r\nBcc: stolen@example.com' }), /invalide/);
  assert.throws(() => buildRawMessage({ to: '' }), /destinataire/);
  assert.throws(() => buildRawMessage({ to: 'invalid' }), /adresses/);
  assert.throws(() => buildRawMessage({ to: 'a@example.com', subject: 'x\nBcc: b@example.com' }), /une seule ligne/);
});
test('send uses Gmail POST once and propagates failures without automatic retry', async () => {
  const { sendGmailMessage } = await import('../src/widgets/gmail/gmailClient.js');
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
      assert.equal(options.method, 'POST');
      assert.ok(JSON.parse(options.body).raw);
      return { ok: false, status: 500 };
    };
    await assert.rejects(sendGmailMessage({ token: 'test', expiresAt: Date.now() + 60000 }, { to: 'a@example.com', body: 'Hello' }));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('403 errors distinguish disabled API, missing scope and quota', async () => {
  const original = globalThis.fetch;
  try {
    for (const [reason, expected] of [['SERVICE_DISABLED', /API Gmail désactivée/], ['accessNotConfigured', /API Gmail désactivée/], ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', /insuffisante/], ['userRateLimitExceeded', /Quota Gmail/]]) {
      globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { details: [{ reason }] } }) });
      await assert.rejects(gmailRequest({ token: 'test', expiresAt: Date.now() + 60000 }, 'profile'), expected);
    }
  } finally { globalThis.fetch = original; }
});
