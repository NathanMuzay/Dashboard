const PREFIX = 'lumi-spotify-popup-';
export const spotifyPopupState = random => `${PREFIX}${random}`;
export const spotifyPopupChannel = state => `lumi:spotify:${state}`;

// Runs before React so the returning popup never restores the full dashboard.
export function handleSpotifyPopupReturn() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  if (!state?.startsWith(PREFIX) || (!params.has('code') && !params.has('error'))) return false;
  window.history.replaceState({}, '', window.location.pathname);
  const message = document.createElement('p');
  message.textContent = 'Connexion Spotify en cours… Vous pouvez garder votre dashboard ouvert.';
  document.getElementById('root').replaceChildren(message);
  const channel = new BroadcastChannel(spotifyPopupChannel(state));
  const result = { state, code: params.get('code'), error: params.get('error') };
  const send = () => channel.postMessage(result);
  const timer = setInterval(send, 300);
  const timeout = setTimeout(() => {
    clearInterval(timer); channel.close();
    message.textContent = 'La fenêtre Lumi d’origine est introuvable. Fermez cette fenêtre et reconnectez Spotify depuis votre dashboard.';
  }, 15000);
  channel.onmessage = event => {
    if (event.data?.state !== state || event.data?.type !== 'received') return;
    clearInterval(timer); clearTimeout(timeout); channel.close();
    message.textContent = 'Autorisation transmise à Lumi. Vous pouvez fermer cette fenêtre.';
    window.close();
  };
  send();
  return true;
}

export function waitForSpotifyPopup({ state, owner, currentOwner, exchange, popup, timeoutMs = 180000 }) {
  const channel = new BroadcastChannel(spotifyPopupChannel(state));
  return new Promise((resolve, reject) => {
    let received = false;
    const finish = (error, auth) => {
      clearTimeout(timer); channel.close();
      try { popup.close(); } catch { /* Callback window also closes itself after acknowledgement. */ }
      if (error) reject(error); else resolve(auth);
    };
    const timer = setTimeout(() => finish(new Error('Connexion Spotify non terminée. Fermez la fenêtre puis réessayez.')), timeoutMs);
    channel.onmessage = async event => {
      const data = event.data;
      if (received || !data || data.state !== state || data.type === 'received') return;
      if (typeof data.code !== 'string' && typeof data.error !== 'string') return;
      received = true;
      channel.postMessage({ type: 'received', state });
      if (owner !== currentOwner()) { finish(new Error('Session Lumi modifiée. Reconnectez Spotify.')); return; }
      if (data.error) { finish(new Error('La connexion Spotify a été annulée ou refusée.')); return; }
      try { const auth = await exchange(data.code); finish(null, auth); }
      catch (error) { finish(error); }
    };
  });
}
