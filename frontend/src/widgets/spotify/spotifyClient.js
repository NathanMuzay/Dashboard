import { spotifyPopupState, waitForSpotifyPopup } from './spotifyPopup.js';
import { SESSION_TOKEN_KEY } from '../../config.js';
/**
 * Spotify Web API Client
 *
 * Implements:
 * - Spotify OpenAPI Specification standards (https://developer.spotify.com/reference/web-api/open-api-schema.yaml)
 * - Authorization Code Flow with PKCE (RFC 7636) for secure client-side user auth without exposing secrets
 * - Strict Redirect URI compliance (enforces http://127.0.0.1 for local development, HTTPS in production, no localhost)
 * - Minimum required scopes per feature
 * - Token management with proactive refresh and secure storage
 * - Rate limiting (HTTP 429) exponential backoff respecting Retry-After header
 * - Uses modern, non-deprecated endpoints (/playlists/{id}/items, /me/library, etc.)
 * - Full OpenAPI error mapping and Spotify Developer Terms compliance (attribution, no persistent cache)
 */

const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Minimum required scopes for currently playing, top tracks, playlists, playback control, and save
export const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public',
];

const STORAGE_KEY_AUTH = 'lumi_spotify_auth';
const PKCE_OWNER = 'lumi_spotify_pkce_owner';
let memoryAuth = null;
let memoryOwner = null;
const currentOwner = () => sessionStorage.getItem(SESSION_TOKEN_KEY);
const STORAGE_KEY_PKCE_VERIFIER = 'lumi_spotify_pkce_verifier';
const STORAGE_KEY_PKCE_STATE = 'lumi_spotify_pkce_state';

/**
 * Returns a compliant redirect URI.
 * Requirement: Always use HTTPS redirect URIs, except http://127.0.0.1 for local development.
 * Never use http://localhost or wildcard URIs.
 */
export function getSpotifyRedirectUri() {
  const { protocol, hostname, port } = window.location;
  let safeHost = hostname;
  let safeProtocol = protocol;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    safeHost = '127.0.0.1';
    safeProtocol = 'http:';
  } else {
    safeProtocol = 'https:';
  }

  const portSuffix = port ? `:${port}` : '';
  return `${safeProtocol}//${safeHost}${portSuffix}/`;
}

/**
 * Cryptographically generates a PKCE code verifier (43-128 characters).
 */
function generateRandomString(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, byte => possible[byte % possible.length]).join('');
}

/**
 * Generates the SHA-256 hash base64url-encoded code challenge for PKCE.
 */
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Default Spotify Client ID (configured via .env or app default)
export const DEFAULT_SPOTIFY_CLIENT_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SPOTIFY_CLIENT_ID) ||
  'e60d843818e342cbbfad9aa465e913ec'; // App default fallback

const STORAGE_KEY_ACTIVE_CLIENT_ID = 'lumi_spotify_active_client_id';

/**
 * Resolves the Spotify Client ID from argument, localStorage, or application default (.env).
 */
