import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, weekDays, validDate, cleanHabits, toggleHabitDay, streak } from '../../bonus/frontend/habits/habitModel.js';
import { exportDashboard, parseDashboardExport } from '../src/dashboardModel.js';
const habit = { id: 'read', name: 'Lire', days: ['2026-10-07', '2026-10-08'] };
test('habit weeks use local calendar dates across year and daylight saving boundaries', () => {
  assert.deepEqual(weekDays(new Date(2026, 0, 1)).map(dateKey), ['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04']);
  assert.equal(weekDays(new Date(2026, 2, 29)).map(dateKey)[6], '2026-03-29');
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2026-13-01'), false);
});
test('checking and unchecking preserve independent habits and calculate current streak', () => {
  const other = { id:'walk', name:'Marcher', days:[] };
  const result = toggleHabitDay([habit,other], 'read', '2026-10-09');
  assert.equal(streak(result[0],new Date(2026,9,9)),3);
  assert.equal(streak(habit,new Date(2026,9,9)),2);
  assert.equal(streak(habit,new Date(2026,9,10)),0);
  assert.deepEqual(result[1],other);
  assert.deepEqual(habit.days,['2026-10-07','2026-10-08']);
  assert.deepEqual(toggleHabitDay(result,'read','2026-10-09')[0],habit);
});
test('history survives export/import, rejects malformed nested data and is copied independently', () => {
  const widget = {id:'h',type:'habits',title:'Rituels',x:1,y:1,width:12,height:4,habits:[habit]};
  const restored = parseDashboardExport(exportDashboard({name:'Personnel',widgets:[widget]}));
  assert.deepEqual(restored.widgets[0],widget);
  restored.widgets[0].habits[0].days.push('2026-10-09');
  assert.equal(habit.days.length,2);
  for(const invalid of [null,{},Array(21).fill(habit),[habit,habit],[{...habit,name:' '}],[{...habit,days:['2026-02-29']}],[{...habit,days:['2026-10-09','2026-10-09']}],[{...habit,token:'secret'}]]) assert.throws(()=>cleanHabits(invalid));
});
