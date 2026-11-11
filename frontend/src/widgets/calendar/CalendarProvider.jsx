import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CALENDAR_SCOPE, loadGoogleIdentity } from './calendarClient';

const Context = createContext(null);
export const useCalendar = () => useContext(Context);
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

// The provider is mounted per Lumi user. Tokens remain in memory and are discarded on logout.
export default function CalendarProvider({ children }) {
  const [auth, setAuth] = useState(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const alive = useRef(false);
  const generation = useRef(0);
  const prepare = useCallback(() => {
    setError('');
    loadGoogleIdentity().then(() => { if (alive.current) setReady(true); }).catch(err => { if (alive.current) setError(err.message); });
  }, []);
  useEffect(() => {
    alive.current = true;
    if (CLIENT_ID) prepare();
    return () => { alive.current = false; generation.current++; };
  }, [prepare]);
  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(() => {
      setAuth(null);
      setError('La connexion Google a expiré. Reconnectez votre agenda.');
    }, Math.max(0, auth.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [auth]);
  function connect() {
    if (!ready || connecting) return;
    const attempt = ++generation.current;
    setConnecting(true);
    setError('');
    const current = () => alive.current && generation.current === attempt;
    const fail = (message) => { if (current()) { setConnecting(false); setError(message); } };
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: CALENDAR_SCOPE,
        include_granted_scopes: false,
        callback: response => {
          if (!current()) return;
          if (response.error || !response.access_token) return fail('La connexion Google n’a pas été autorisée.');
          if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, CALENDAR_SCOPE)) return fail('Autorisez l’accès aux événements Google Calendar pour utiliser ces widgets.');
          setAuth({ token: response.access_token, expiresAt: Date.now() + Math.max(1, Number(response.expires_in) - 30) * 1000 });
          setConnecting(false);
        },
        error_callback: () => fail('La fenêtre Google a été fermée ou bloquée. Réessayez en autorisant les fenêtres contextuelles.'),
      });
      client.requestAccessToken({ prompt: 'select_account' });
    } catch { fail('Impossible d’ouvrir la connexion Google. Réessayez.'); }
  }
  const expire = useCallback(() => {
    generation.current++;
    setAuth(null);
    setError('La connexion Google a expiré. Reconnectez votre agenda.');
  }, []);
  function disconnect() {
    generation.current++;
    setAuth(null);
    setConnecting(false);
    setError('');
  }
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return <Context.Provider value={{ auth, ready, configured: !!CLIENT_ID, connecting, error, connect, disconnect, prepare, expire, revision, refresh }}>{children}</Context.Provider>;
}
