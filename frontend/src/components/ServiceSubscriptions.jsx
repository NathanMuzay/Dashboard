import React, { useEffect, useState } from 'react';
import api from '../api';
const services = { openai: ['Assistant IA Mistral', 'Envoyer une demande et lire la réponse dans Lumi'], spotify: ['Spotify', 'Lecture en cours et titres favoris'], gmail: ['Gmail', 'Messages non lus et rédaction'], google_calendar: ['Google Calendar', 'Échéances et planning'], github: ['GitHub', 'Push récents et graphe des commits'] };
export default function ServiceSubscriptions() {
  const [subscriptions, setSubscriptions] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  async function load() { try { setSubscriptions(await api('/services')); setError(''); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); }, []);
  async function toggle(service) {
    setBusy(service); setError('');
    try {
      const subscribed = subscriptions.includes(service);
      await api(`/services/${service}`, { method: subscribed ? 'DELETE' : 'PUT' });
      setSubscriptions(items => subscribed ? items.filter(item => item !== service) : [...items, service]);
      window.dispatchEvent(new Event('lumi:subscriptions-changed'));
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  return <section aria-labelledby="services-title"><h2 id="services-title">Mes services</h2><p>Activez les services à proposer dans votre catalogue de widgets. L’assistant IA utilise la clé Mistral configurée sur le serveur. Pour les autres services, l’autorisation du compte fournisseur se fait ensuite depuis le widget. Désactiver un service met ses widgets en pause et conserve leur configuration. Cela ne révoque pas l’accès chez le fournisseur.</p>
    <label>Rechercher un service<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {error && <p role="alert">{error} <button onClick={load}>Réessayer</button></p>}
    {!subscriptions ? <p role="status">Chargement des services…</p> : <ul className="service-list">{Object.entries(services).filter(([, [name]]) => name.toLowerCase().includes(search.toLowerCase())).map(([id, [name, description]]) => <li key={id}><div><strong>{name}</strong><p>{description}</p></div><button className="button button-secondary" aria-pressed={subscriptions.includes(id)} disabled={!!busy} onClick={() => toggle(id)}>{busy === id ? 'Enregistrement…' : subscriptions.includes(id) ? `Désactiver ${name}` : `Activer ${name}`}</button></li>)}</ul>}
  </section>;
}
