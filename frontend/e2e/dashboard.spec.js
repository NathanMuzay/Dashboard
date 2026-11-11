import { test, expect } from '@playwright/test';
async function login(page) {
  await page.goto('/');
  await page.getByRole('button',{name:'Se connecter',exact:true}).first().click();
  await page.getByLabel('Adresse e-mail',{exact:true}).fill('demo@lumi.local');
  await page.getByLabel('Mot de passe',{exact:true}).fill('lumi-demo');
  await page.getByRole('button',{name:/^Se connecter/}).last().click();
  await expect(page.getByLabel('Dashboard actif')).toBeVisible();
}
test('dashboard editing, persistence, multiple instances, export/import and services',async ({page}) => {
  const errors=[];page.on('pageerror',error => errors.push(error.message));
  await login(page);
  await page.getByRole('button',{name:'Nouveau dashboard',exact:true}).click();
  await page.getByLabel('Nom',{exact:true}).fill(`E2E ${Date.now()}`);
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByText('Enregistré dans votre compte',{exact:true})).toBeVisible();
  for (const title of ['Note A','Note B']) {
    await page.getByRole('button',{name:'Ajouter un widget',exact:false}).first().click();
    await page.getByRole('button',{name:'Notes',exact:false}).last().click();
    await page.getByLabel('Nom du widget').fill(title);
    await page.getByLabel('Contenu',{exact:true}).fill(`Contenu ${title}`);
    await page.getByRole('button',{name:/Ajouter au dashboard/}).click();
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(page.getByText('Enregistré dans votre compte',{exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'Modifier Note A',exact:true}).click();
  await page.getByLabel('Nom du widget').fill('Note modifiée');
  await page.getByText('Taille et position',{exact:true}).click();
  await page.getByLabel('Position verticale').fill('10');
  await page.getByRole('button',{name:/Enregistrer les changements/}).click();
  await expect(page.getByText('Enregistré dans votre compte',{exact:true})).toBeVisible();
  const id=await page.getByLabel('Dashboard actif').inputValue();
  await page.reload();
  await page.getByLabel('Dashboard actif').selectOption(id);
  await expect(page.getByRole('heading',{name:'Note modifiée',exact:true})).toBeVisible();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter',exact:true}).click();
  const download=await downloadPromise;const path=await download.path();
  await page.getByLabel('Importer un dashboard').setInputFiles(path);
  await expect(page.getByLabel('Dashboard actif')).not.toHaveValue(id);
  await expect(page.getByRole('heading',{name:'Note B',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Supprimer Note B',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Note B',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Note B',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mon compte',exact:false}).click();
  const githubToggle = page.getByRole('button', { name: /^(Activer|Désactiver) GitHub$/ });
  await expect(githubToggle).toBeVisible();
  if (await githubToggle.getAttribute('aria-pressed') === 'false') await githubToggle.click();
  await expect(page.getByRole('button',{name:'Désactiver GitHub',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tableau de bord',exact:false}).click();
  await page.getByRole('button',{name:'Ajouter un widget',exact:false}).first().click();
  await page.getByLabel('Rechercher un widget').fill('GitHub');
  await expect(page.getByRole('button',{name:/GitHub · Push/})).toBeVisible();
  expect(errors).toEqual([]);
});
test('mobile account and dashboard fit the viewport',async ({page}) => {
  await page.setViewportSize({width:390,height:844});await login(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Mon compte',exact:false}).click();
  await expect(page.getByRole('heading',{name:'Mes services'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('save conflicts preserve local edits and provide recovery',async ({page}) => {
  await login(page);
  await page.route('**/api/dashboards/*',route => route.request().method()==='PUT' ? route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Dashboard modifié ailleurs. Rechargez la sauvegarde.'})}) : route.continue());
  await page.getByRole('button',{name:'Renommer',exact:true}).click();
  await page.getByLabel('Nom',{exact:true}).fill('Conflit local');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByText('Dashboard modifié ailleurs. Rechargez la sauvegarde.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Exporter',exact:true})).toBeEnabled();
  await expect(page.getByLabel('Dashboard actif')).toBeDisabled();
  await page.getByRole('button',{name:'Recharger la version serveur',exact:true}).click();
  await page.getByRole('button',{name:'Confirmer',exact:true}).click();
  await expect(page.getByText('Enregistré dans votre compte',{exact:true})).toBeVisible();
});
test('GitHub outage is explicit and loading recovers without losing configuration',async ({page}) => {
  // Mock before restoring existing widgets so real requests cannot exhaust the shared quota.
  await page.route('https://api.github.com/**',route=>route.fulfill({status:503,body:'Unavailable'}));
  await login(page);
  await page.getByRole('button',{name:'Mon compte',exact:false}).click();
  const githubToggle = page.getByRole('button', { name: /^(Activer|Désactiver) GitHub$/ });
  await expect(githubToggle).toBeVisible();
  if (await githubToggle.getAttribute('aria-pressed') === 'false') await githubToggle.click();
  await expect(page.getByRole('button',{name:'Désactiver GitHub',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Tableau de bord',exact:false}).click();
  await page.getByRole('button',{name:'Nouveau dashboard',exact:true}).click();
  await page.getByLabel('Nom',{exact:true}).fill(`E2E panne ${Date.now()}`);
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByText('Enregistré dans votre compte',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ajouter un widget',exact:false}).first().click();
  await page.getByRole('button',{name:/GitHub · Push/}).click();
  await page.getByLabel('Nom du widget').fill(`GitHub test ${Date.now()}`);
  await page.getByLabel('Dépôt GitHub',{exact:true}).fill('lumi-e2e/offline-test');
  await page.getByRole('button',{name:/Ajouter au dashboard/}).click();
  await expect(page.getByText('GitHub est indisponible. Réessayez.',{exact:true})).toBeVisible();
  await expect(page.getByText('Enregistré dans votre compte',{exact:true})).toBeVisible();
});

test('edits made while a save is in flight are saved before reporting success',async ({page}) => {
  await login(page);
  await page.getByRole('button',{name:'Nouveau dashboard',exact:true}).click();
  await page.getByLabel('Nom',{exact:true}).fill(`E2E rapide ${Date.now()}`);
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await page.getByRole('button',{name:'Ajouter un widget',exact:false}).first().click();
  await page.getByRole('button',{name:'Notes',exact:false}).last().click();
  await page.getByLabel('Nom du widget').fill('Saisie rapide');
  await page.getByRole('button',{name:/Ajouter au dashboard/}).click();
  await expect(page.getByText('Enregistré dans votre compte',{exact:true})).toBeVisible();
  let release;
  let intercept=true;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/dashboards/*',async route=>{
    if(intercept && route.request().method()==='PUT') {intercept=false;await gate;}
    await route.continue();
  });
  await page.getByLabel('Contenu de Saisie rapide').fill('Première version');
  await expect(page.getByText('Synchronisation…',{exact:true})).toBeVisible();
  await page.getByLabel('Contenu de Saisie rapide').fill('Dernière version');
  release();
  await expect(page.getByText('Enregistré dans votre compte',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Contenu de Saisie rapide')).toHaveValue('Dernière version');
});
test.afterEach(async ({page}) => {
  const headers={'X-Lumi-Client':'web'};
  const response=await page.request.get('/api/dashboards',{headers});
  if (!response.ok()) return;
  for (const item of await response.json()) {
    if (item.name.startsWith('E2E ')) await page.request.delete(`/api/dashboards/${item.id}`,{headers});
  }
});
