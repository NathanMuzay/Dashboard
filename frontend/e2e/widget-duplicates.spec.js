import { test, expect } from '@playwright/test';

test('case-only duplicates are rejected on creation and editing; editing the same widget stays valid', async ({ page }) => {
  await page.route('**/api/services', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { default: DashboardWidgets } = await import('/src/dashboard/DashboardWidgets.jsx');
    function Harness() {
      const [widgets, setWidgets] = React.useState([
        { id: 'a', type: 'notes', title: 'Alpha', content: 'Bonjour', x: 1, y: 1, width: 6, height: 2 },
        { id: 'b', type: 'notes', title: 'Beta', content: 'Autre', x: 7, y: 1, width: 6, height: 2 },
      ]);
      window.duplicateTestWidgets = widgets;
      return React.createElement(DashboardWidgets, { userId: 'duplicate-test', widgets, onWidgetsChange: setWidgets });
    }
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    createRoot(host).render(React.createElement(Harness));
  });
  await page.getByRole('button', { name: 'Ajouter un widget', exact: true }).click();
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await page.getByLabel('Nom du widget').fill(' ALPHA ');
  await page.getByLabel('Contenu', { exact: true }).fill(' bonjour ');
  await page.getByRole('button', { name: /Ajouter au dashboard/ }).click();
  await expect(page.getByRole('alert')).toContainText('Un widget avec les mêmes paramètres existe déjà');
  expect(await page.evaluate(() => window.duplicateTestWidgets.length)).toBe(2);
  await page.getByRole('button', { name: 'Fermer la fenêtre', exact: true }).click();

  await page.getByRole('button', { name: 'Modifier Beta', exact: true }).click();
  await page.getByLabel('Nom du widget').fill('alpha');
  await page.getByLabel('Contenu', { exact: true }).fill('BONJOUR');
  await page.getByRole('button', { name: /Enregistrer les changements/ }).click();
  await expect(page.getByRole('alert')).toContainText('Un widget avec les mêmes paramètres existe déjà');
  await expect(page.getByRole('heading', { name: 'Beta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer la fenêtre', exact: true }).click();

  await page.getByRole('button', { name: 'Modifier Alpha', exact: true }).click();
  await page.getByLabel('Nom du widget').fill('ALPHA');
  await page.getByRole('button', { name: /Enregistrer les changements/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'ALPHA', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.duplicateTestWidgets[0].content)).toBe('Bonjour');
});
