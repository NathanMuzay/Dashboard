import React, { useEffect, useState } from 'react';
import api from '../../frontend/src/api';
import Dialog from '../../frontend/src/components/Dialog';
export default function AdminUsers({ userId }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [roles, setRoles] = useState([]);
  async function load() { setBusy(true); try { setUsers(await api('/admin/users')); setError(''); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  useEffect(() => { load(); }, []);
  return <section><h2>Administration des utilisateurs</h2><p>Gérez les rôles et révoquez les sessions. Les changements de rôles déconnectent les sessions existantes du compte concerné.</p><label>Rechercher un utilisateur<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><button className="text-button" disabled={busy} onClick={load}>Actualiser</button>{error && <p role="alert">{error}</p>}{busy && <p role="status">Chargement…</p>}
    <ul className="service-list">{users.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())).map(user => <li key={user.id}><div><strong>{user.name}</strong><p>{user.email} · {user.email_verified ? 'Confirmé' : 'Non confirmé'}</p><small>{user.roles.join(', ')} · {user.sessions} session(s)</small></div><button disabled={busy || user.id === userId} onClick={() => { setSelected({ ...user, action: 'roles' }); setRoles(user.roles); }}>Modifier les rôles</button><button disabled={busy || user.id === userId} onClick={() => setSelected({ ...user, action: 'revoke' })}>Révoquer les sessions</button></li>)}</ul>
    {selected && <Dialog titleId="admin-title" onClose={() => { if (!busy) setSelected(null); }}><h2 id="admin-title">{selected.action === 'roles' ? 'Modifier les rôles' : 'Révoquer les sessions'} : {selected.name}</h2><form onSubmit={async event => { event.preventDefault(); setBusy(true); try { await api(`/admin/users/${selected.id}/${selected.action === 'roles' ? 'roles' : 'sessions'}`, { method: selected.action === 'roles' ? 'PUT' : 'DELETE', ...(selected.action === 'roles' ? { body: { roles } } : {}) }); setSelected(null); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } }}>{selected.action === 'roles' ? ['perso','employe','entreprise','admin'].map(role => <label key={role}><input type="checkbox" checked={roles.includes(role)} onChange={event => setRoles(items => event.target.checked ? [...items,role] : items.filter(item => item !== role))} />{role}</label>) : <p>Cet utilisateur devra se reconnecter.</p>}{error && <p role="alert">{error}</p>}<button className="button" disabled={busy || (selected.action === 'roles' && !roles.length)}>Confirmer</button></form></Dialog>}
  </section>;
}
