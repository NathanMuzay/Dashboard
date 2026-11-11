import React, { useEffect, useState } from 'react';
import api from '../api';
import Dialog from '../components/Dialog';
import { cleanWidgets } from '../dashboardModel';
import { parseRepository } from '../widgets/github/githubClient';
import { WIDGET_TYPES } from '../widgets/catalog';
import WidgetEditorFields from '../widgets/WidgetEditorFields';

export default function WidgetEditor({ widget, mode, onClose, onSave }) {
  const [draft, setDraft] = useState(
    widget || {
      type: 'weather',
      title: 'Météo',
      city: 'Paris',
      x: 1,
      y: 5,
      width: 6,
      height: 2,
    },
  );
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);
  const [activating, setActivating] = useState(false);
  useEffect(() => {
    api('/services')
      .then(setSubscriptions)
      .catch((err) => setError(err.message));
  }, []);
  const serviceFor = (type) =>
    type === 'openai_chat'
      ? 'openai'
      : type.startsWith('github_')
        ? 'github'
        : type.startsWith('spotify_')
          ? 'spotify'
          : type.startsWith('gmail_')
            ? 'gmail'
            : ['agenda', 'calendar_week'].includes(type)
              ? 'google_calendar'
              : null;
  const type = WIDGET_TYPES[draft.type] || { label: draft.title };
  const selectedService = serviceFor(draft.type);
  const needsActivation =
    mode === 'add' &&
    selectedService &&
    !subscriptions.includes(selectedService);
  async function activateService() {
    setActivating(true);
    setError('');
    try {
      await api(`/services/${selectedService}`, { method: 'PUT' });
      setSubscriptions((items) => [...items, selectedService]);
      window.dispatchEvent(new Event('lumi:subscriptions-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setActivating(false);
    }
  }

  const update = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const handleTypeChange = (newType) => {
    const meta = WIDGET_TYPES[newType];
    setDraft((current) => ({
      ...current,
      type: newType,
      ...(newType === 'habits' && !current.habits ? { habits: ['Lire', 'Bouger', 'Prendre une pause'].map(name => ({ id: crypto.randomUUID(), name, days: [] })) } : {}),
      title: meta?.label || current.title,
      width: meta?.defaultWidth || current.width || 6,
      height: meta?.defaultHeight || current.height || 1,
      refreshInterval: newType === 'weather' ? 900 : newType.startsWith('github_') ? 300 : newType === 'spotify_player' ? 10 : 60,
    }));
    setError('');
  };

  function submit(event) {
    event.preventDefault();
    if (needsActivation || activating) return;
    let normalized = draft;
    if (draft.type.startsWith('github_')) {
      try {
        normalized = {
          ...draft,
          githubRepo: parseRepository(draft.githubRepo),
        };
      } catch (err) {
        setError(err.message);
        return;
      }
    }
    let validated;
    try {
      validated = cleanWidgets([
        {
          ...normalized,
          id: normalized.id ?? 'draft',
          title: draft.title.trim() || type.label,
        },
      ])[0];
    } catch (err) {
      setError(err.message);
      return;
    }
    const saved = onSave(validated);
    if (!saved)
      setError('Un widget avec les mêmes paramètres existe déjà (majuscules et minuscules ignorées pour les textes).');
  }

  return (
    <Dialog
      className="widget-editor"
      titleId="widget-editor-title"
      onClose={onClose}
    >
      <p className="section-label">
        <span>{mode === 'add' ? '01' : '02'}</span>{' '}
        {mode === 'add' ? 'Nouveau widget' : 'Configuration'}
      </p>
      <h2 id="widget-editor-title">
        {mode === 'add' ? 'Ajouter un widget' : 'Modifier le widget'}
      </h2>
      <form onSubmit={submit}>
        {mode === 'add' && (
          <div className="widget-type-picker">
            <label>
              Rechercher un widget
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <p className="field-hint">
              Choisissez un widget. Si nécessaire, activez son service
              ci-dessous.
            </p>
            {Object.entries(WIDGET_TYPES)
              .filter(([, meta]) =>
                `${meta.label} ${meta.eyebrow}`
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
              )
              .map(([key, value]) => (
                <button
                  type="button"
                  className={draft.type === key ? 'selected' : ''}
                  key={key}
                  aria-pressed={draft.type === key}
                  onClick={() => handleTypeChange(key)}
                >
                  <span aria-hidden="true">{value.icon}</span>
                  {value.label}
                </button>
              ))}
          </div>
        )}
        {needsActivation && (
          <div role="status">
            <p>Activez le service pour ajouter ce widget.</p>
            <button
              type="button"
              className="button button-secondary"
              disabled={activating}
              onClick={activateService}
            >
              {activating
                ? 'Activation…'
                : `Activer le service ${selectedService === 'openai' ? 'Mistral' : type.eyebrow}`}
            </button>
          </div>
        )}
        <label htmlFor="widget-title">Nom du widget</label>
        <input
          id="widget-title"
          value={draft.title}
          onChange={(event) => update('title', event.target.value)}
          maxLength="34"
          required
        />

        <WidgetEditorFields draft={draft} update={update} />

        <details className="layout-options">
          <summary>Taille et position</summary>
          <div className="widget-size-fields">
            <div>
              <label htmlFor="widget-width">Largeur · cases</label>
              <input
                id="widget-width"
                type="number"
                min="1"
                max={type.maxWidth || 12}
                value={draft.width}
                onChange={(event) =>
                  update('width', Number(event.target.value))
                }
              />
            </div>
            <div>
              <label htmlFor="widget-height">Hauteur · lignes</label>
              <input
                id="widget-height"
                type="number"
                min="1"
                max={type.maxHeight || 6}
                value={draft.height}
                onChange={(event) =>
                  update('height', Number(event.target.value))
                }
              />
            </div>
          </div>
          <div className="widget-size-fields">
            <div>
              <label htmlFor="widget-x">Position horizontale</label>
              <input
                id="widget-x"
                type="number"
                min="1"
                max="12"
                value={draft.x}
                onChange={(event) => update('x', Number(event.target.value))}
              />
            </div>
            <div>
              <label htmlFor="widget-y">Position verticale</label>
              <input
                id="widget-y"
                type="number"
                min="1"
                max="100"
                value={draft.y}
                onChange={(event) => update('y', Number(event.target.value))}
              />
            </div>
          </div>
        </details>
        {error && (
          <p className="widget-editor-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-dark widget-save"
          type="submit"
          disabled={!!needsActivation || activating}
        >
          {mode === 'add'
            ? 'Ajouter au dashboard'
            : 'Enregistrer les changements'}{' '}
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </Dialog>
  );
}