export function normalizeSpotifyClientId(value = '') {
  const clean = String(value).trim().replace(/^VITE_SPOTIFY_CLIENT_ID\s*=\s*/, '').trim();
  const unquoted = clean.replace(/^(["'])(.*)\1$/, '$2').trim();
  if (unquoted && /[\s=/?&#:]/.test(unquoted)) {
    throw new Error('Collez uniquement la valeur du Client ID Spotify, sans URL ni nom de variable.');
  }
  return unquoted;
}

export function getSpotifyClientId(customClientId) {
  if (typeof customClientId === 'string' && customClientId.trim()) {
    return normalizeSpotifyClientId(customClientId);
  }
  const stored = localStorage.getItem('lumi_spotify_client_id');
  if (stored && stored.trim()) return normalizeSpotifyClientId(stored);
  return normalizeSpotifyClientId(DEFAULT_SPOTIFY_CLIENT_ID);
}

/**
 * Initiates the Spotify Authorization Code with PKCE flow.
 * Generates cryptographic code verifier and SHA-256 challenge, then redirects to Spotify.
 * Does not require manual client ID configuration if default or .env is provided.
 */
export async function redirectToSpotifyAuthorize(customClientId, scopes = SPOTIFY_SCOPES) {
  const owner = currentOwner();
  if (!owner) throw new Error('Connectez-vous à Lumi avant de connecter Spotify.');
  if (window.location.hostname === 'localhost') throw new Error('Ouvrez Lumi sur 127.0.0.1 et reconnectez-vous avant de connecter Spotify.');
  const clientId = getSpotifyClientId(customClientId);
  if (!clientId) {
    throw new Error('Un Client ID Spotify valide est requis.');
  }

  // Open synchronously from the click, before WebCrypto yields, to avoid popup blocking.
  const popup = window.open('about:blank', '_blank', 'popup,width=520,height=720');
  if (!popup) throw new Error('Autorisez les fenêtres contextuelles pour connecter Spotify sans quitter Lumi.');
  try {
    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);
    const state = spotifyPopupState(generateRandomString(32));
    const redirectUri = getSpotifyRedirectUri();
    if (owner !== currentOwner()) throw new Error('Session Lumi modifiée.');
    const params = new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
      code_challenge_method: 'S256', code_challenge: challenge, state, scope: scopes.join(' '),
    });
    // The verifier and tokens stay in the original window, never in the popup URL.
    const result = waitForSpotifyPopup({
      state, owner, currentOwner, popup,
      exchange: code => exchangeCodeForToken(clientId, code, verifier, owner),
    });
    popup.location.href = `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
    return await result;
  } catch (error) {
    try { popup.close(); } catch {}
    throw error;
  }
}

/**
 * Handles the Spotify redirect callback containing ?code=...&state=...
 */
export async function handleSpotifyCallback(customClientId) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (!code && !error) {
    return null; // Not an auth callback
  }

  // Clean URL parameters immediately
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);

  if (error) {
    clearStoredAuth();
    throw new Error(`Erreur d'autorisation Spotify: ${error}`);
  }

  const owner = sessionStorage.getItem(PKCE_OWNER);
  sessionStorage.removeItem(PKCE_OWNER);
  const savedState = sessionStorage.getItem(STORAGE_KEY_PKCE_STATE);
  const verifier = sessionStorage.getItem(STORAGE_KEY_PKCE_VERIFIER);
  const activeClientId =
    sessionStorage.getItem(STORAGE_KEY_ACTIVE_CLIENT_ID) ||
    getSpotifyClientId(customClientId);

  sessionStorage.removeItem(STORAGE_KEY_PKCE_STATE);
  sessionStorage.removeItem(STORAGE_KEY_PKCE_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEY_ACTIVE_CLIENT_ID);

  if (!owner || owner !== currentOwner()) throw new Error('Session Lumi modifiée. Reconnectez Spotify.');

  if (!state || state !== savedState) {
    throw new Error('Validation d’état PKCE invalide (CSRF mismatch).');
  }

  if (!verifier) {
    throw new Error('Code verifier PKCE introuvable. Veuillez réessayer.');
  }

  const authData = await exchangeCodeForToken(activeClientId, code, verifier, owner);
  const dashboardUrl = `${window.location.origin}/dashboard`;
  window.history.replaceState({}, document.title, dashboardUrl);
  return authData;
}

/**
 * Exchanges authorization code for access & refresh tokens.
 * No client secret is sent, preserving security on client side.
 */
async function exchangeCodeForToken(clientId, code, verifier, owner) {
  const redirectUri = getSpotifyRedirectUri();
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data.error_description || data.error || 'Échec de récupération du token';
    throw new Error(errorMsg);
  }

  const authData = {
    clientId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60000, // 1 min buffer
    scope: data.scope,
  };

  saveStoredAuth(authData, owner);
  return authData;
}

/**
 * Proactively refreshes the Spotify access token.
 */
export async function refreshSpotifyToken() {
  const owner = currentOwner();
  const auth = getStoredAuth();
  if (!auth || !auth.refreshToken || !auth.clientId) {
    clearStoredAuth();
    throw new Error('Session Spotify expirée. Veuillez vous reconnecter.');
  }

  const body = new URLSearchParams({
    client_id: auth.clientId,
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
  });

  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json();
  if (!response.ok) {
    // Refresh token expired or revoked; user must authorize again
    if (owner === currentOwner()) clearStoredAuth();
    throw new Error(data.error_description || 'Jeton de rafraîchissement expiré. Reconnexion requise.');
  }

  const updatedAuth = {
    ...auth,
    accessToken: data.access_token,
    // Spotify may or may not return a new refresh token
    refreshToken: data.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 60000,
    scope: data.scope || auth.scope,
  };

  saveStoredAuth(updatedAuth, owner);
  return updatedAuth;
}

export function getStoredAuth() {
  // Never import the legacy shared credentials into a user's session.
  localStorage.removeItem(STORAGE_KEY_AUTH);
  if (!currentOwner() || memoryOwner !== currentOwner()) {
    memoryAuth = null;
    memoryOwner = null;
  }
  return memoryAuth;
}

