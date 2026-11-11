import useRefresh from '../../hooks/useRefresh';
import React, { useEffect, useRef, useState } from 'react';
import { authorizeGmail, gmailLink, gmailRequest, listUnread, loadGoogleIdentity, mailLimit, messageChange } from './gmailClient';


export default function GmailWidget({ widget }) {
  const [auth, setAuth] = useState(null);
  const [account, setAccount] = useState('');
  const [messages, setMessages] = useState([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const lock = useRef(false);
  const clientId = widget.gmailClientId?.trim() || import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const limit = mailLimit(widget.gmailLimit);
  const tick = useRefresh(widget.refreshInterval, !!auth);
  useEffect(() => {
    let live = true;
    if (clientId) loadGoogleIdentity().then(() => { if (live) setReady(true); }).catch(err => { if (live) setError(err.message); });
    return () => { live = false; generation.current += 1; };
  }, [clientId]);
  useEffect(() => { setAuth(null); setMessages([]); setAccount(''); }, [clientId]);
  async function refresh(session = auth) {
    if (!session || lock.current) return;
    lock.current = true;
    const version = generation.current;
    setBusy(true);
    try {
      const items = await listUnread(session, limit);
      if (version === generation.current) { setMessages(items); setError(''); }
    } catch (err) {
      if (version === generation.current) setError(err.message);
    } finally {
      lock.current = false;
      if (version === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!auth) return;
    refresh(auth);
  }, [auth, limit, tick]);
  async function connect() {
    const version = ++generation.current;
    setBusy(true); setError(''); setMessages([]); setAuth(null); setAccount('');
    try {
      const session = await authorizeGmail(clientId);
      const profile = await gmailRequest(session, 'profile');
      if (version === generation.current) { setAccount(profile.emailAddress); setAuth(session); }
    } catch (err) { if (version === generation.current) setError(err.message); }
    finally { if (version === generation.current) setBusy(false); }
  }
  async function act(message, action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const version = generation.current;
    try {
      await gmailRequest(auth, `messages/${encodeURIComponent(message.id)}/modify`, messageChange(action));
      if (version === generation.current) {
        setMessages(current => current.filter(item => item.id !== message.id));
        setNotice(action === 'read' ? 'Message marqué comme lu.' : action === 'archive' ? 'Message archivé.' : 'Message signalé comme spam.');
        window.dispatchEvent(new Event('lumi:gmail-changed'));
      }
    } catch (err) { if (version === generation.current) setError(err.message); }
    finally { lock.current = false; if (version === generation.current) { setBusy(false); refresh(); } }
  }
  useEffect(() => {
    const update = () => refresh();
    window.addEventListener('lumi:gmail-changed', update);
    return () => window.removeEventListener('lumi:gmail-changed', update);
  }, [auth, limit]);
  return <div className="gmail-content">
    {!clientId && <p>Configurez le Client ID Google dans les paramètres du widget pour connecter Gmail.</p>}
    {clientId && <div className="gmail-toolbar">
      <span>{account || 'Connectez votre compte Gmail'}</span>
      <button type="button" className="text-button" disabled={!ready || busy} onClick={connect}>{auth ? 'Reconnecter' : 'Connecter Gmail'}</button>
      {!ready && error && <button type="button" className="text-button" onClick={() => loadGoogleIdentity().then(() => { setReady(true); setError(''); }).catch(err => setError(err.message))}>Réessayer</button>}
      {auth && <><button type="button" className="text-button" disabled={busy} onClick={() => refresh()}>Actualiser</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => { generation.current += 1; setAuth(null); setMessages([]); setAccount(''); setError(''); setNotice(''); }}>Déconnecter</button></>}
    </div>}
    {error && <p role="alert" className="feedback error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && <p role="status">Chargement…</p>}
    {auth && <p className="gmail-summary">{messages.length} mail{messages.length > 1 ? 's' : ''} affiché{messages.length > 1 ? 's' : ''} · Non lus · Réception · Maximum {limit}</p>}
    {auth && !busy && !error && messages.length === 0 && <p>Aucun mail non lu dans votre boîte de réception.</p>}
    <ul className="gmail-messages">{messages.map(message => {
      const header = name => message.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value || '';
      const url = gmailLink(account, message.threadId);
      return <li key={message.id}>
        <div className="gmail-sender">{header('From')}</div>
        <a className="gmail-subject" href={url} target="_blank" rel="noopener noreferrer">{header('Subject') || '(Sans objet)'}</a>
        <div className="gmail-message-actions">
          <button type="button" disabled={busy} onClick={() => act(message, 'read')}>Marquer comme lu</button>
          <button type="button" disabled={busy} onClick={() => act(message, 'archive')}>Archiver</button>
          <button type="button" disabled={busy} onClick={() => act(message, 'spam')}>Signaler comme spam</button>
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => setNotice('Dans Gmail, ouvrez le menu ⋮ du message puis « Bloquer l’expéditeur ».')}>Bloquer dans Gmail ↗</a>
          <a href={url} target="_blank" rel="noopener noreferrer">Ouvrir ↗</a>
        </div>
      </li>;
    })}</ul>
  </div>;
}
