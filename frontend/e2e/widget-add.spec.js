import { test, expect } from '@playwright/test';

test('a new service is visible, can be activated, and its widget is saved', async ({ page }) => {
  let activated = false;
  let saved;
  const dashboard = { id: 'test-board', name: 'Test', widgets: [], revision: 1 };
  await page.route('**/api/dashboards', route => route.fulfill({ json: [dashboard] }));
  await page.route('**/api/dashboards/test-board', route => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { ...dashboard, ...saved, revision: 2 } });
  });
  await page.route('**/api/services', route => route.fulfill({ json: [] }));
  await page.route('**/api/services/openai', route => {
    activated = route.request().method() === 'PUT';
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/ai/status', route => route.fulfill({ json: { configured: false } }));
  await page.goto('/');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: Dashboard } = await import('/src/dashboard/WidgetDashboard.jsx');
    const host = document.createElement('div');
    document.body.append(host);
    createRoot(host).render(React.createElement(Dashboard, { userId: 'test-user' }));
  });
  await page.getByRole('button', { name: 'Ajouter un widget' }).click();
  await page.getByRole('button', { name: /Assistant IA local · Poser/ }).click();
  const add = page.getByRole('button', { name: /Ajouter au dashboard/ });
  await expect(add).toBeDisabled();
  await page.getByRole('button', { name: 'Activer le service Ollama', exact: true }).click();
  await expect(add).toBeEnabled();
  expect(activated).toBe(true);
  await add.click();
  await expect(page.getByRole('heading', { name: 'Assistant IA local · Poser une question' })).toBeVisible();
  await expect.poll(() => saved?.widgets?.[0]?.type).toBe('openai_chat');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
