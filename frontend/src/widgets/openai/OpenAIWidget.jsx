import React, { useEffect, useId, useRef, useState } from 'react';
import api from '../../api';

// Historical component path and widget ID keep saved dashboards compatible.
export default function OpenAIWidget() {
  const id = useId();
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const live = useRef(true);
  const ready = status?.configured && status?.provider === 'mistral';

  async function checkStatus() {
    setChecking(true);
    setError('');
    try {
      const data = await api('/ai/status', { timeoutMs: 15000 });
      if (live.current) setStatus(data);
    } catch (err) {
      if (live.current) { setStatus(null); setError(err.message); }
    } finally {
      if (live.current) setChecking(false);
    }
  }
  useEffect(() => {
    live.current = true;
    checkStatus();
    return () => { live.current = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy || !ready || !prompt.trim()) return;
    setBusy(true);
    setError('');
    setAnswer(null);
    try {
      const result = await api('/ai/ask', { method: 'POST', body: { prompt: prompt.trim() }, timeoutMs: 65000 });
      if (live.current) setAnswer(result);
    } catch (err) {
      if (live.current) setError(err.message);
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return <div className="openai-widget">
    <div className="ai-status-row">
      <span className={`ai-status ${ready ? 'is-ready' : ''}`} role="status">
        <span className="ai-status-dot" aria-hidden="true" />
        {checking ? 'Connexion…' : busy ? 'Réflexion en cours…' : ready ? 'Prêt à vous aider' : 'Indisponible'}
      </span>
      {answer && <button type="button" className="text-button" disabled={busy} onClick={() => { setAnswer(null); setPrompt(''); }}>Effacer l’échange</button>}
    </div>
    {!checking && !ready && <div className="ai-unavailable">
      <p>{status?.provider && status.provider !== 'mistral' ? 'L’ancien serveur IA répond encore. Redémarrez le backend pour utiliser Mistral.' : status?.message || 'Impossible de joindre l’assistant.'}</p>
      <button type="button" className="text-button" onClick={checkStatus}>Réessayer</button>
    </div>}
    {answer && <section className="ai-reply" aria-label="Réponse de l’assistant IA" aria-live="polite">
      <span className="ai-reply-label">✦ Mistral</span>
      <div className="openai-answer">{answer.text}</div>
      {answer.incomplete && <small>La réponse a atteint sa limite de longueur.</small>}
    </section>}
    {busy && <div className="ai-thinking" role="status"><span aria-hidden="true">✦</span> Mistral prépare sa réponse…</div>}
    <form className="ai-composer" onSubmit={submit} aria-busy={busy}>
      <label className="ai-sr-only" htmlFor={`${id}-prompt`}>Votre demande</label>
      <textarea id={`${id}-prompt`} value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={8000} rows={3} required disabled={busy} placeholder="Une question, une idée, un calcul…" />
      <div className="ai-composer-footer">
        <span className="ai-privacy">Envoyé à Mistral</span>
        <button className="ai-send" aria-label="Envoyer la demande" disabled={busy || !ready || !prompt.trim()}>
          {busy ? 'En cours…' : 'Envoyer'} <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
    {error && <p role="alert" className="ai-error">{error}</p>}
  </div>;
}
