const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
let sdkPromise;
export function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timer = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      sdkPromise = null;
      reject(new Error('Connexion Google indisponible. Réessayez.'));
    }
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return sdkPromise;
}
export function authorizeGmail(clientId) {
  return new Promise((resolve, reject) => {
    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !window.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
          reject(new Error('Autorisez l’accès à Gmail pour utiliser ce widget.'));
        } else resolve({ token: response.access_token, expiresAt: Date.now() + Number(response.expires_in) * 1000 });
      },
      error_callback: () => reject(new Error('Connexion annulée ou fenêtre bloquée. Réessayez.')),
    }).requestAccessToken({ prompt: 'select_account' });
  });
}
export async function gmailRequest(auth, path, body) {
  if (!auth || Date.now() >= auth.expiresAt) throw new Error('Session Gmail expirée. Reconnectez-vous.');
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${auth.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Session Gmail expirée. Reconnectez-vous.');
    if (response.status === 403) {
      let detail;
      try { detail = (await response.json())?.error; } catch { /* Keep a useful fallback for non-JSON responses. */ }
      const reasons = [...(detail?.errors || []), ...(detail?.details || [])].map(item => item.reason);
      if (reasons.some(reason => ['accessNotConfigured', 'SERVICE_DISABLED'].includes(reason))) {
        throw new Error('API Gmail désactivée pour ce projet Google Cloud. Activez Gmail API dans Bibliothèque, attendez quelques minutes, puis reconnectez Gmail.');
      }
      if (reasons.some(reason => ['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(reason))) {
        throw new Error('Autorisation Gmail insuffisante. Reconnectez Gmail et accordez l’accès demandé aux messages.');
      }
      if (reasons.some(reason => ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded'].includes(reason))) {
        throw new Error('Quota Gmail atteint. Réessayez plus tard ou vérifiez les quotas du projet Google Cloud.');
      }
      throw new Error(`Accès Gmail refusé.${typeof detail?.message === 'string' ? ` Google : ${detail.message}` : ' Vérifiez les autorisations et l’activation de l’API Gmail.'}`);
    }
    if (response.status === 429) throw new Error('Trop de requêtes Gmail. Réessayez dans un instant.');
    throw new Error('La requête Gmail a échoué. Réessayez.');
  }
  return response.json();
}
export function mailLimit(value) {
  return Math.min(20, Math.max(1, Math.floor(Number(value) || 5)));
}
export async function listUnread(auth, limit) {
  const query = new URLSearchParams({ q: 'in:inbox is:unread', maxResults: String(mailLimit(limit)) });
  const list = await gmailRequest(auth, `messages?${query}`);
  const messages = await Promise.all((list.messages || []).map(({ id }) =>
    gmailRequest(auth, `messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
  return messages.filter(message => message.labelIds?.includes('UNREAD') && message.labelIds?.includes('INBOX'));
}
export function messageChange(action) {
  if (action === 'read') return { removeLabelIds: ['UNREAD'] };
  if (action === 'archive') return { removeLabelIds: ['INBOX'] };
  if (action === 'spam') return { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] };
  throw new Error('Action Gmail inconnue.');
}
export function gmailLink(email = '', threadId = '') {
  const params = new URLSearchParams(email ? { authuser: email } : {});
  return `https://mail.google.com/mail/u/?${params}#${threadId ? `all/${encodeURIComponent(threadId)}` : 'inbox?compose=new'}`;
}

function utf8Base64(text) {
  return btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(''));
}
export function buildRawMessage({ to, cc = '', bcc = '', subject = '', body = '' }) {
  const headers = [];
  for (const [name, value] of [['To', to], ['Cc', cc], ['Bcc', bcc]]) {
    if (/[\r\n]/.test(value || '')) throw new Error('Adresse e-mail invalide.');
    const addresses = (value || '').split(',').map(address => address.trim()).filter(Boolean);
    if (name === 'To' && !addresses.length) throw new Error('Ajoutez un destinataire.');
    if (addresses.some(address => !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address))) throw new Error('Utilisez des adresses e-mail séparées par des virgules.');
    if (addresses.length) headers.push(`${name}: ${addresses.join(', ')}`);
  }
  if (/[\r\n]/.test(subject)) throw new Error('L’objet doit tenir sur une seule ligne.');
  // Fold encoded words without splitting Unicode code points.
  const chunks = Array.from(subject).reduce((parts, char) => {
    if (new TextEncoder().encode(parts[parts.length - 1] + char).length > 42) parts.push('');
    parts[parts.length - 1] += char;
    return parts;
  }, ['']);
  headers.push(`Subject: ${chunks.map(chunk => `=?UTF-8?B?${utf8Base64(chunk)}?=`).join('\r\n ')}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64');
  const encodedBody = utf8Base64(body.replace(/\r?\n/g, '\r\n')).match(/.{1,76}/g)?.join('\r\n') || '';
  return utf8Base64(`${headers.join('\r\n')}\r\n\r\n${encodedBody}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sendGmailMessage(auth, draft) {
  return gmailRequest(auth, 'messages/send', { raw: buildRawMessage(draft) });
}
