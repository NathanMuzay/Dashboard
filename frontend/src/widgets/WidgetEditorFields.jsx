import React from 'react';

export default function WidgetEditorFields({ draft, update }) {
  const refreshing = ![
    'habits',
    'openai_chat',
    'notes',
    'focus',
    'gmail_compose',
    'spotify_player',
  ].includes(draft.type);
  return (
    <>
      {refreshing && (
        <>
          <label htmlFor="widget-refresh">Rafraîchissement (secondes)</label>
          <input
            id="widget-refresh"
            type="number"
            min={draft.type.startsWith('github_') || draft.type === 'weather' ? 300 : 30}
            max="3600"
            required
            value={
              draft.refreshInterval ??
              (draft.type === 'weather' ? 900 : draft.type.startsWith('github_') ? 300 : 60)
            }
            onChange={(event) =>
              update('refreshInterval', Number(event.target.value))
            }
          />
          <p className="field-hint">
            Actualisation lorsque la page est visible. Un intervalle plus long
            réduit les appels au fournisseur.
          </p>
        </>
      )}
      <SpecificEditorFields draft={draft} update={update} />
    </>
  );
}
function SpecificEditorFields({ draft, update }) {
  if (draft.type === 'habits') {
    const habits = draft.habits || [];
    return <div className="habits-editor">
      <p>Une habitude par ligne, à retrouver chaque jour. Renommer une habitude conserve son historique.</p>
      {habits.map((habit, index) => <div className="habits-editor-row" key={habit.id}>
        <input aria-label={`Habitude ${index + 1}`} value={habit.name} maxLength={80} required onChange={event => update('habits', habits.map(item => item.id === habit.id ? { ...item, name: event.target.value } : item))} />
        <button type="button" aria-label={`Retirer l’habitude ${index + 1}`} onClick={() => update('habits', habits.filter(item => item.id !== habit.id))}>Retirer</button>
      </div>)}
      <button type="button" disabled={habits.length >= 20} onClick={() => update('habits', [...habits, { id: crypto.randomUUID(), name: '', days: [] }])}>+ Ajouter une habitude</button>
      <p className="field-hint">20 habitudes maximum. Retirer une ligne puis enregistrer supprime son historique ; Annuler conserve la version précédente.</p>
    </div>;
  }
  if (draft.type === 'github_pushes'  || draft.type === 'github_graph')
    return (
      <>
        <label htmlFor="github-repo">Dépôt GitHub</label>
        <input
          id="github-repo"
          value={draft.githubRepo || ''}
          onChange={(event) => update('githubRepo', event.target.value)}
          required
          placeholder="propriétaire/dépôt ou https://github.com/propriétaire/dépôt"
        />
        {draft.type === 'github_pushes' && (
          <>
            <label htmlFor="github-limit">Nombre de push à afficher</label>
            <input
              id="github-limit"
              type="number"
              min="1"
              max="20"
              required
              value={draft.githubLimit ?? 5}
              onChange={(event) =>
                update('githubLimit', Number(event.target.value))
              }
            />
          </>
        )}
        <p className="field-hint">
          Dépôts publics accessibles directement. Pour un dépôt privé, connectez
          un jeton GitHub depuis le widget après sa création.
        </p>
      </>
    );

  if (draft.type === 'gmail_unread')
    return (
      <>
        <label htmlFor="gmail-limit">Nombre de mails à afficher</label>
        <input
          id="gmail-limit"
          type="number"
          min="1"
          max="20"
          required
          value={draft.gmailLimit ?? 5}
          onChange={(event) => update('gmailLimit', Number(event.target.value))}
        />
        <p className="field-hint">
          Les derniers mails non lus de la boîte de réception. Actualisation
          selon l’intervalle configuré.
        </p>
        <label htmlFor="gmail-client">
          Client ID Google (facultatif si configuré globalement)
        </label>
        <input
          id="gmail-client"
          value={draft.gmailClientId || ''}
          onChange={(event) => update('gmailClientId', event.target.value)}
          placeholder="…apps.googleusercontent.com"
        />
        <p className="field-hint">
          Connectez votre compte depuis le widget après sa création.
        </p>
      </>
    );
  if (draft.type === 'gmail_compose')
    return (
      <>
        <label htmlFor="gmail-compose-client">
          Client ID Google (facultatif si configuré globalement)
        </label>
        <input
          id="gmail-compose-client"
          value={draft.gmailClientId || ''}
          onChange={(event) => update('gmailClientId', event.target.value)}
          placeholder="…apps.googleusercontent.com"
        />
        <label htmlFor="gmail-account">Compte Gmail (facultatif)</label>
        <input
          id="gmail-account"
          type="email"
          value={draft.gmailAccount || ''}
          onChange={(event) => update('gmailAccount', event.target.value)}
          placeholder="vous@gmail.com"
        />
        <p className="field-hint">
          Rédigez dans Lumi et connectez le compte Gmail qui enverra votre
          message.
        </p>
      </>
    );
  if (draft.type === 'weather') {
    return (
      <>
        <p className="field-hint">
          Conditions actuelles Open-Meteo, sans compte fournisseur. Précisez le pays en cas d’homonyme (Paris, France).
        </p>
        <label htmlFor="widget-city">Ville</label>
        <input
          id="widget-city"
          value={draft.city || ''}
          onChange={(event) => update('city', event.target.value)}
          maxLength="80"
          minLength="2"
          required
        />
      </>
    );
  }

  if (draft.type === 'calendar_week')
    return (
      <p className="field-hint">
        Cours et activités avec horaires, sur une seule journée. Les journées
        entières et les événements qui passent minuit sont exclus. Les
        récurrences Google Calendar sont synchronisées.
      </p>
    );

  if (draft.type === 'agenda') {
    return (
      <p className="field-hint">
        Événements de 7 jours minimum, triés par échéance croissante. Sans
        échéance renseignée, la fin de l’événement sert de référence.
      </p>
    );
  }

  if (draft.type === 'notes') {
    return (
      <>
        <label htmlFor="widget-content">Contenu</label>
        <textarea
          id="widget-content"
          value={draft.content || ''}
          onChange={(event) => update('content', event.target.value)}
          rows="3"
          maxLength="2000"
        />
      </>
    );
  }

  if (draft.type === 'focus') {
    return (
      <>
        <label htmlFor="widget-duration">Durée d’une session (minutes)</label>
        <input
          id="widget-duration"
          type="number"
          min="5"
          max="120"
          value={draft.duration ?? 25}
          onChange={(event) => update('duration', Number(event.target.value))}
        />
      </>
    );
  }

  if (draft.type === 'spotify_player') {
    return (
      <>
        <label htmlFor="widget-spotify-client-id">
          Spotify Client ID (optionnel si configuré globalement)
        </label>
        <input
          id="widget-spotify-client-id"
          type="text"
          placeholder="Ex: 4a3e7b..."
          value={draft.clientId || ''}
          onChange={(event) => update('clientId', event.target.value)}
        />
        <label htmlFor="widget-spotify-refresh">
          Intervalle de rafraîchissement (secondes, min 5)
        </label>
        <input
          id="widget-spotify-refresh"
          type="number"
          min="5"
          max="120"
          value={draft.refreshInterval ?? 10}
          onChange={(event) =>
            update('refreshInterval', Number(event.target.value))
          }
        />
      </>
    );
  }

  if (draft.type === 'spotify_top') {
    return (
      <>
        <label htmlFor="widget-spotify-client-id-top">
          Spotify Client ID (optionnel si configuré globalement)
        </label>
        <input
          id="widget-spotify-client-id-top"
          type="text"
          placeholder="Ex: 4a3e7b..."
          value={draft.clientId || ''}
          onChange={(event) => update('clientId', event.target.value)}
        />
        <div className="widget-size-fields">
          <div>
            <label htmlFor="widget-spotify-timerange">Période</label>
            <select
              id="widget-spotify-timerange"
              value={draft.timeRange || 'short_term'}
              onChange={(event) => update('timeRange', event.target.value)}
            >
              <option value="short_term">4 dernières semaines</option>
              <option value="medium_term">6 derniers mois</option>
              <option value="long_term">Toutes les années</option>
            </select>
          </div>
          <div>
            <label htmlFor="widget-spotify-limit">Nombre de titres</label>
            <input
              id="widget-spotify-limit"
              type="number"
              min="1"
              max="10"
              value={draft.limit ?? 3}
              onChange={(event) => update('limit', Number(event.target.value))}
            />
          </div>
        </div>
      </>
    );
  }

  return null;
}
