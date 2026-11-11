import { test, expect } from '@playwright/test';

test('Spotify authorization preserves the dashboard and an existing GitHub connection', async ({ page, context }) => {
  await context.route('https://accounts.spotify.com/authorize**', route => {
    const url = new URL(route.request().url());
    const target = new URL(url.searchParams.get('redirect_uri'));
    target.searchParams.set('state', url.searchParams.get('state'));
    target.searchParams.set('code', 'test-code');
    return route.fulfill({ status: 302, headers: { location: target.href } });
  });
  await context.route('https://accounts.spotify.com/api/token', route => route.fulfill({
    json: { access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600 },
  }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Se connecter', exact: true }).first()).toBeVisible();
  const result = await page.evaluate(async () => {
    const spotify = await import('/src/widgets/spotify/spotifyClient.js');
    const github = await import('/src/widgets/github/githubSession.js');
    sessionStorage.setItem('lumi_token', 'test-session');
    github.saveGitHubToken('test-user', 'existing-github-token');
    window.parentStateMarker = 'still-mounted';
    const locationBefore = location.href;
    await spotify.redirectToSpotifyAuthorize('4700b9e802c748eda0ec5fa4d55c63d1');
    return {
      samePage: location.href === locationBefore,
      marker: window.parentStateMarker,
      githubConnected: github.readGitHubToken('test-user') === 'existing-github-token',
      spotifyConnected: spotify.getStoredAuth()?.accessToken === 'test-token',
    };
  });
  expect(result).toEqual({ samePage: true, marker: 'still-mounted', githubConnected: true, spotifyConnected: true });
});
