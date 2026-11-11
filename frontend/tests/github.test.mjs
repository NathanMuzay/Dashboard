import test, { beforeEach } from 'node:test';
import { clearGitHubCache } from '../src/widgets/github/githubCache.js';
beforeEach(clearGitHubCache);
import assert from 'node:assert/strict';
import { parseRepository, layoutGraph, loadPushes, githubRequest } from '../src/widgets/github/githubClient.js';
const commit = (sha, parents, date = '2026-01-01') => ({ sha, parents: parents.map(sha => ({ sha })), commit: { message: sha, committer: { date } } });

test('repository input normalizes URLs and rejects foreign hosts and paths', () => {
  assert.equal(parseRepository(' https://github.com/owner/repo.git/ '), 'owner/repo');
  for (const input of ['https://evil.test/a/b', 'a/b/../../x', 'a', 'a/..', 'a/b?token=secret']) assert.throws(() => parseRepository(input));
});
test('graph orders children before parents despite dates, draws merge and shared ancestor', () => {
  const data = layoutGraph([commit('root', [], '2027-01-01'), commit('left', ['root']), commit('merge', ['left', 'right']), commit('right', ['root'])]);
  assert.equal(data.rows[0].sha, 'merge');
  assert.equal(data.rows.at(-1).sha, 'root');
  assert.equal(data.rows[0].incoming, false);
  assert.equal(data.rows[0].links.length, 2);
  assert.ok(data.width >= 2);
  assert.equal(new Set(data.rows.map(row => row.sha)).size, 4);
  assert.ok(data.rows.every(row => row.continuations.every(edge => edge.to >= 0)));
});
test('graph marks missing parents without adding fake commits', () => {
  const data = layoutGraph([commit('tip', ['missing'])]);
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].links[0].missing, true);
});
test('pushes paginate past other events and use pushing actor rather than commit author', async () => {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(url);
    const data = new URL(url).searchParams.get('page') === '1' ? Array.from({ length: 100 }, () => ({ type: 'WatchEvent' })) : new URL(url).searchParams.get('page') === '2' ? [{ id: '1', type: 'PushEvent', actor: { login: 'pusher' }, payload: { head: 'abc', ref: 'refs/heads/feature/test' }, created_at: '2026-01-01' }] : { commit: { message: 'Subject\nDetails', author: { name: 'other' } } };
    return { ok: true, json: async () => data };
  };
  try {
    const pushes = await loadPushes('owner/repo', 1, '');
    assert.equal(pushes[0].actor, 'pusher');
    assert.equal(pushes[0].branch, 'feature/test');
    assert.equal(pushes[0].title, 'Subject');
    assert.equal(urls.length, 3);
  } finally { globalThis.fetch = original; }
});
test('GitHub errors identify invalid tokens, private repositories and quotas', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, expected] of [[401, /invalide/], [404, /privé/], [429, /Quota/]]) {
      globalThis.fetch = async () => ({ ok: false, status, headers: new Headers() });
      await assert.rejects(githubRequest('owner/repo', 'events'), expected);
    }
  } finally { globalThis.fetch = original; }
});
