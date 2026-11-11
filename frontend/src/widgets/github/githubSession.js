import { clearGitHubCache } from './githubCache.js';
import { SESSION_TOKEN_KEY } from '../../config.js';
const PREFIX = 'lumi_github_session_';
const tokens = new Map();
let owner = null;
function synchronize() {
  for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  const session = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (owner !== session) { tokens.clear(); clearGitHubCache(); owner = session; }
  return session;
}
export function readGitHubToken(userId) {
  return synchronize() && userId ? tokens.get(userId) || '' : '';
}
export function saveGitHubToken(userId, token) {
  if (!synchronize() || !userId) throw new Error('Connectez-vous à Lumi avant de connecter GitHub.');
  clearGitHubCache();
  if (token) tokens.set(userId, token);
  else tokens.delete(userId);
  window.dispatchEvent(new Event('lumi:github-session'));
}
export function clearGitHubSessions() {
  synchronize();
  tokens.clear();
  clearGitHubCache();
  owner = null;
  window.dispatchEvent(new Event('lumi:github-session'));
}