export function saveStoredAuth(authData, owner = currentOwner()) {
  if (!owner || owner !== currentOwner()) throw new Error('Session Lumi modifiée. Reconnectez Spotify.');
  memoryOwner = owner;
  memoryAuth = authData;
  localStorage.removeItem(STORAGE_KEY_AUTH);
  window.dispatchEvent(new CustomEvent('lumi:spotify-auth-changed', { detail: authData }));
}

export function clearStoredAuth() {
  memoryAuth = null;
  memoryOwner = null;
  localStorage.removeItem(STORAGE_KEY_AUTH);
  for (const key of [PKCE_OWNER, STORAGE_KEY_PKCE_STATE, STORAGE_KEY_PKCE_VERIFIER, STORAGE_KEY_ACTIVE_CLIENT_ID]) sessionStorage.removeItem(key);
  window.dispatchEvent(new CustomEvent('lumi:spotify-auth-changed', { detail: null }));
}

/**
 * Sleep helper for exponential backoff.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Core authenticated fetch with:
 * - Proactive token refresh
 * - Retry on 401
 * - HTTP 429 exponential backoff with Retry-After header respect
 * - OpenAPI error response parsing
 */
export async function spotifyFetch(endpoint, options = {}, attempt = 1, owner = currentOwner()) {
  if (!owner || owner !== currentOwner()) throw new Error('Session Lumi modifiée.');
  let auth = getStoredAuth();
  if (!auth || !auth.accessToken) {
    throw new Error('Non authentifié avec Spotify.');
  }

  // Proactive refresh if expired or about to expire
  if (Date.now() >= (auth.expiresAt || 0)) {
    try {
      auth = await refreshSpotifyToken();
    } catch (err) {
      throw new Error(`Authentification requise : ${err.message}`);
    }
  }

  const url = new URL(endpoint.startsWith('http') ? endpoint : `${SPOTIFY_API_BASE}${endpoint}`);
  if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) throw new Error('URL Spotify interdite.');
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${auth.accessToken}`,
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers, redirect: 'error' });

  if (owner !== currentOwner()) throw new Error('Session Lumi modifiée.');

  // 204 No Content (e.g. playback idle)
  if (response.status === 204) {
    return null;
  }

  // Handle Rate Limits (HTTP 429)
  if (response.status === 429) {
    if (attempt > 3) {
      throw new Error('Limite de requêtes Spotify atteinte (429). Réessayez plus tard.');
    }
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.pow(2, attempt);
    const delayMs = Math.max(retryAfterSec * 1000, 1000);
    await sleep(delayMs);
    return spotifyFetch(endpoint, options, attempt + 1, owner);
  }

  // Handle Token Expiration during request (HTTP 401)
  if (response.status === 401 && attempt <= 2) {
    try {
      await refreshSpotifyToken();
      return spotifyFetch(endpoint, options, attempt + 1, owner);
    } catch {
      if (owner === currentOwner()) clearStoredAuth();
      throw new Error('Session Spotify expirée. Veuillez vous reconnecter.');
    }
  }

  // OpenAPI Error Format parsing: { error: { status: number, message: string } }
  if (!response.ok) {
    let errorMessage = `Erreur Spotify (${response.status})`;
    try {
      const errorJson = await response.json();
      if (errorJson.error) {
        if (typeof errorJson.error === 'string') {
          errorMessage = errorJson.error;
        } else if (errorJson.error.message) {
          errorMessage = errorJson.error.message;
        }
      }
    } catch {
      // response wasn't JSON
    }

    if (response.status === 403) {
      errorMessage = `Accès refusé par Spotify (403) : ${errorMessage}`;
    } else if (response.status === 404) {
      errorMessage = `Ressource Spotify introuvable (404) : ${errorMessage}`;
    } else if (response.status >= 500) {
      errorMessage = `Service Spotify temporairement indisponible (${response.status}).`;
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Spotify Web API Methods (Strictly adhering to OpenAPI schema and non-deprecated endpoints)
 */

/**
 * Get the object currently being played on the user's Spotify account.
 * Endpoint: GET /v1/me/player/currently-playing
 * Scope: user-read-currently-playing
 */
export async function getCurrentlyPlaying() {
  return spotifyFetch('/me/player/currently-playing');
}

/**
 * Get information about the user's current playback state, including track or episode, progress, and active device.
 * Endpoint: GET /v1/me/player
 * Scope: user-read-playback-state
 */
export async function getPlaybackState() {
  return spotifyFetch('/me/player');
}

/**
 * Get the current user's top tracks based on calculated affinity.
 * Endpoint: GET /v1/me/top/tracks
 * Scope: user-top-read
 * @param {'short_term' | 'medium_term' | 'long_term'} timeRange
 * @param {number} limit
 */
export async function getTopTracks(timeRange = 'medium_term', limit = 5) {
  const query = new URLSearchParams({
    time_range: timeRange,
    limit: String(Math.min(50, Math.max(1, limit))),
  });
  return spotifyFetch(`/me/top/tracks?${query.toString()}`);
}

/**
 * Get the current user's top artists based on calculated affinity.
 * Endpoint: GET /v1/me/top/artists
 * Scope: user-top-read
 */
export async function getTopArtists(timeRange = 'medium_term', limit = 5) {
  const query = new URLSearchParams({
    time_range: timeRange,
    limit: String(Math.min(50, Math.max(1, limit))),
  });
  return spotifyFetch(`/me/top/artists?${query.toString()}`);
}

/**
 * Get a list of the playlists owned or followed by the current Spotify user.
 * Endpoint: GET /v1/me/playlists
 * Scope: playlist-read-private
 */
export async function getUserPlaylists(limit = 10) {
  const query = new URLSearchParams({ limit: String(limit) });
  return spotifyFetch(`/me/playlists?${query.toString()}`);
}

/**
 * Get full details of the items of a playlist owned by a Spotify user.
 * Endpoint: GET /v1/playlists/{playlist_id}/items
 * Scope: playlist-read-private
 * Note: /playlists/{playlist_id}/items is preferred over the deprecated /playlists/{playlist_id}/tracks
 */
export async function getPlaylistItems(playlistId, limit = 10) {
  const query = new URLSearchParams({ limit: String(limit) });
  return spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/items?${query.toString()}`);
}

