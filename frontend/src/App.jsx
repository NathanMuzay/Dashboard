import { clearStoredAuth } from './widgets/spotify/spotifyClient';
import { clearGitHubSessions } from './widgets/github/githubSession';
import React, { useEffect, useState } from 'react';
import AuthDialog from './components/AuthDialog';
import EmailAction, { readEmailAction } from './components/EmailAction';
import api from './api';
import { rememberUser, clearSession, isSessionChange } from './session';

import Brand from './components/Brand';
import AccessibilitySettings from './components/AccessibilitySettings';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';

const initialEmailAction = readEmailAction();

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState(null);
  const [emailAction, setEmailAction] = useState(initialEmailAction);
  const [restoring, setRestoring] = useState(
    !initialEmailAction,
  );
  const [sessionError, setSessionError] = useState('');
  async function restore() {
    setRestoring(true);
    setSessionError('');
    try {
      const restoredUser = await api('/auth/me');
      rememberUser(restoredUser, false);
      setUser(restoredUser);
    } catch (err) {
      if (err.status === 401) { clearSession(); setUser(null); }
      else setSessionError(err.message);
    } finally {
      setRestoring(false);
    }
  }
  useEffect(() => {
    if (!initialEmailAction) restore();
    const changed = event => {
      if (!isSessionChange(event)) return;
      clearGitHubSessions(); clearStoredAuth(); clearSession(); setUser(null); restore();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  async function logout() {
    if (
      !window.dispatchEvent(
        new Event('lumi:logout-request', { cancelable: true }),
      )
    ) {
      setSessionError(
        'Attendez la sauvegarde du dashboard avant de vous déconnecter. En cas d’erreur, exportez vos modifications ou rechargez la version serveur.',
      );
      return;
    }
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (err) {
      if (err.status !== 401) {
        setSessionError(err.message);
        return;
      }
    }
    clearGitHubSessions();
    clearStoredAuth();
    clearSession(true);
    setUser(null);
    setSessionError('');
  }
  if (emailAction)
    return (
      <EmailAction
        action={emailAction}
        api={api}
        onLogin={(data) => {
          setUser(data);
          setEmailAction(null);
          setRestoring(false);
        }}
        onDone={(mode) => {
          clearSession();
          setUser(null);
          setEmailAction(null);
          setRestoring(false);
          setAuthMode(mode);
        }}
      />
    );
  if (restoring)
    return (
      <div className="loading-screen" role="status">
        <Brand />
        <p>Ouverture de votre espace…</p>
      </div>
    );
  return (
    <>
      <AccessibilitySettings />
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      {sessionError && (
        <div className="session-alert" role="alert">
          {sessionError}
          <button onClick={restore}>Réessayer</button>
          <button
            onClick={() => setSessionError('')}
            aria-label="Fermer le message"
          >
            ×
          </button>
        </div>
      )}
      {user ? (
        <Dashboard user={user} onLogout={logout} />
      ) : (
        <Landing onOpen={setAuthMode} />
      )}
      {!user && authMode && (
        <AuthDialog
          api={api}
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onLogin={(data) => {
            setUser(data);
            setAuthMode(null);
            setSessionError('');
          }}
        />
      )}
    </>
  );
}
