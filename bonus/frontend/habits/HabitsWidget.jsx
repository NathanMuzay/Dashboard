import React, { useEffect, useState } from 'react';
import { dateKey, weekDays, streak, toggleHabitDay } from './habitModel';

export default function HabitsWidget({ widget, onChange }) {
  const [today, setToday] = useState(() => new Date());
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => setToday(new Date());
    const timer = setInterval(update, 60000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  const habits = widget.habits || [];
  const days = weekDays(today, offset);
  const todayKey = dateKey(today);
  const elapsed = days.filter(day => dateKey(day) <= todayKey);
  const done = habits.reduce((sum, habit) => sum + elapsed.filter(day => habit.days.includes(dateKey(day))).length, 0);
  const total = habits.length * elapsed.length;
  const percent = total ? Math.round(done * 100 / total) : 0;
  const format = date => date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  return <div className="habits-widget">
    <div className="habits-toolbar">
      <div className="habits-navigation">
        <button type="button" aria-label="Semaine précédente des habitudes" onClick={() => setOffset(value => value - 1)}>←</button>
        <span>{format(days[0])} — {format(days[6])}</span>
        <button type="button" aria-label="Semaine suivante des habitudes" disabled={offset >= 0} onClick={() => setOffset(value => value + 1)}>→</button>
      </div>
      <button type="button" onClick={() => setOffset(0)} disabled={offset === 0}>Cette semaine</button>
    </div>
    {!habits.length ? <p className="habits-empty">Ajoutez vos habitudes avec le bouton « Modifier » de ce widget. Un petit pas, chaque jour.</p> : <>
      <div className="habits-summary"><strong>{percent} %</strong><span>{done} / {total} cases cochées sur les jours écoulés</span></div>
      <progress className="habits-progress" max="100" value={percent} aria-label={`Progression de ${widget.title}`} />
      <div className="habits-table-scroll" role="region" aria-label={`Suivi hebdomadaire de ${widget.title}`} tabIndex="0">
        <table className="habits-table"><thead><tr><th scope="col">Habitude</th>{days.map(day => <th scope="col" key={dateKey(day)} data-today={dateKey(day) === todayKey}><span>{day.toLocaleDateString('fr-FR', { weekday: 'short' })}</span><span>{day.getDate()}</span></th>)}<th scope="col">Série actuelle</th></tr></thead>
          <tbody>{habits.map(habit => <tr key={habit.id}><th scope="row">{habit.name}</th>{days.map(day => {
            const key = dateKey(day);
            return <td key={key} data-today={key === todayKey}><input type="checkbox" checked={habit.days.includes(key)} disabled={key > todayKey} aria-label={`${habit.name}, ${day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`} onChange={() => {
              try { onChange({ habits: toggleHabitDay(habits, habit.id, key) }); setError(''); }
              catch (err) { setError(err.message); }
            }} /></td>;
          })}<td className="habits-streak">{streak(habit, today)} j</td></tr>)}</tbody>
        </table>
      </div>
      <p className="habits-footnote">Une case par jour. Les jours futurs restent désactivés. Historique sauvegardé avec votre dashboard. Faites défiler le tableau pour voir tous les jours.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
