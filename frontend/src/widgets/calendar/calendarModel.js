export const PRIORITIES = { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' };
export const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const fromDate = (value) => new Date(`${value}T00:00:00`);
export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
export function period(date, view) {
  const start = fromDate(localDate(date));
  if (view === 'month') {
    start.setDate(1);
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
  }
  if (view === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return { start, end: addDays(start, view === 'week' ? 7 : 1) };
}
export function eventBounds(event) {
  return {
    start: event.start?.date ? fromDate(event.start.date) : new Date(event.start?.dateTime),
    end: event.end?.date ? fromDate(event.end.date) : new Date(event.end?.dateTime),
  };
}
export function eventsOnDay(events, date) {
  const { start, end } = period(date, 'day');
  return events.filter(event => {
    const bounds = eventBounds(event);
    return bounds.start < end && bounds.end > start;
  });
}
export function eventMetadata(event) {
  const data = event.extendedProperties?.private || {};
  return {
    priority: Object.hasOwn(PRIORITIES, data.lumiPriority) ? data.lumiPriority : 'normal',
    labels: (data.lumiLabels || '').split(',').map(s => s.trim()).filter(Boolean),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(data.lumiDeadline || '') ? data.lumiDeadline : '',
  };
}
export function buildEvent(draft) {
  const summary = draft.title.trim();
  if (!summary || summary.length > 150) throw new Error('Indiquez un titre de 150 caractères maximum.');
  const start = draft.allDay ? fromDate(draft.startDate) : new Date(`${draft.startDate}T${draft.startTime}`);
  const last = draft.allDay ? fromDate(draft.endDate) : new Date(`${draft.endDate}T${draft.endTime}`);
  const end = draft.allDay ? addDays(last, 1) : last;
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start) throw new Error('La fin doit être postérieure au début.');
  // Reject nonexistent local times during the spring daylight-saving transition.
  if (!draft.allDay && (localDate(start) !== draft.startDate || start.getHours() !== Number(draft.startTime.split(':')[0]) || start.getMinutes() !== Number(draft.startTime.split(':')[1]))) {
    throw new Error('Cette heure de début n’existe pas dans votre fuseau horaire.');
  }
  if (!draft.allDay && (localDate(end) !== draft.endDate || end.getHours() !== Number(draft.endTime.split(':')[0]) || end.getMinutes() !== Number(draft.endTime.split(':')[1]))) {
    throw new Error('Cette heure de fin n’existe pas dans votre fuseau horaire.');
  }
  const labels = [...new Set(draft.labels.split(',').map(s => s.trim()).filter(Boolean))].join(', ');
  if (labels.length > 200) throw new Error('Les labels sont limités à 200 caractères.');
  if (draft.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.deadline) || !Number.isFinite(+fromDate(draft.deadline)))) throw new Error('Échéance invalide.');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    summary,
    description: draft.description.trim(),
    location: draft.location.trim(),
    start: draft.allDay ? { date: localDate(start) } : { dateTime: start.toISOString(), timeZone },
    end: draft.allDay ? { date: localDate(end) } : { dateTime: end.toISOString(), timeZone },
    extendedProperties: { private: {
      lumiPriority: Object.hasOwn(PRIORITIES, draft.priority) ? draft.priority : 'normal',
      lumiLabels: labels,
      lumiDeadline: draft.deadline || '',
    } },
  };
}

// The timetable uses the browser's local dates, just like its hour labels.
export function isTimetableEvent(event) {
  if (!event.start?.dateTime || !event.end?.dateTime) return false;
  const { start, end } = eventBounds(event);
  return Number.isFinite(+start) && Number.isFinite(+end) && end > start && localDate(start) === localDate(end);
}
export function isLongEvent(event) {
  const { start, end } = eventBounds(event);
  return Number.isFinite(+start) && Number.isFinite(+end) && end >= addDays(start, 7);
}
export function eventDeadline(event) {
  const { deadline } = eventMetadata(event);
  if (deadline) return new Date(+addDays(fromDate(deadline), 1) - 1);
  const { end } = eventBounds(event);
  return event.end?.date ? new Date(+end - 1) : end;
}
export function longEventsByDeadline(events, now, includePast = false) {
  return events.filter(event => isLongEvent(event) && (includePast || eventBounds(event).end > new Date(now)))
    .sort((a, b) => eventDeadline(a) - eventDeadline(b) || eventBounds(a).start - eventBounds(b).start || String(a.id || '').localeCompare(String(b.id || '')));
}

export const slotDuration = event => Math.max(1, (eventBounds(event).end - eventBounds(event).start) / 60000);
export function compactWeekLayout(dayItems, width, height) {
  const columns = Math.min(dayItems.length || 1, width < 340 ? 2 : width < 620 ? 4 : 7);
  const rows = Math.ceil(dayItems.length / columns) || 1;
  const available = Math.max(0, height / rows - 58);
  const fits = scale => dayItems.every(items => items.reduce((sum, event) => sum + Math.max(44, slotDuration(event) * scale), 0) + Math.max(0, items.length - 1) * 5 <= available);
  let low = 0, high = 1.5;
  for (let i = 0; i < 20; i++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; }
  return { columns, scale: low };
}