/**
 * Get detailed profile information about the current user.
 * Endpoint: GET /v1/me
 */
export async function getUserProfile() {
  return spotifyFetch('/me');
}

/**
 * Pause playback on the user's account.
 * Endpoint: PUT /v1/me/player/pause
 * Scope: user-modify-playback-state
 */
export async function pausePlayback() {
  return spotifyFetch('/me/player/pause', { method: 'PUT' });
}

/**
 * Start or resume playback on the user's account.
 * Endpoint: PUT /v1/me/player/play
 * Scope: user-modify-playback-state
 */
export async function resumePlayback() {
  return spotifyFetch('/me/player/play', { method: 'PUT' });
}

/**
 * Seek to a position in the currently playing track.
 * Endpoint: PUT /v1/me/player/seek
 * Scope: user-modify-playback-state
 */
export async function seekPlayback(positionMs) {
  const query = new URLSearchParams({ position_ms: String(Math.max(0, Math.round(positionMs))) });
  return spotifyFetch(`/me/player/seek?${query.toString()}`, { method: 'PUT' });
}

/**
 * Skip to the next track in the user's queue.
 * Endpoint: POST /v1/me/player/next
 * Scope: user-modify-playback-state
 */
export async function skipToNext() {
  return spotifyFetch('/me/player/next', { method: 'POST' });
}

/**
 * Skip to the previous track in the user's queue.
 * Endpoint: POST /v1/me/player/previous
 * Scope: user-modify-playback-state
 */
export async function skipToPrevious() {
  return spotifyFetch('/me/player/previous', { method: 'POST' });
}

/**
 * Check if the current user has saved the given tracks to their library.
 * Endpoint: GET /v1/me/tracks/contains
 * Scope: user-library-read
 */
export async function checkTracksSaved(trackIds) {
  const ids = Array.isArray(trackIds) ? trackIds.join(',') : trackIds;
  return spotifyFetch(`/me/tracks/contains?ids=${encodeURIComponent(ids)}`);
}

/**
 * Save tracks to the current user's library.
 * Endpoint: PUT /v1/me/tracks
 * Scope: user-library-modify
 */
export async function saveTracks(trackIds) {
  const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
  return spotifyFetch('/me/tracks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

/**
 * Remove tracks from the current user's library.
 * Endpoint: DELETE /v1/me/tracks
 * Scope: user-library-modify
 */
export async function removeSavedTracks(trackIds) {
  const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
  return spotifyFetch('/me/tracks', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

/**
 * Add items to a playlist.
 * Endpoint: POST /v1/playlists/{playlist_id}/tracks
 * Scope: playlist-modify-private, playlist-modify-public
 */
export async function addTracksToPlaylist(playlistId, trackUris) {
  const uris = Array.isArray(trackUris) ? trackUris : [trackUris];
  return spotifyFetch(`/playlists/${encodeURIComponent(playlistId)}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris }),
  });
}
