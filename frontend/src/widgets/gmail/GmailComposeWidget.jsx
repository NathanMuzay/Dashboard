import React, { useEffect, useId, useRef, useState } from 'react';
import Dialog from '../../components/Dialog';
import { authorizeGmail, gmailRequest, loadGoogleIdentity, sendGmailMessage } from './gmailClient';

const emptyDraft = () => ({ to: '', cc: '', bcc: '', subject: '', body: '' });
function Pencil() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg>;
}
export default function GmailComposeWidget({ widget }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [copies, setCopies] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const version = useRef(0);
  const id = useId();
  const clientId = widget.gmailClientId?.trim() || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  useEffect(() => {
    const current = ++version.current;
    setSession(null); setReady(false);
    if (clientId) loadGoogleIdentity().then(() => { if (current === version.current) setReady(true); }).catch(err => { if (current === version.current) setError(err.message); });
    return () => { version.current += 1; };
  }, [clientId]);
  async function connect() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const current = version.current;
    try {
      const auth = await authorizeGmail(clientId);
      const profile = await gmailRequest(auth, 'profile');
      if (current === version.current) setSession({ ...auth, email: profile.emailAddress });
    } catch (err) { if (current === version.current) setError(err.message); }
    finally { lock.current = false; if (current === version.current) setBusy(false); }
  }
  async function send(event) {
    event.preventDefault();
    if (lock.current) return;
    if (!session || Date.now() >= session.expiresAt) { setError('Connectez ou reconnectez votre compte Gmail avant l’envoi. Votre message est conservé.'); return; }
    lock.current = true; setBusy(true); setError('');
    const current = version.current;
    try {
      await sendGmailMessage(session, draft);
      if (current === version.current) { setDraft(emptyDraft()); setOpen(false); setNotice('Message envoyé avec Gmail.'); }
    } catch (err) {
      if (current === version.current) setError(`${err.message} Votre message est conservé. Si la connexion a été interrompue, vérifiez les messages envoyés dans Gmail avant de réessayer.`);
    } finally { lock.current = false; if (current === version.current) setBusy(false); }
  }
  const update = event => setDraft(current => ({ ...current, [event.target.name]: event.target.value }));
  return <div className="gmail-content gmail-compose">
    <button type="button" className="gmail-compose-trigger" title="Nouveau message Gmail" aria-label="Nouveau message Gmail" onClick={() => { setOpen(true); setNotice(''); }}><Pencil /><span>Nouveau message Gmail</span></button>
    {notice && <p role="status">{notice}</p>}
    {open && <Dialog titleId={`${id}-title`} className={`gmail-compose-dialog ${expanded ? 'is-expanded' : ''}`} onClose={() => { if (!lock.current) setOpen(false); }}>
      <header className="gmail-compose-header"><h2 id={`${id}-title`}>Nouveau message</h2><div>
        <button type="button" disabled={busy} aria-label="Réduire la fenêtre" title="Réduire (message conservé)" onClick={() => setOpen(false)}>−</button>
        <button type="button" aria-label={expanded ? 'Restaurer la fenêtre' : 'Agrandir la fenêtre'} onClick={() => setExpanded(!expanded)}>⛶</button>
      </div></header>
      <form onSubmit={send} className="gmail-compose-form">
        <div className="gmail-compose-account"><span>De : {session?.email || widget.gmailAccount || 'Compte Gmail non connecté'}</span>
          <button type="button" className="text-button" disabled={!clientId || !ready || busy} onClick={connect}>{session ? 'Changer / reconnecter' : 'Connecter Gmail'}</button>
        </div>
        {!clientId && <p className="gmail-compose-feedback">Renseignez le Client ID Google dans les paramètres du widget pour activer l’envoi.</p>}
        {clientId && !ready && error && <button type="button" className="text-button" onClick={() => loadGoogleIdentity().then(() => { setReady(true); setError(''); }).catch(err => setError(err.message))}>Réessayer la connexion Google</button>}
        <div className="gmail-compose-field"><label htmlFor={`${id}-to`}>À</label><input autoFocus id={`${id}-to`} name="to" type="email" multiple required placeholder="Destinataires" value={draft.to} onChange={update} disabled={busy} /><button type="button" className="text-button" onClick={() => setCopies(!copies)} aria-expanded={copies}>Cc / Cci</button></div>
        {copies && ['cc', 'bcc'].map(name => <div className="gmail-compose-field" key={name}><label htmlFor={`${id}-${name}`}>{name === 'cc' ? 'Cc' : 'Cci'}</label><input id={`${id}-${name}`} name={name} type="email" multiple value={draft[name]} onChange={update} disabled={busy} /></div>)}
        <div className="gmail-compose-field"><label htmlFor={`${id}-subject`}>Objet</label><input id={`${id}-subject`} name="subject" maxLength={200} value={draft.subject} onChange={update} disabled={busy} /></div>
        <textarea className="gmail-compose-body" aria-label="Corps du message" name="body" value={draft.body} onChange={update} disabled={busy} placeholder="Votre message…" />
        {error && <p className="gmail-compose-feedback feedback error" role="alert">{error}</p>}
        <footer className="gmail-compose-footer"><button className="button button-dark gmail-send" type="submit" disabled={busy || !session}>{busy ? 'Veuillez patienter…' : 'Envoyer'} <span aria-hidden="true">➤</span></button>
          <span>Message conservé ici tant que la page reste ouverte.</span>
          <button type="button" className="icon-button" title="Effacer le message" aria-label="Effacer le message" disabled={busy} onClick={() => { if (window.confirm('Effacer ce message ?')) { setDraft(emptyDraft()); setError(''); setOpen(false); } }}>⌫</button>
        </footer>
      </form>
    </Dialog>}
  </div>;
}
