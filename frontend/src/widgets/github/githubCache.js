const entries = new Map();
const blocked = new Map();
export function clearGitHubCache() { entries.clear(); blocked.clear(); }
export function cachedGitHub(key) {
  const entry = entries.get(key);
  if (!entry || entry.expires <= Date.now()) { entries.delete(key); return null; }
  return structuredClone(entry.value);
}
export function cacheGitHub(key, value) {
  if (entries.size >= 100) entries.delete(entries.keys().next().value);
  entries.set(key, { value: structuredClone(value), expires: Date.now() + 30000 });
}
export function blockGitHub(token, until) { blocked.set(token, Math.max(Date.now() + 60000, Math.min(until || 0, Date.now() + 3600000))); }
export function githubBlocked(token) { return (blocked.get(token) || 0) > Date.now(); }
