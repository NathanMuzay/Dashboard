import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../../poc/dashboard.json', import.meta.url), 'utf8'));

async function setup(page) {
  await page.addInitScript(() => sessionStorage.setItem('lumi_token', 'test-session'));
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    id: 'remediation-user', name: 'Test Soutenance', email: 'test@example.test', email_verified: true,
    role: 'perso', roles: ['perso'], companies: [],
  } }));
  await page.route('**/api/dashboards', route => route.fulfill({ json: [{ ...fixture, id: 'poc-board', revision: 0 }] }));
  await page.route('**/api/services', route => route.fulfill({ json: [] }));
  await page.route('https://geocoding-api.open-meteo.com/**', route => {
    const paris = new URL(route.request().url()).searchParams.get('name').startsWith('Paris');
    return route.fulfill({ json: { results: [{ name: paris ? 'Paris' : 'Lyon', latitude: paris ? 48 : 45, longitude: 2, country: 'France' }] } });
  });
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: {
    current: { temperature_2m: new URL(route.request().url()).searchParams.get('latitude') === '48' ? 0 : 22,
      weather_code: 0, time: '2026-10-05T12:00' }, timezone: 'Europe/Paris',
  } }));
  await page.goto('/');
  await expect(page.getByLabel('Dashboard actif')).toBeVisible();
}

test('remediation: two weather instances display provider values and explicit outage', async ({ page }) => {
  await setup(page);
  await expect(page.getByText('0 °C', { exact: true })).toBeVisible();
  await expect(page.getByText('22 °C', { exact: true })).toBeVisible();
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 503, json: {} }));
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: 'Service météo indisponible.' })).toHaveCount(2);
  await expect(page.getByText('18°', { exact: true })).toHaveCount(0);
});

for (const width of [320, 390, 768]) {
  test(`remediation: mobile ${width}px, reading preferences and keyboard dialog`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page);
    await expect(page.getByText('22 °C', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const opener = page.getByRole('button', { name: 'Accessibilité', exact: true });
    await opener.click();
    await page.getByLabel('Texte agrandi', { exact: true }).check();
    await page.getByLabel('Contraste renforcé', { exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-large-text', 'true');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('dialog'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/remediation-dashboard-${width}.png`, fullPage: true });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-large-text', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');
    await page.getByRole('button', { name: 'Mon compte', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Vos données', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/remediation-mobile-${width}.png`, fullPage: true });
  });
}
