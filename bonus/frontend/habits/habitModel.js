export const MAX_HABITS = 20;
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDay(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  next.setDate(next.getDate() + amount);
  return next;
}
export function weekDays(today, offset = 0) {
  const monday = shiftDay(today, -((today.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2099-12-31') return false;
  const [y, m, d] = value.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d, 12)) === value;
}
export function cleanHabits(value = []) {
  if (!Array.isArray(value) || value.length > MAX_HABITS) throw new Error('20 habitudes maximum par tracker.');
  const ids = new Set();
  return value.map(habit => {
    if (!habit || typeof habit !== 'object' || Array.isArray(habit) || Object.keys(habit).some(k => !['id', 'name', 'days'].includes(k)) || typeof habit.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(habit.id) || ids.has(habit.id)) throw new Error('Identifiant d’habitude invalide ou dupliqué.');
    ids.add(habit.id);
    if (typeof habit.name !== 'string' || !habit.name.trim() || habit.name.length > 80) throw new Error('Nom d’habitude attendu : 1 à 80 caractères.');
    if (!Array.isArray(habit.days) || habit.days.length > 3660 || habit.days.some(day => !validDate(day)) || new Set(habit.days).size !== habit.days.length) throw new Error('Historique d’habitude invalide (3 660 jours maximum).');
    return { id: habit.id, name: habit.name, days: [...habit.days].sort() };
  });
}
export function toggleHabitDay(habits, id, day) {
  return cleanHabits(habits.map(habit => habit.id !== id ? habit : {
    ...habit, days: habit.days.includes(day) ? habit.days.filter(value => value !== day) : [...habit.days, day],
  }));
}
export function streak(habit, today = new Date()) {
  const days = new Set(habit.days);
  let date = days.has(dateKey(today)) ? today : shiftDay(today, -1);
  let count = 0;
  while (days.has(dateKey(date))) { count++; date = shiftDay(date, -1); }
  return count;
}
