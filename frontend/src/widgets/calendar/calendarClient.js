const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
let library;
export function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (library) return library;
  library = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      library = undefined;
      reject(new Error('Google est inaccessible. Vérifiez votre connexion puis réessayez.'));
    }
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return library;
}
export async function calendarRequest(token, query, { body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${API}${query ? `?${query}` : ''}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(body ? 'Connexion interrompue. Actualisez l’agenda pour vérifier si l’événement a été créé avant de réessayer.' : 'Connexion à Google Calendar impossible. Réessayez.');
  }
  if (!response.ok) {
    // Use Google's structured reasons, never display raw messages or token-bearing data.
    const payload = await response.json().catch(() => null);
    const details = payload?.error;
    const reasons = [
      ...(Array.isArray(details?.errors) ? details.errors.map(item => item?.reason) : []),
      ...(Array.isArray(details?.details) ? details.details.map(item => item?.reason) : []),
    ];
    const has = (...values) => values.some(value => reasons.includes(value));
    const messages = {
      401: 'La connexion Google a expiré. Reconnectez votre agenda.',
      403: 'Google refuse l’accès à cet agenda. Déconnectez Google Calendar, reconnectez-le et autorisez l’accès aux événements. Si le refus persiste, vérifiez les restrictions du compte Google.',
      429: 'Trop de demandes à Google. Patientez une minute avant de réessayer.',
    };
    let message = messages[response.status];
    if (response.status === 403) {
      if (has('accessNotConfigured', 'SERVICE_DISABLED', 'API_DISABLED')) {
        message = 'Google Calendar API est désactivée dans le projet Google Cloud du client OAuth. Ouvrez Google Cloud → API et services → Bibliothèque → Google Calendar API → Activer. Après activation, patientez quelques minutes puis cliquez sur Actualiser. (SERVICE_DISABLED)';
      } else if (has('insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
        message = 'L’autorisation d’accéder aux événements manque. Cliquez sur Déconnecter, puis reconnectez Google Calendar et acceptez l’accès aux événements. (ACCESS_TOKEN_SCOPE_INSUFFICIENT)';
      } else if (has('rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded', 'RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED')) {
        message = 'Le quota Google Calendar est atteint. Patientez avant de réessayer ; si le problème persiste, vérifiez les quotas du projet Google Cloud. (QUOTA_EXCEEDED)';
      } else if (has('domainPolicy', 'ORG_RESTRICTION_VIOLATION')) {
        message = 'La politique de votre organisation bloque Google Calendar. Contactez l’administrateur du compte Google.';
      }
    }
    const error = new Error(message || (body ? 'Google n’a pas confirmé la création. Actualisez l’agenda avant de réessayer.' : 'Impossible de charger les événements Google.'));
    error.status = response.status;
    throw error;
  }
  return response.json();
}
export async function listEvents(token, start, end, signal) {
  const events = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await calendarRequest(token, params, { signal });
    events.push(...(result.items || []).filter(event => event.status !== 'cancelled'));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return events;
}
