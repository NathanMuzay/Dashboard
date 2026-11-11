import useRefresh from '../../hooks/useRefresh';
import React, { useEffect, useId, useState } from 'react';
import Dialog from '../../components/Dialog';
import Timetable from './Timetable';
import { useCalendar } from './CalendarProvider';
import { calendarRequest, listEvents } from './calendarClient';
import { PRIORITIES, addDays, buildEvent, eventBounds, eventMetadata, fromDate, isLongEvent, localDate, longEventsByDeadline, period } from './calendarModel';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function EventRow({ event, compact = false }) {
  const { start, end } = eventBounds(event);
  const { priority, labels, deadline } = eventMetadata(event);
  const allDay = !!event.start?.date;
  const lastDay = allDay ? addDays(end, -1) : end;
  const multiple = localDate(start) !== localDate(lastDay);
  const safeLink = /^https:\/\/calendar\.google\.com\//.test(event.htmlLink || '') ? event.htmlLink : null;
  return <li className="calendar-event">
    <div className="calendar-event-date">{!compact && <>{dateFormat.format(start)}{multiple && ` → ${dateFormat.format(lastDay)}`}</>}<span>{allDay ? 'Toute la journée' : `${timeFormat.format(start)} – ${timeFormat.format(end)}`}</span></div>
    <div className="calendar-event-main">
      {safeLink ? <a href={safeLink} target="_blank" rel="noopener noreferrer">{event.summary || 'Sans titre'} ↗</a> : <strong>{event.summary || 'Sans titre'}</strong>}
      {event.location && <small>{event.location}</small>}
      <div className="calendar-tags"><span className={`calendar-priority priority-${priority}`}>Priorité {PRIORITIES[priority].toLowerCase()}</span>{labels.map(label => <span key={label}>#{label}</span>)}</div>
      <small>Échéance : {deadline ? dateFormat.format(fromDate(deadline)) : `${dateFormat.format(lastDay)}${allDay ? '' : ` à ${timeFormat.format(end)}`}`}</small>
    </div>
  </li>;
}

function EventForm({ date, timetable = false, onClose, onCreated }) {
  const calendar = useCalendar();
  const id = useId();
  const [draft, setDraft] = useState({ title: '', startDate: localDate(date), endDate: localDate(timetable ? date : addDays(date, 6)), startTime: '09:00', endTime: '10:00', allDay: !timetable, priority: 'normal', labels: '', deadline: '', description: '', location: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!calendar.auth) { setError('Reconnectez Google Calendar avant de créer un événement.'); return; }
    let body;
    try { body = buildEvent(timetable ? { ...draft, endDate: draft.startDate, allDay: false } : draft); if (!timetable && !isLongEvent(body)) throw new Error('Un événement doit durer au moins 7 jours. Pour une activité quotidienne, utilisez l’emploi du temps.'); } catch (err) { setError(err.message); return; }
    setBusy(true);
    try {
      await calendarRequest(calendar.auth.token, new URLSearchParams({ sendUpdates: 'none' }), { body });
      calendar.refresh();
      onCreated(fromDate(draft.startDate));
    } catch (err) {
      if (err.status === 401) calendar.expire();
      setError(err.message);
    } finally { setBusy(false); }
  }
  function field(key, label, type = 'text', props = {}) {
    return <label htmlFor={`${id}-${key}`}>{label}<input id={`${id}-${key}`} type={type} value={draft[key]} onChange={e => update(key, e.target.value)} {...props} /></label>;
  }
  return <Dialog titleId={`${id}-heading`} className="calendar-dialog" onClose={() => { if (!busy) onClose(); }}>
    <span className="eyebrow">Google Calendar · Agenda principal</span>
    <h2 id={`${id}-heading`}>{timetable ? 'Nouveau créneau' : 'Nouvel événement'}</h2>
    <p className="muted">{timetable ? 'Un cours ou une activité, avec un début et une fin le même jour.' : 'Un événement de 7 jours minimum, classé selon son échéance.'}</p>
    <form onSubmit={submit} className="calendar-form" aria-busy={busy}>
      <fieldset disabled={busy}>
        {field('title', timetable ? 'Nom du créneau' : 'Nom de l’événement', 'text', { required: true, maxLength: 150, autoFocus: true })}
        {!timetable && <label className="calendar-checkbox"><input type="checkbox" checked={draft.allDay} onChange={e => update('allDay', e.target.checked)} />Toute la journée</label>}
        <div className="calendar-form-grid">
          {field('startDate', 'Date de début', 'date', { required: true })}
          {!timetable && field('endDate', draft.allDay ? 'Dernier jour inclus' : 'Date de fin', 'date', { required: true, min: draft.startDate })}
          {!draft.allDay && <>{field('startTime', 'Heure de début', 'time', { required: true })}{field('endTime', 'Heure de fin', 'time', { required: true })}</>}
          {!timetable && <div className="calendar-select-field"><label htmlFor={`${id}-priority`}>Priorité</label><select id={`${id}-priority`} value={draft.priority} onChange={e => update('priority', e.target.value)}>{Object.entries(PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
          {!timetable && field('deadline', 'Échéance (facultative)', 'date')}
        </div>
        {!timetable && field('labels', 'Labels techniques', 'text', { maxLength: 200, placeholder: 'frontend, backend, déploiement…' })}
        {!timetable && <small className="muted">Séparez les labels par une virgule. Sans échéance, la fin de l’événement est utilisée.</small>}
        {field('location', 'Lieu (facultatif)', 'text', { maxLength: 300 })}
        <label htmlFor={`${id}-description`}>Description<textarea id={`${id}-description`} value={draft.description} onChange={e => update('description', e.target.value)} rows="3" maxLength="3000" /></label>
        <small className="muted">Fuseau horaire : {Intl.DateTimeFormat().resolvedOptions().timeZone}.{!timetable && ' Les priorités et labels sont visibles dans Lumi.'}</small>
        {error && <p className="feedback error" role="alert">{error}</p>}
        <button className="button button-dark" type="submit" disabled={busy || !calendar.auth}>{busy ? 'Création…' : 'Créer dans Google Calendar'}</button>
      </fieldset>
    </form>
  </Dialog>;
}

export default function CalendarWidget({ mode = 'month', widget = {} }) {
  const calendar = useCalendar();
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState(mode === 'month' ? 'month' : 'week');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [includePast, setIncludePast] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { start, end } = period(date, view);
  const startISO = start.toISOString(), endISO = end.toISOString();
  const token = calendar.auth?.token;
  const tick = useRefresh(widget.refreshInterval, !!token);
  const key = `${startISO}/${endISO}`;
  const events = result?.key === key && result?.token === token ? result.events : [];
  const { revision, expire } = calendar;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!token) { setResult(null); setError(''); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError('');
    listEvents(token, startISO, endISO, controller.signal).then(items => {
      if (!controller.signal.aborted) setResult({ key: `${startISO}/${endISO}`, token, events: items });
    }).catch(err => {
      if (!controller.signal.aborted) { setError(err.message); if (err.status === 401) expire(); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, startISO, endISO, revision, expire, tick]);
  function move(direction) {
    setNotice('');
    setDate(view === 'month' ? new Date(date.getFullYear(), date.getMonth() + direction, 1) : addDays(date, direction * (view === 'week' ? 7 : 1)));
  }
  const visible = longEventsByDeadline(events, now, includePast);
  const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, index) => addDays(start, index));
  return <div className="calendar-widget">
    {!token ? <div className="calendar-connect">
      <strong>{mode === 'month' ? 'Vos prochaines échéances' : 'Votre semaine, en un regard'}</strong>
      <p>{mode === 'month' ? 'Vos événements de 7 jours minimum, de l’échéance la plus proche à la plus lointaine.' : 'Vos cours et activités regroupés par jour, sans plages vides. Seuls les créneaux qui commencent et se terminent le même jour sont affichés.'}</p>
      {!calendar.configured ? <p role="status">La connexion Google Calendar n’est pas encore configurée pour cette application.</p> : <>
        <button type="button" className="button button-dark" onClick={calendar.connect} disabled={!calendar.ready || calendar.connecting}>{calendar.connecting ? 'Connexion…' : calendar.ready ? 'Connecter Google Calendar' : 'Chargement de Google…'}</button>
        {!calendar.ready && calendar.error && <button type="button" onClick={calendar.prepare}>Réessayer</button>}
      </>}
      {calendar.error && <p className="feedback error" role="alert">{calendar.error}</p>}
    </div> : <>
      <div className="calendar-toolbar">
        <div className="calendar-navigation"><button type="button" aria-label="Période précédente" onClick={() => move(-1)}>←</button>
          {view === 'month' ? <input aria-label="Mois et année" type="month" value={localDate(date).slice(0, 7)} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setDate(fromDate(`${e.target.value}-01`)); }} /> : <input aria-label="Date affichée" type="date" value={localDate(date)} onChange={e => { if (e.target.value) setDate(fromDate(e.target.value)); }} />}
          <button type="button" aria-label="Période suivante" onClick={() => move(1)}>→</button>
        </div>
        <button type="button" onClick={() => setDate(new Date())}>Aujourd’hui</button>
        <button type="button" className="calendar-add" onClick={() => { setNotice(''); setCreating(true); }}>{mode === 'month' ? '+ Événement' : '+ Créneau'}</button>
      </div>
      <div className="calendar-options">
        {mode === 'month' ? <label><input type="checkbox" checked={includePast} onChange={e => setIncludePast(e.target.checked)} />Inclure les événements passés</label> : <div className="calendar-switch" role="group" aria-label="Vue du calendrier">{[['week', 'Semaine'], ['day', 'Jour']].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div>}
        <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
      </div>
      {notice && <p className="feedback success" role="status">{notice}</p>}
      {loading && <p role="status">Actualisation de l’agenda…</p>}
      {error ? <p className="feedback error" role="alert">{error}</p> : view === 'month' ? <>
        <p className="calendar-period">{date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} · {visible.length} événement{visible.length > 1 ? 's' : ''} · Échéances croissantes</p>
        {visible.length ? <ul className="calendar-events">{visible.map(event => <EventRow event={event} key={event.id} />)}</ul> : <p className="calendar-empty">{includePast ? 'Aucun événement de 7 jours minimum sur ce mois.' : 'Aucun événement de 7 jours minimum en cours ou à venir sur ce mois.'}</p>}
      </> : <Timetable events={events} days={days} now={now} onCreate={day => { setDate(day); setNotice(''); setCreating(true); }} />}
      <div className="calendar-footer"><a href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer">Google Calendar ↗</a><button type="button" disabled={loading} onClick={calendar.refresh}>Actualiser</button><button type="button" onClick={calendar.disconnect}>Déconnecter</button></div>
    </>}
    {creating && <EventForm date={date} timetable={mode !== 'month'} onClose={() => setCreating(false)} onCreated={createdDate => { setCreating(false); setDate(createdDate); setNotice(mode === 'month' ? 'Événement créé dans Google Calendar.' : 'Créneau créé dans Google Calendar.'); }} />}
  </div>;
}
