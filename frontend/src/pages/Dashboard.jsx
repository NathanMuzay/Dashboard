import React, { useState } from 'react';
import Brand from '../components/Brand';
import Icon from '../components/Icon';
import ThemeToggle from '../components/ThemeToggle';
import Notifications from '../../../bonus/frontend/Notifications';
import WidgetDashboard from '../dashboard/WidgetDashboard';
import { ROLE_LABELS } from '../config';
import Account from './Account';

export default function Dashboard({ user, onLogout }) {
  const [view, setView] = useState('dashboard');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const date = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
  return (
    <div className="workspace-shell">
      <header className="workspace-nav">
        <Brand />

        <nav aria-label="Espace de travail">
          <button
            className={view === 'dashboard' ? 'active' : ''}
            aria-current={view === 'dashboard' ? 'page' : undefined}
            onClick={() => setView('dashboard')}
          >
            <Icon name="grid" />
            Tableau de bord
          </button>
          <button
            className={view === 'account' ? 'active' : ''}
            aria-current={view === 'account' ? 'page' : undefined}
            onClick={() => setView('account')}
          >
            <Icon name="user" />
            Mon compte
          </button>
        </nav>
        <div className="workspace-user-actions">
          <Notifications key={user.id} />
          <ThemeToggle />
          <div className="workspace-account">
            <span className="avatar">{initials}</span>
            <div>
              <strong>
                {user.name}{' '}
                {user.email_verified && (
                  <span
                    className="verified-mark"
                    aria-label="Adresse e-mail vérifiée"
                    title="Adresse e-mail vérifiée"
                  >
                    ✓
                  </span>
                )}
              </strong>
              <small>{ROLE_LABELS[user.role]}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Se déconnecter"
              title="Se déconnecter"
              disabled={logoutBusy}
              onClick={async () => {
                setLogoutBusy(true);
                try {
                  await onLogout();
                } finally {
                  setLogoutBusy(false);
                }
              }}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </header>
      <div className="workspace-body">
        <main id="main" className="dashboard-main">
          <div hidden={view !== 'dashboard'}>
            <div className="dashboard-intro">
              <div>
                <p className="eyebrow">{date}</p>
                <h1>
                  Bonjour, {user.name.split(' ')[0]}
                  <span className="brand-dot">.</span>
                </h1>
                <p className="muted">
                  {user.role === 'entreprise'
                    ? `${user.companies[0]?.name || 'Votre entreprise'} — vos repères pour la journée.`
                    : 'Prenez un instant. Votre journée commence ici.'}
                </p>
              </div>
              <span className="greeting-symbol" aria-hidden="true" />
            </div>
            <WidgetDashboard key={user.id} userId={user.id} />
          </div>
          {view === 'account' && <Account user={user} initials={initials} />}
        </main>
      </div>
    </div>
  );
}
