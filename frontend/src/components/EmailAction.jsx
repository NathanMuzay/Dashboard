import { rememberUser, clearSession } from '../session';
import React, { useState } from 'react';

export function readEmailAction() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has('email-action')) return null;
  const action = { purpose: params.get('email-action'), token: params.get('token') || '' };
  window.history.replaceState({}, '', window.location.pathname + window.location.search);
  return action;
}
const COPY = {
  verify: ['Confirmez votre adresse.', 'Cette vérification confirme que cette adresse e-mail vous appartient.', 'Confirmer mon adresse', '/auth/email/confirm'],
  magic: ['Votre lien de connexion.', 'Ce lien ouvre le compte associé à l’e-mail reçu et remplace la session Lumi de ce navigateur.', 'Me connecter', '/auth/magic/consume'],
  reset: ['Un nouveau mot de passe.', 'Après validation, les sessions existantes seront fermées sur tous vos appareils.', 'Enregistrer mon mot de passe', '/auth/password/reset'],
};
export default function EmailAction({ action, api, onLogin, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [visible, setVisible] = useState(false);
  const valid = COPY[action.purpose] && /^[a-f0-9]{64}$/i.test(action.token);
  const copy = COPY[action.purpose];
  async function submit(event) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const payload = { token: action.token };
    if (action.purpose === 'reset') {
      if (form.get('password') !== form.get('confirm')) { setError('Les mots de passe ne correspondent pas.'); return; }
      payload.password = form.get('password');
    }
    setBusy(true);
    try {
      const data = await api(copy[3], { method: 'POST', body: payload });
      if (action.purpose === 'magic') { rememberUser(data.user); onLogin(data.user); }
      else { if (action.purpose === 'reset') clearSession(true); setSuccess(data.message); }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main id="main" className="email-action-page"><a className="brand" href="/" aria-label="Lumi, accueil">LUMI.</a><section className="email-action-card">
    <span className="eyebrow">Sécurité du compte</span>
    <h1>{!valid ? 'Lien incomplet.' : success ? action.purpose === 'verify' ? 'Adresse confirmée.' : 'Mot de passe modifié.' : copy[0]}</h1>
    {!valid ? <p className="feedback error" role="alert">Ce lien est incomplet ou invalide. Rouvrez le lien reçu par e-mail ou demandez-en un nouveau.</p> : success ? <><p role="status" className="feedback success">{success}</p>{action.purpose === 'verify' && <span className="verification-badge">✓ Adresse e-mail vérifiée</span>}</> : <>
      <p className="muted">{copy[1]}</p>
      <form className="auth-form" onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
        {action.purpose === 'reset' && <><label htmlFor="new-password">Nouveau mot de passe</label><div className="password-field"><input id="new-password" name="password" type={visible ? 'text' : 'password'} minLength="8" autoComplete="new-password" required /><button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Masquer' : 'Afficher'}</button></div><p className="field-hint">8 caractères minimum, 72 octets maximum.</p><label htmlFor="confirm-password">Confirmer le nouveau mot de passe</label><input id="confirm-password" name="confirm" type={visible ? 'text' : 'password'} minLength="8" autoComplete="new-password" required /></>}
        {error && <p role="alert" className="feedback error">{error}</p>}
        <button className="button button-dark auth-submit" disabled={busy}>{busy ? 'Un instant…' : copy[2]}</button>
      </fieldset></form>
      <p className="field-hint">Le lien n’est utilisé qu’après votre validation. Si vous rechargez cette page, rouvrez le lien depuis votre e-mail.</p>
    </>}
    <div className="email-action-footer"><button className="text-button" disabled={busy} onClick={() => onDone('login')}>Revenir à la connexion</button>{!success && <button className="text-button" disabled={busy} onClick={() => onDone(action.purpose === 'verify' ? 'verify' : action.purpose === 'reset' ? 'forgot' : 'magic')}>Demander un nouveau lien</button>}</div>
  </section></main>;
}
