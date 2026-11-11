import React, { useEffect, useId, useRef, useState } from 'react';
import Dialog from '../../components/Dialog';
import { compactWeekLayout, slotDuration, eventBounds, eventsOnDay, isTimetableEvent, localDate } from './calendarModel';

const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const timeLabel = event => {
  const { start, end } = eventBounds(event);
  return `${timeFormat.format(start)} – ${timeFormat.format(end)}`;
};

export default function Timetable({ events, days, now, onCreate }) {
  const [selected, setSelected] = useState(null);
  const titleId = useId();
  const scheduled = events.filter(isTimetableEvent);
  const viewport = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 400 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const current = new Date(now);
  const dayItems = days.map(day => eventsOnDay(scheduled, day).sort((a, b) => eventBounds(a).start - eventBounds(b).start));
  const { columns, scale } = compactWeekLayout(dayItems, size.width, size.height);
  const safeLink = /^https:\/\/calendar\.google\.com\//.test(selected?.htmlLink || '') ? selected.htmlLink : null;
  return <>
    <div ref={viewport} className="week-overview" tabIndex={0} role="region" aria-label="Emploi du temps compact">
      <div className="week-overview-grid" style={{ '--week-columns': columns }}>
        {days.map((day, index) => <section className={`week-day ${localDate(day) === localDate(current) ? 'is-today' : ''}`} key={localDate(day)} aria-label={dayFormat.format(day)}>
          <header className="week-day-heading">
            <time dateTime={localDate(day)} aria-current={localDate(day) === localDate(current) ? 'date' : undefined}><span>{weekdayFormat.format(day)}</span><strong>{day.getDate()}</strong></time>
            <button type="button" aria-label={`Ajouter un créneau le ${dayFormat.format(day)}`} onClick={() => onCreate(day)}>+</button>
          </header>
          <div className="week-day-slots">
            {dayItems[index].length ? dayItems[index].map(event => <button
              type="button" key={event.id} className="week-slot"
              style={{ height: Math.max(44, slotDuration(event) * scale) }}
              title={`${event.summary || 'Sans titre'} · ${timeLabel(event)}${event.location ? ` · ${event.location}` : ''}`}
              aria-label={`${event.summary || 'Sans titre'}, ${dayFormat.format(day)}, ${timeLabel(event)}`}
              onClick={() => setSelected(event)}>
              <span>{timeLabel(event)}</span><strong>{event.summary || 'Sans titre'}</strong>
              {slotDuration(event) * scale > 75 && event.location && <small>{event.location}</small>}
            </button>) : <p className="week-day-empty">Libre</p>}
          </div>
        </section>)}
      </div>
    </div>
    {selected && <Dialog titleId={titleId} className="calendar-dialog" onClose={() => setSelected(null)}>
      <span className="eyebrow">Emploi du temps</span><h2 id={titleId}>{selected.summary || 'Sans titre'}</h2>
      <p>{dayFormat.format(eventBounds(selected).start)} · {timeLabel(selected)}</p>
      {selected.location && <p>{selected.location}</p>}
      {selected.description && <p className="timetable-description">{selected.description}</p>}
      {safeLink && <a href={safeLink} target="_blank" rel="noopener noreferrer">Ouvrir dans Google Calendar ↗</a>}
    </Dialog>}
  </>;
}
