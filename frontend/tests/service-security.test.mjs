import test from 'node:test';
import assert from 'node:assert/strict';
function storage() {
  return { getItem(key) { return this[key] ?? null; }, setItem(key, value) { this[key] = String(value); }, removeItem(key) { delete this[key]; } };
}
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
const spotify = await import('../src/widgets/spotify/spotifyClient.js');
const github = await import('../src/widgets/github/githubSession.js');

test('Spotify tokens stay in memory and cannot cross Lumi sessions', () => {
  sessionStorage.setItem('lumi_token', 'alice');
  localStorage.setItem('lumi_spotify_auth', '{"accessToken":"legacy"}');
  assert.equal(spotify.getStoredAuth(), null);
  assert.equal(localStorage.getItem('lumi_spotify_auth'), null);
  spotify.saveStoredAuth({ accessToken: 'private' });
  assert.equal(spotify.getStoredAuth().accessToken, 'private');
  assert.equal(localStorage.getItem('lumi_spotify_auth'), null);
  sessionStorage.setItem('lumi_token', 'bob');
  assert.equal(spotify.getStoredAuth(), null);
  assert.throws(() => spotify.saveStoredAuth({ accessToken: 'late' }, 'alice'));
  spotify.clearStoredAuth();
});

test('Spotify refuses bearer-token exfiltration to another origin', async () => {
  sessionStorage.setItem('lumi_token', 'alice');
  spotify.saveStoredAuth({ accessToken: 'private', expiresAt: Date.now() + 60000 });
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('Unexpected fetch'); };
  await assert.rejects(spotify.spotifyFetch('https://evil.example/v1/me'), /interdite/);
  assert.equal(called, false);
  spotify.clearStoredAuth();
});

test('GitHub tokens stay in memory, clear legacy storage and reset on account changes', () => {
  sessionStorage.setItem('lumi_token', 'alice');
  sessionStorage.setItem('lumi_github_session_alice', 'legacy');
  assert.equal(github.readGitHubToken('alice'), '');
  assert.equal(sessionStorage.getItem('lumi_github_session_alice'), null);
  github.saveGitHubToken('alice', 'private');
  assert.equal(github.readGitHubToken('alice'), 'private');
  assert.equal(sessionStorage.getItem('lumi_github_session_alice'), null);
  sessionStorage.setItem('lumi_token', 'bob');
  assert.equal(github.readGitHubToken('alice'), '');
  github.saveGitHubToken('bob', 'private-bob');
  github.clearGitHubSessions();
  assert.equal(github.readGitHubToken('bob'), '');
});


test('Spotify accepts a pasted env assignment without sending its variable name as the client ID', () => {
  const id = '4700b9e802c748eda0ec5fa4d55c63d1';
  assert.equal(spotify.getSpotifyClientId(`VITE_SPOTIFY_CLIENT_ID=${id}`), id);
  assert.equal(spotify.getSpotifyClientId(` VITE_SPOTIFY_CLIENT_ID="${id}" `), id);
  localStorage.setItem('lumi_spotify_client_id', `VITE_SPOTIFY_CLIENT_ID=${id}`);
  assert.equal(spotify.getSpotifyClientId(), id);
  localStorage.removeItem('lumi_spotify_client_id');
  assert.throws(() => spotify.getSpotifyClientId('https://accounts.spotify.com/authorize?client_id=wrong'), /uniquement/);
});
