import { SESSION_TOKEN_KEY } from './config.js';

const CHANGE_KEY = 'lumi_session_changed';
export function sessionOwner() { return sessionStorage.getItem(SESSION_TOKEN_KEY); }
export function legacyToken() {
  const value = sessionOwner();
  return value && !value.startsWith('cookie:') ? value : null;
}
export function accountId() {
  const value = sessionOwner();
  return value?.startsWith('cookie:') ? value.split(':')[1] : null;
}
function announce() {
  try { localStorage.setItem(CHANGE_KEY, crypto.randomUUID()); } catch { /* Storage may be disabled. */ }
}
export function rememberUser(user, broadcast = true) {
  sessionStorage.setItem(SESSION_TOKEN_KEY, `cookie:${user.id}:${user.session_tag || "mock"}`);
  if (broadcast) announce();
}
export function clearSession(broadcast = false) {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  if (broadcast) announce();
}
export function isSessionChange(event) { return event.key === CHANGE_KEY; }
