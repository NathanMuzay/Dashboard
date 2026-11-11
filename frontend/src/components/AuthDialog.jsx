import { rememberUser } from '../session';
import GoogleSignIn from './GoogleSignIn';
import { ROLE_LABELS, REGISTRATION_ROLES } from '../config';
import React, { useEffect, useState } from 'react';
import Dialog from './Dialog';

const MODES = {
  login: { title: 'Heureux de vous revoir.', description: 'Connectez-vous avec votre adresse e-mail confirmée.', action: 'Se connecter', path: '/auth/login' },
  register: { title: 'Un espace à vous.', description: 'Un e-mail vous permettra de confirmer votre adresse avant votre première connexion.', action: 'Créer mon compte', path: '/auth/register' },
  verify: { title: 'Confirmer mon adresse.', description: 'Recevez un nouveau lien de confirmation. Seul le dernier lien est valide, pendant 24 heures.', action: 'Renvoyer le lien de confirmation', path: '/auth/email/resend' },
  magic: { title: 'Un lien pour vous connecter.', description: 'Pour un compte dont l’adresse est déjà confirmée. Le lien est valable 15 minutes, pour une seule connexion.', action: 'Recevoir un lien de connexion', path: '/auth/magic/request' },
  forgot: { title: 'Mot de passe oublié ?', description: 'Recevez un lien valable 30 minutes pour choisir un nouveau mot de passe.', action: 'Envoyer le lien de réinitialisation', path: '/auth/password/forgot' },
};

export default function AuthDialog({ api, initialMode, onClose, onLogin }) {
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState('perso');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [visible, setVisible] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [needsVerification, setNeedsVerification] = useState(false);
  const register = mode === 'register';
  const credentials = register || mode === 'login';
  const remaining = Math.max(0, Math.ceil((cooldown - now) / 1000));
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);
  function switchMode(next) { setMode(next); setError(''); setNotice(''); setVisible(false); setNeedsVerification(false); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const payload = { email };
    if (credentials) payload.password = form.get('password');
    if (register) { payload.name = form.get('name'); payload.role = role; if (role === 'entreprise') payload.company_name = form.get('company_name'); }
    try {
      const data = await api(MODES[mode].path, { method: 'POST', body: payload });
      if (mode === 'login') { rememberUser(data.user); onLogin(data.user); }
      else {
        setNotice(data.message);
        setCooldown(Date.now() + 60000); setNow(Date.now());
        if (register) { setMode('verify'); setVisible(false); }
      }
    } catch (err) { setError(err.message); if (mode === 'login' && err.status === 403) setNeedsVerification(true); }
    finally { setBusy(false); }
  }
  return <Dialog titleId="auth-title" onClose={() => { if (!busy) onClose(); }} className="auth-dialog">
    <span className="eyebrow">Votre compte Lumi</span>
    <h2 id="auth-title">{MODES[mode].title}</h2>
    <p className="muted">{MODES[mode].description}</p>
    <form onSubmit={submit} className="auth-form" aria-busy={busy}>
      <fieldset disabled={busy}>
        {register && <><label htmlFor="name">Votre nom</label><input id="name" name="name" autoComplete="name" maxLength="100" required />
          <label htmlFor="role">Type de compte</label><select id="role" value={role} onChange={event => setRole(event.target.value)}>{REGISTRATION_ROLES.map(key => <option key={key} value={key}>{ROLE_LABELS[key]}</option>)}</select>
          {role === 'entreprise' && <><label htmlFor="company">Nom de l’entreprise</label><input id="company" name="company_name" autoComplete="organization" maxLength="150" required /></>}
        </>}
        <label htmlFor="email">Adresse e-mail</label><input id="email" name="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" maxLength="254" value={email} onChange={event => setEmail(event.target.value)} required />
        {credentials && <><label htmlFor="password">Mot de passe</label><div className="password-field"><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} required /><button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Masquer' : 'Afficher'}</button></div>{register && <p className="field-hint">8 caractères minimum, 72 octets maximum.</p>}</>}
        {error && <p className="feedback error" role="alert">{error}</p>}
        {notice && <p className="feedback success" role="status">{notice}</p>}
        <button className="button button-dark auth-submit" disabled={busy || (!credentials && remaining > 0)}>{busy ? 'Un instant…' : !credentials && remaining > 0 ? `Nouvel envoi dans ${remaining} s` : MODES[mode].action}<span aria-hidden="true">→</span></button>
      </fieldset>
    </form>
    {mode === 'login' && <p className="field-hint">Votre connexion reste active sur cet appareil pendant 7 jours. Sur un appareil partagé, déconnectez-vous après utilisation.</p>}
    {mode === 'login' && <GoogleSignIn onLogin={onLogin} />}
    {mode === 'login' && <div className="email-auth-options">
      {needsVerification && <button className="text-button" onClick={() => switchMode('verify')}>Renvoyer le lien de confirmation</button>}
      <button className="text-button" disabled={busy} onClick={() => switchMode('forgot')}>Mot de passe oublié ?</button>
      <button className="text-button" disabled={busy} onClick={() => switchMode('magic')}>Me connecter par e-mail</button>
      {!needsVerification && <button className="text-button" disabled={busy} onClick={() => switchMode('verify')}>Confirmer mon adresse e-mail</button>}
    </div>}
    {mode === 'magic' && <button className="text-button" disabled={busy} onClick={() => switchMode('verify')}>Mon adresse n’est pas encore confirmée</button>}
    <p className="auth-switch"><button className="text-button" disabled={busy} onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Créer un compte' : 'Revenir à la connexion'}</button></p>
  </Dialog>;
}
