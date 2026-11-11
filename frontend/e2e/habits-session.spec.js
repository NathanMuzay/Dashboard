import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).first().click();
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('demo@lumi.local');
  await page.getByLabel('Mot de passe', { exact: true }).fill('lumi-demo');
  await page.getByRole('button', { name: /^Se connecter/ }).last().click();
  await expect(page.getByLabel('Dashboard actif')).toBeVisible();
}

test('habits persist across reload, rename, and export with an independent mobile grid', async ({ page }) => {
  await login(page);
  let boardId;
  try {
    await page.getByRole('button', { name: 'Nouveau dashboard', exact: true }).click();
    await page.getByLabel('Nom', { exact: true }).fill(`E2E habitudes ${Date.now()}`);
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByText('Enregistré dans votre compte', { exact: true })).toBeVisible();
    boardId = await page.getByLabel('Dashboard actif').inputValue();
    await page.getByRole('button', { name: /Ajouter un widget/ }).first().click();
    await page.getByRole('button', { name: /^Habitudes · Suivi quotidien/ }).click();
    await page.getByLabel('Nom du widget').fill('Mes rituels');
    await page.getByLabel('Habitude 1', { exact: true }).fill('Lire dix pages');
    await page.getByRole('button', { name: /Ajouter au dashboard/ }).click();
    const tracker = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Mes rituels', exact: true }) });
    const today = await page.evaluate(() => new Date().toLocaleDateString('fr-FR', { weekday:'long',day:'numeric',month:'long',year:'numeric' }));
    await tracker.getByRole('checkbox', { name: `Lire dix pages, ${today}`, exact:true }).check();
    await expect(tracker.getByRole('checkbox', { name: `Bouger, ${today}`, exact:true })).not.toBeChecked();
    await expect(page.getByText('Enregistré dans votre compte', { exact:true })).toBeVisible();
    await page.reload();
    await expect(tracker.getByRole('checkbox', { name: `Lire dix pages, ${today}`, exact:true })).toBeChecked();
    await page.getByRole('button', { name:'Modifier Mes rituels',exact:true }).click();
    await page.getByLabel('Habitude 1', { exact:true }).fill('Lire vingt pages');
    await page.getByRole('button', { name:/Enregistrer les changements/ }).click();
    await expect(tracker.getByRole('checkbox', { name: `Lire vingt pages, ${today}`,exact:true })).toBeChecked();
    await expect(page.getByText('Enregistré dans votre compte', { exact:true })).toBeVisible();
    const boards=await (await page.request.get('/api/dashboards')).json();
    expect(boards.find(b=>b.id===boardId).widgets[0].habits[0].days).toHaveLength(1);
    await tracker.getByRole('button', {name:'Semaine précédente des habitudes'}).click();
    await expect(tracker.getByRole('checkbox', {name:`Lire vingt pages, ${today}`,exact:true})).toHaveCount(0);
    await tracker.getByRole('button', {name:'Cette semaine',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await tracker.screenshot({path:'test-results/habits-mobile.png'});
    await page.setViewportSize({width:1280,height:900});
    await tracker.screenshot({path:'test-results/habits-desktop.png'});
  } finally {
    if(boardId) await page.request.delete(`/api/dashboards/${boardId}`,{headers:{'X-Lumi-Client':'web'}});
  }
});

test('Lumi session survives closing the browser context without copying web storage, and logout clears it', async ({ browser, baseURL }) => {
  const first = await browser.newContext({ baseURL });
  let second;
  try {
    const page = await first.newPage();
    await login(page);
    const state = await first.storageState();
    const cookie = state.cookies.find(c => c.name === 'lumi_session');
    expect(cookie).toMatchObject({ httpOnly:true, sameSite:'Lax', path:'/api' });
    expect(cookie.expires).toBeGreaterThan(Date.now()/1000 + 6*86400);
    expect(await page.evaluate(()=>sessionStorage.getItem('lumi_token'))).toMatch(/^cookie:/);
    expect(await page.evaluate(()=>localStorage.getItem('lumi_token'))).toBeNull();
    await first.close();
    second = await browser.newContext({baseURL,storageState:{cookies:state.cookies,origins:[]}});
    const reopened = await second.newPage();
    await reopened.goto('/');
    await expect(reopened.getByLabel('Dashboard actif')).toBeVisible();
    await reopened.getByRole('button',{name:'Se déconnecter',exact:true}).click();
    await expect(reopened.getByRole('button',{name:'Se connecter',exact:true}).first()).toBeVisible();
    expect((await second.cookies()).some(c=>c.name==='lumi_session')).toBe(false);
    await reopened.reload();
    await expect(reopened.getByRole('button',{name:'Se connecter',exact:true}).first()).toBeVisible();
  } finally {
    await first.close();
    await second?.close();
  }
});

test('disabled services pause stored widgets without deleting their configuration', async ({ page }) => {
  await login(page);
  const headers = { 'X-Lumi-Client': 'web' };
  const before = await (await page.request.get('/api/services')).json();
  let boardId;
  try {
    await page.request.put('/api/services/google_calendar', { headers });
    const response = await page.request.post('/api/dashboards', { headers, data: { name: `E2E pause ${Date.now()}`, widgets: [{ id: 'calendar', type: 'agenda', title: 'Agenda conservé', x: 1, y: 1, width: 6, height: 2 }] } });
    expect(response.status()).toBe(201);
    boardId = (await response.json()).id;
    await page.request.delete('/api/services/google_calendar', { headers });
    await page.reload();
    await page.getByLabel('Dashboard actif').selectOption(boardId);
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Agenda conservé', exact: true }) });
    await expect(card.getByText(/Service désactivé/)).toBeVisible();
    await page.request.put('/api/services/google_calendar', { headers });
    await page.evaluate(() => window.dispatchEvent(new Event('lumi:subscriptions-changed')));
    await expect(card.getByText(/Service désactivé/)).toHaveCount(0);
    await expect(card.getByText(/Chargement du service/)).toHaveCount(0);
    await page.request.delete('/api/services/google_calendar', { headers });
    await page.evaluate(() => window.dispatchEvent(new Event('lumi:subscriptions-changed')));
    await expect(card.getByText(/Service désactivé/)).toBeVisible();
    const boards = await (await page.request.get('/api/dashboards')).json();
    expect(boards.find(b => b.id === boardId).widgets[0].title).toBe('Agenda conservé');
  } finally {
    if (boardId) await page.request.delete(`/api/dashboards/${boardId}`, { headers });
    if (before.includes('google_calendar')) await page.request.put('/api/services/google_calendar', { headers });
  }
});
