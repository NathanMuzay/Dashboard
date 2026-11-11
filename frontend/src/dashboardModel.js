import { cleanHabits } from '../../bonus/frontend/habits/habitModel.js';
const common = ['id', 'type', 'title', 'x', 'y', 'width', 'height', 'refreshInterval'];
const fields = {
  habits: ['habits'],
  openai_chat: [],
  notes: ['content'], focus: ['duration', 'completed'], weather: ['city', 'temperature', 'condition'],
  agenda: [], calendar_week: [], github_pushes: ['githubRepo', 'githubLimit'], github_graph: ['githubRepo'],
  gmail_unread: ['gmailClientId', 'gmailLimit'], gmail_compose: ['gmailClientId', 'gmailAccount'],
  spotify_player: ['clientId'], spotify_top: ['clientId', 'timeRange', 'limit'],
};
export function cleanWidgets(widgets) {
  if (!Array.isArray(widgets) || widgets.length > 100) throw new Error('Le dashboard doit contenir au maximum 100 widgets.');
  const ids = new Set();
  return widgets.map(widget => {
    if (!widget || !fields[widget.type]) throw new Error('Type de widget inconnu.');
    if (!['string', 'number'].includes(typeof widget.id) || ids.has(String(widget.id))) throw new Error('Identifiants de widgets invalides.');
    ids.add(String(widget.id));
    if (typeof widget.title !== 'string' || !widget.title.trim() || widget.title.length > 80) throw new Error('Titre de widget invalide.');
    for (const [key, max] of [['x', 12], ['y', 1000], ['width', 12], ['height', 6]]) {
      if (!Number.isInteger(widget[key]) || widget[key] < 1 || widget[key] > max) throw new Error('Taille ou position de widget invalide.');
    }
    if (widget.x + widget.width > 13) throw new Error('Le widget dépasse la grille.');
    for (const [key, min, max] of [['refreshInterval',5,3600], ['duration',5,120], ['gmailLimit',1,20], ['githubLimit',1,20], ['limit',1,10]]) {
      if (widget[key] !== undefined && (!Number.isInteger(widget[key]) || widget[key] < min || widget[key] > max)) throw new Error(`Valeur invalide : ${key} (${min}–${max}).`);
    }
    if (widget.type === 'weather' && widget.city !== undefined && (typeof widget.city !== 'string' || widget.city.trim().length < 2 || widget.city.length > 80)) throw new Error('Ville attendue : 2–80 caractères.');
    if (widget.timeRange !== undefined && !['short_term','medium_term','long_term'].includes(widget.timeRange)) throw new Error('Période Spotify invalide.');
    for (const key of ['content','city','temperature','condition','githubRepo','gmailClientId','gmailAccount','clientId']) {
      if (widget[key] !== undefined && typeof widget[key] !== 'string') throw new Error(`Texte attendu : ${key}.`);
    }
    if (widget.type.startsWith('github_') && (typeof widget.githubRepo !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(widget.githubRepo) || widget.githubRepo.endsWith('/..'))) throw new Error('Dépôt GitHub invalide.');
    if (widget.refreshInterval !== undefined) {
      const min = (widget.type.startsWith('github_') || widget.type === 'weather') ? 300 : widget.type === 'spotify_player' ? 5 : 30;
      const max = widget.type === 'spotify_player' ? 120 : 3600;
      if (widget.refreshInterval < min || widget.refreshInterval > max) throw new Error(`Rafraîchissement attendu : ${min}–${max} secondes.`);
    }
    const result = {};
    for (const key of [...common, ...fields[widget.type]]) {
      if (key === 'habits') { result.habits = cleanHabits(widget.habits); continue; }
      if (widget[key] === undefined) continue;
      if (typeof widget[key] === 'object' || (typeof widget[key] === 'string' && widget[key].length > 8000)) throw new Error('Paramètre de widget invalide.');
      result[key] = widget[key];
    }
    return result;
  });
}
export function parseDashboardExport(text) {
  const data = JSON.parse(text);
  if (data.format !== 'lumi-dashboard' || data.version !== 1 || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80) throw new Error('Format de dashboard non reconnu.');
  return { name: data.name.trim(), widgets: cleanWidgets(data.widgets) };
}
export function exportDashboard(dashboard) {
  return JSON.stringify({ format: 'lumi-dashboard', version: 1, name: dashboard.name, widgets: cleanWidgets(dashboard.widgets) }, null, 2);
}
