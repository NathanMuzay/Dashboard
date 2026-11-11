import { widgetService } from '../dashboard/Subscriptions';
import { notify } from '../../../bonus/frontend/Notifications';
import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { cleanWidgets, exportDashboard, parseDashboardExport } from '../dashboardModel';
import Dialog from './Dialog';

export default function DashboardWorkspace({ userId, initialWidgets, children }) {
  const [dashboards, setDashboards] = useState(null);
  const [current, setCurrent] = useState(null);
  const [error, setError] = useState('');
  const signature = value => JSON.stringify([value.name, value.widgets]);
  const [savedSignature, setSavedSignature] = useState('');
  const dirty = !!current && signature(current) !== savedSignature;
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [mount, setMount] = useState(0);
  const saving = useRef(false);
  const importInput = useRef(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function load() {
    setError(''); setBusy(true);
    try {
      let items = await api('/dashboards');
      if (!alive.current) return;
      if (!items.length) {
        let widgets = initialWidgets;
        try { const local = localStorage.getItem(`lumi_dashboard_v1_${userId}`); if (local) widgets = cleanWidgets(JSON.parse(local)); } catch { /* Preserve invalid legacy storage for manual recovery. */ }
        const active = await api('/services');
        widgets = widgets.filter(widget => !widgetService(widget.type) || active.includes(widgetService(widget.type)));
        items = [await api('/dashboards', { method: 'POST', body: { name: 'Mon dashboard', widgets: cleanWidgets(widgets) } })];
      }
      if (!alive.current) return;
      let selected = items[0];
      try { selected = items.find(item => item.id === sessionStorage.getItem(`lumi_active_dashboard_${userId}`)) || selected; } catch {}
      setDashboards(items); setCurrent(selected); setSavedSignature(signature(selected)); setMount(v => v + 1);
    } catch (err) { if (alive.current) setError(err.message); }
    finally { if (alive.current) setBusy(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (current) { try { sessionStorage.setItem(`lumi_active_dashboard_${userId}`, current.id); } catch {} } }, [current?.id, userId]);
  useEffect(() => {
    const guard = event => { if (dirty || busy) event.preventDefault(); };
    window.addEventListener('lumi:logout-request', guard);
    return () => window.removeEventListener('lumi:logout-request', guard);
  }, [dirty, busy]);
  useEffect(() => {
    if (!dirty) return;
    const protect = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  async function save() {
    if (saving.current || !currentRef.current) return;
    saving.current = true; setBusy(true);
    const snapshot = currentRef.current;
    try {
      const saved = await api(`/dashboards/${snapshot.id}`, { method: 'PUT', body: { name: snapshot.name, widgets: cleanWidgets(snapshot.widgets), revision: snapshot.revision } });
      if (!alive.current) return;
      setCurrent(value => ({ ...value, revision: saved.revision }));
      setDashboards(items => items.map(item => item.id === saved.id ? saved : item));
      setSavedSignature(signature(snapshot)); setError('');
    } catch (err) { if (alive.current) setError(err.message); }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    if (!dirty || busy || error) return;
    const timer = setTimeout(save, 700);
    return () => clearTimeout(timer);
  }, [current, dirty, busy, error]);
  function change(update) {
    setCurrent(value => {
      const widgets = typeof update === 'function' ? update(value.widgets) : update;
      return { ...value, widgets };
    });
  }
  async function create(body) {
    setBusy(true); setError('');
    try {
      const item = await api('/dashboards', { method: 'POST', body });
      notify(`Dashboard « ${item.name} » créé.`);
      setDashboards(items => [...items, item]); setCurrent(item); setSavedSignature(signature(item)); setDialog(null); setMount(v => v + 1);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([exportDashboard(current)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'lumi-dashboard.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message); }
  }
  if (!current) return <section aria-live="polite"><p>{busy ? 'Chargement des dashboards…' : error}</p>{!busy && <button className="button" onClick={load}>Réessayer</button>}</section>;
  return <>
    <div className="dashboard-controls">
    <div className="dashboard-toolbar">
      <label className="dashboard-picker"><span>Dashboard</span><select aria-label="Dashboard actif" value={current.id} disabled={busy || dirty} onChange={event => { const selected = dashboards.find(item => item.id === event.target.value); setCurrent(selected); setSavedSignature(signature(selected)); setMount(v => v + 1); }}>{dashboards.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="button button-dark" disabled={busy || dirty} onClick={() => { setName(''); setDialog('create'); }}>Nouveau dashboard</button>
      <div className="dashboard-tools" role="group" aria-label="Actions du dashboard">
      <button className="button button-secondary" disabled={busy} onClick={() => { setName(current.name); setDialog('rename'); }}>Renommer</button>
      <button className="button button-secondary" onClick={download}>Exporter</button>
      <button type="button" className="button button-secondary" disabled={busy || dirty} onClick={() => importInput.current?.click()}>Importer</button><input ref={importInput} hidden aria-label="Importer un dashboard" type="file" accept=".json,application/json" disabled={busy || dirty} onChange={async event => { const file = event.target.files[0]; event.target.value = ''; if (!file) return; try { if (file.size > 1_000_000) throw new Error('Fichier trop volumineux (1 Mo maximum).'); await create(parseDashboardExport(await file.text())); } catch (err) { setError(err.message); } }} />
      </div>
      <button className="button button-secondary dashboard-delete" disabled={busy || dirty || dashboards.length <= 1} onClick={() => setDialog('delete')}>Supprimer le dashboard</button>
    </div>
    <p className="dashboard-save-status" role="status" data-pending={busy || dirty}><span aria-hidden="true" className="dashboard-save-dot" />{busy ? 'Synchronisation…' : dirty ? 'Modifications à enregistrer' : 'Enregistré dans votre compte'}</p>
    </div>
    {error && <div role="alert" className="feedback error"><p>{error}</p><button onClick={save} disabled={busy}>Réessayer la sauvegarde</button><button onClick={() => setDialog('reload')} disabled={busy}>Recharger la version serveur</button><p>Vous pouvez exporter vos modifications avant de recharger.</p></div>}
    {children({ key: `${current.id}-${mount}`, widgets: current.widgets, onChange: change })}
    {dialog && <Dialog titleId="dashboard-action-title" onClose={() => { if (!busy) setDialog(null); }}><h2 id="dashboard-action-title">{({ create: 'Nouveau dashboard', rename: 'Renommer le dashboard', delete: 'Supprimer ce dashboard ?', reload: 'Recharger la version serveur ?' })[dialog]}</h2>
      {['create','rename'].includes(dialog) ? <form onSubmit={event => { event.preventDefault(); if (dialog === 'create') create({ name: name.trim(), widgets: [] }); else { setCurrent(value => ({ ...value, name: name.trim() })); setDialog(null); } }}><label htmlFor="dashboard-name">Nom</label><input id="dashboard-name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} /><button className="button" disabled={busy || !name.trim()}>Enregistrer</button></form> : <><p>{dialog === 'delete' ? 'Les widgets de ce dashboard seront supprimés définitivement.' : 'Les modifications non enregistrées seront remplacées par la sauvegarde serveur.'}</p><button className="button" disabled={busy} onClick={async () => { if (dialog === 'reload') { setDialog(null); await load(); return; } setBusy(true); try { await api(`/dashboards/${current.id}`, { method: 'DELETE' }); const items = dashboards.filter(item => item.id !== current.id); setDashboards(items); setCurrent(items[0]); setSavedSignature(signature(items[0])); setDialog(null); setMount(v => v + 1); } catch (err) { setError(err.message); } finally { setBusy(false); } }}>Confirmer</button></>}
    </Dialog>}
  </>;
}
