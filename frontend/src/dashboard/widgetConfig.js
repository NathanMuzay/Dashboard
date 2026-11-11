import { WIDGET_CONFIG_KEYS } from '../widgets/catalog.js';

// Compare user text without changing the displayed value or case-sensitive client IDs.
const caseInsensitiveFields = new Set(['title', 'content', 'city', 'githubRepo', 'gmailAccount']);
const untimedTypes = new Set(['habits', 'openai_chat', 'notes', 'focus', 'gmail_compose']);

export function widgetConfigKey(widget) {
  const keys = [
    ...(WIDGET_CONFIG_KEYS[widget.type] || ['type', 'title']),
    ...(!untimedTypes.has(widget.type) ? ['refreshInterval'] : []),
  ];
  return JSON.stringify(
    keys.reduce((config, key) => {
      const value = key === 'refreshInterval'
        ? widget[key] ?? (widget.type === 'weather' ? 900 : widget.type.startsWith('github_') ? 300 : widget.type === 'spotify_player' ? 10 : 60)
        : widget[key];
      config[key] = typeof value === 'string'
        ? (caseInsensitiveFields.has(key) ? value.trim().toLowerCase() : value.trim())
        : (value ?? '');
      return config;
    }, {}),
  );
}
