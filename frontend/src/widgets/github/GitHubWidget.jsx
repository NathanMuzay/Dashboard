import useRefresh from '../../hooks/useRefresh';
import React, { useEffect, useId, useState } from 'react';
import { readGitHubToken, saveGitHubToken } from './githubSession';
import { loadGraph, loadPushes, parseRepository, pushLimit } from './githubClient';

const colors = ['#428fe5', '#d99b16', '#a879e5', '#32aa87', '#e16a87', '#cc793a'];
const color = lane => colors[lane % colors.length];
const x = lane => 12 + lane * 18;
function Graph({ data, repo }) {
  const width = data.width * 18 + 12;
  return <div className="github-graph" role="list" aria-label="Graphe des commits, du plus récent aux ancêtres">
    {data.rows.map(row => <div className="github-graph-row" key={row.sha} role="listitem">
      <svg width={width} height="30" style={{ minWidth: width }} aria-hidden="true">
        {row.continuations.map(edge => <path key={`c${edge.from}`} d={`M${x(edge.from)} 0 L${x(edge.to)} 30`} stroke={color(edge.from)} fill="none" strokeWidth="2" />)}
        {row.incoming && <path d={`M${x(row.lane)} 0 V15`} stroke={color(row.lane)} strokeWidth="2" />}
        {row.links.map((edge, index) => <path key={index} d={`M${x(edge.from)} 15 C${x(edge.from)} 24 ${x(edge.to)} 21 ${x(edge.to)} 30`} stroke={color(edge.to)} fill="none" strokeWidth="2" strokeDasharray={edge.missing ? '3 3' : undefined} />)}
        <circle cx={x(row.lane)} cy="15" r={row.parents?.length > 1 ? 4.5 : 3.5} fill={row.parents?.length > 1 ? 'var(--surface)' : color(row.lane)} stroke={color(row.lane)} strokeWidth="2" />
      </svg>
      <a className="github-commit-title" href={`https://github.com/${repo}/commit/${row.sha}`} target="_blank" rel="noopener noreferrer" title={row.commit.message}>{row.commit.message.split('\n')[0]}</a>
      {data.branches.filter(branch => branch.commit.sha === row.sha).map(branch => <span className="github-branch" key={branch.name}>⑂ {branch.name}</span>)}
      <span className="github-author">{row.author?.login || row.commit.author?.name || 'Auteur inconnu'}</span>
      <code>{row.sha.slice(0, 7)}</code>
    </div>)}
  </div>;
}
export default function GitHubWidget({ widget, userId }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState(() => readGitHubToken(userId));
  const [connectionError, setConnectionError] = useState('');
  useEffect(() => {
    const sync = () => setToken(readGitHubToken(userId));
    sync();
    window.addEventListener('lumi:github-session', sync);
    return () => window.removeEventListener('lumi:github-session', sync);
  }, [userId]);
  function connectToken(value) {
    try {
      saveGitHubToken(userId, value);
      setDraftToken('');
      setConnectionError('');
      setRevision(current => current + 1);
    } catch { setConnectionError('Impossible de conserver la connexion GitHub dans cette session. Vérifiez que le stockage du navigateur est autorisé.'); }
  }
  const [draftToken, setDraftToken] = useState('');
  const [revision, setRevision] = useState(0);
  const id = useId();
  const isGraph = widget.type === 'github_graph';
  const repository = widget.githubRepo || '';
  useEffect(() => { setHistory([]); }, [repository, token]);
  const tick = useRefresh(widget.refreshInterval, !!repository, 300, 300);
  const count = pushLimit(widget.githubLimit);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(''); setBusy(false);
    let repo;
    try { repo = parseRepository(repository); } catch (err) { setError(err.message); return; }
    setBusy(true);
    (isGraph ? loadGraph(repo, token, controller.signal) : loadPushes(repo, count, token, controller.signal))
      .then(result => { if (!controller.signal.aborted) { setData(result); setHistory(items => [...items, { time: Date.now(), count: isGraph ? result.rows.length : result.length }].slice(-24)); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message || 'Connexion à GitHub impossible.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [repository, count, isGraph, token, revision, tick]);
  let repo = '';
  try { repo = parseRepository(repository); } catch { /* Validation shown above. */ }
  return <div className="github-content">
    <div className="github-toolbar">
      {repo && <a href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer">{repo}</a>}
      <button type="button" className="text-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>↻ Actualiser</button>
    </div>
    <details className="github-access"><summary>{token ? 'Jeton GitHub configuré' : 'Dépôt privé / connexion GitHub'}</summary>
      <form onSubmit={event => { event.preventDefault(); if (draftToken.trim()) connectToken(draftToken.trim()); }}>
        <label htmlFor={`${id}-token`}>Jeton GitHub personnel</label>
        <input id={`${id}-token`} type="password" autoComplete="off" value={draftToken} onChange={event => setDraftToken(event.target.value)} required placeholder="github_pat_…" />
        <p>Accès en lecture au dépôt : Contents et Metadata. La connexion est partagée entre vos widgets GitHub et conservée uniquement en mémoire dans cet onglet. Elle est supprimée au rechargement ou à votre déconnexion de Lumi.</p>
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Créer un jeton GitHub</a><p>Sélectionnez le propriétaire du dépôt, puis le dépôt privé dans « Repository access » et accordez Contents : Read-only.</p>
        {connectionError && <p role="alert">{connectionError}</p>}
        <button type="submit" className="button button-secondary">Connecter</button>
        {token && <button type="button" className="text-button" onClick={() => { connectToken(''); }}>Déconnecter</button>}
      </form>
    </details>
    {busy && <p role="status">Chargement depuis GitHub…</p>}
    {error && <p role="alert" className="feedback error">{error}</p>}
    {history.length > 0 && <details><summary>Historique des {history.length} dernières observations</summary><p>Nombre de {isGraph ? 'commits' : 'push'} dans l’aperçu chargé, conservé pendant cette session du widget.</p><table><thead><tr><th>Heure</th><th>Nombre</th></tr></thead><tbody>{history.map((item,index) => <tr key={`${item.time}-${index}`}><td>{new Date(item.time).toLocaleTimeString('fr-FR')}</td><td>{item.count}</td></tr>)}</tbody></table></details>}
    {data && (isGraph ? <>
      {!data.rows.length ? <p>Aucun commit dans ce dépôt.</p> : <Graph data={data} repo={repo} />}
      {data.truncated && <p className="github-hint">Aperçu limité aux 8 premières branches et à 40 commits par branche. Les traits pointillés indiquent des ancêtres hors de cet aperçu.</p>}
    </> : <>
      {!data.length && <p>Aucun push disponible dans l’historique récent de GitHub.</p>}
      <ul className="github-pushes">{data.map(push => <li key={push.id}>
        <a className="github-push-title" href={`https://github.com/${repo}/${push.sha ? `commit/${push.sha}` : ''}`} target="_blank" rel="noopener noreferrer">{push.title}</a>
        <div><span className="github-branch">⑂ {push.branch}</span><span>par <strong>{push.actor}</strong></span><time dateTime={push.date}>{new Date(push.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</time></div>
      </li>)}</ul>
      <p className="github-hint">{data.length} push affiché{data.length > 1 ? 's' : ''} sur {count} demandé{count > 1 ? 's' : ''} · GitHub peut publier les événements avec un délai. Le titre est celui du dernier commit du push.</p>
    </>)}
  </div>;
}
