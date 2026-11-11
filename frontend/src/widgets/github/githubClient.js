import { cachedGitHub, cacheGitHub, blockGitHub, githubBlocked } from './githubCache.js';
export function parseRepository(value = '') {
  const clean = value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').replace(/\.git$/, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(clean) || clean.split('/')[1] === '..') {
    throw new Error('Indiquez un dépôt au format propriétaire/dépôt ou son URL GitHub.');
  }
  return clean;
}
export const pushLimit = value => Math.min(20, Math.max(1, Math.floor(Number(value) || 5)));
export async function githubRequest(repo, path, token = '', signal) {
  const key = JSON.stringify([token, parseRepository(repo), path]);
  if (signal?.aborted) throw new DOMException('Requête annulée', 'AbortError');
  const cached = cachedGitHub(key);
  if (cached !== null) return cached;
  if (githubBlocked(token)) throw new Error('Quota GitHub atteint. Patientez avant de réessayer.');
  const response = await fetch(`https://api.github.com/repos/${parseRepository(repo)}/${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal,
    redirect: 'error',
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Jeton GitHub invalide ou expiré.');
    if (response.status === 404) throw new Error('Dépôt introuvable ou privé. Vérifiez son nom et les droits du jeton.');
    if (response.status === 409) throw new Error('Ce dépôt ne contient pas encore de commits.');
    if (response.status === 429 || response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      blockGitHub(token, reset * 1000);
      throw new Error(`Quota GitHub atteint.${reset ? ` Réessayez après ${new Date(reset * 1000).toLocaleTimeString('fr-FR')}.` : ' Réessayez plus tard.'} Un jeton augmente le quota des accès publics.`);
    }
    if (response.status === 403) throw new Error('Accès GitHub refusé. Vérifiez les permissions du jeton ou réessayez plus tard.');
    throw new Error('GitHub est indisponible. Réessayez.');
  }
  const data = await response.json();
  cacheGitHub(key, data);
  return data;
}
export async function loadPushes(repo, count, token, signal) {
  const events = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await githubRequest(repo, `events?per_page=100&page=${page}`, token, signal);
    events.push(...batch.filter(event => event.type === 'PushEvent'));
    if (events.length >= pushLimit(count) || batch.length < 100) break;
  }
  const pushes = [];
  // Sequential requests avoid bursts against GitHub's secondary rate limits.
  for (const event of events.slice(0, pushLimit(count))) {
    const sha = event.payload?.head;
    let title = event.payload?.commits?.at(-1)?.message?.split('\n')[0];
    if (!title && sha) {
      try {
        const commit = await githubRequest(repo, `commits/${encodeURIComponent(sha)}`, token, signal);
        title = commit.commit.message.split('\n')[0];
      } catch (err) {
        if (signal?.aborted || !err.message.startsWith('Dépôt introuvable')) throw err;
        // Force-pushed or removed commits may no longer be available.
      }
    }
    pushes.push({ id: event.id, title: title || `Push ${sha?.slice(0, 7) || ''}`, sha,
      branch: (event.payload?.ref || '').replace(/^refs\/heads\//, ''),
      actor: event.actor?.login || 'Utilisateur inconnu', date: event.created_at });
  }
  return pushes;
}

// Kahn ordering ensures that every visible child precedes its parents, even
// when commit dates are skewed. Lane transitions then follow actual parent SHAs.
export function layoutGraph(commits) {
  const map = new Map(commits.map(commit => [commit.sha, commit]));
  const children = new Map([...map.keys()].map(sha => [sha, 0]));
  for (const commit of map.values()) for (const parent of commit.parents || []) {
    if (children.has(parent.sha)) children.set(parent.sha, children.get(parent.sha) + 1);
  }
  const ready = [...map.values()].filter(commit => children.get(commit.sha) === 0);
  const ordered = [];
  while (ready.length) {
    ready.sort((a, b) => (b.commit?.committer?.date || '').localeCompare(a.commit?.committer?.date || '') || a.sha.localeCompare(b.sha));
    const current = ready.shift();
    ordered.push(current);
    for (const parent of current.parents || []) if (children.has(parent.sha)) {
      children.set(parent.sha, children.get(parent.sha) - 1);
      if (children.get(parent.sha) === 0) ready.push(map.get(parent.sha));
    }
  }
  let lanes = [];
  let width = 1;
  const rows = ordered.map(commit => {
    let lane = lanes.indexOf(commit.sha);
    const incoming = lane >= 0;
    if (lane < 0) { lane = lanes.indexOf(null); if (lane < 0) lane = lanes.length; lanes[lane] = commit.sha; }
    const before = [...lanes];
    const next = [...lanes]; next[lane] = null;
    const links = [];
    for (const parent of commit.parents || []) {
      let target = next.indexOf(parent.sha);
      if (target < 0) { target = next.indexOf(null); if (target < 0) target = next.length; next[target] = parent.sha; }
      links.push({ from: lane, to: target, missing: !map.has(parent.sha) });
    }
    const continuations = before.flatMap((sha, index) => sha && index !== lane ? [{ from: index, to: next.indexOf(sha) }] : []);
    width = Math.max(width, next.length, before.length);
    // Unknown parents terminate visibly at this row instead of inventing history.
    lanes = next.map(sha => map.has(sha) ? sha : null);
    while (lanes.at(-1) === null) lanes.pop();
    return { ...commit, lane, incoming, links, continuations };
  });
  return { rows, width };
}
export async function loadGraph(repo, token, signal) {
  const branches = await githubRequest(repo, 'branches?per_page=100', token, signal);
  if (!branches.length) return { rows: [], width: 1, branches: [], truncated: false };
  const selected = branches.slice(0, 8);
  const commits = new Map();
  let truncated = branches.length > 8;
  for (const branch of selected) {
    const history = await githubRequest(repo, `commits?sha=${encodeURIComponent(branch.commit.sha)}&per_page=40`, token, signal);
    if (history.length === 40) truncated = true;
    for (const commit of history) commits.set(commit.sha, commit);
  }
  return { ...layoutGraph([...commits.values()]), branches: selected, truncated };
}
