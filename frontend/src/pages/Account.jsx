import React from 'react';
import GoogleSignIn from '../components/GoogleSignIn';
import ServiceSubscriptions from '../components/ServiceSubscriptions';
import AdminUsers from '../../../bonus/frontend/AdminUsers';
import { ROLE_LABELS } from '../config';

export default function Account({ user, initials }) {
  return (
    <section className="account-page">
      <span className="eyebrow">Vos informations</span>
      <h1>
        Mon compte<span className="brand-dot">.</span>
      </h1>
      <p className="muted">Les informations associées à votre espace Lumi.</p>
      <div className="account-card">
        <span className="avatar large">{initials}</span>
        <dl>
          <div>
            <dt>Nom</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Adresse e-mail</dt>
            <dd>
              {user.email}{' '}
              {user.email_verified && (
                <span className="verification-badge">
                  ✓ Adresse e-mail vérifiée
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Rôles attribués</dt>
            <dd>{user.roles.map((r) => ROLE_LABELS[r]).join(', ')}</dd>
          </div>
          {user.companies.length > 0 && (
            <div>
              <dt>Entreprise</dt>
              <dd>{user.companies.map((c) => c.name).join(', ')}</dd>
            </div>
          )}
        </dl>
      </div>
      <section className="account-card" aria-labelledby="privacy-title">
        <div>
          <h2 id="privacy-title">Vos données</h2>
          <p>Votre compte, vos dashboards, vos notes, votre suivi d’habitudes et vos abonnements sont conservés sur le serveur PostgreSQL pour les retrouver après reconnexion. Les mots de passe et les jetons de session y sont hachés.</p>
          <p>Votre connexion Lumi est conservée sept jours dans un cookie protégé, même après fermeture du navigateur ou redémarrage du serveur. Se déconnecter ferme cette session. Les préférences de thème et d’accessibilité restent sur cet appareil.</p>
          <p>Les connexions Google, Spotify et GitHub sont temporaires. Les fournisseurs reçoivent les demandes que vous leur adressez. La météo transmet votre ville et votre adresse IP à Open-Meteo. Vous pouvez exporter et supprimer vos dashboards depuis le tableau de bord.</p>
          <p>Les questions de l’assistant IA sont transmises par le serveur Lumi à l’API Mistral pour générer la réponse. Lumi ne conserve pas ces questions ni les réponses en base ; leur affichage reste dans la session du widget.</p>
          <p>Pour supprimer l’ensemble de votre compte, contactez l’administrateur de cette instance. La suppression du compte n’est pas encore disponible en libre-service.</p>
        </div>
      </section>
      <GoogleSignIn link />
      <ServiceSubscriptions />
      {user.role === 'admin' && <AdminUsers userId={user.id} />}
      <p className="field-hint">
        Le type de compte est défini à la création. Les droits sont vérifiés par
        le serveur.
      </p>
    </section>
  );
}
