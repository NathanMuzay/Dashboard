import React from 'react';

export default function NotesWidget({ widget, onChange }) {
  return (
    <div className="notes-content">
      <textarea
        aria-label={`Contenu de ${widget.title}`}
        value={widget.content || ''}
        onChange={(event) => onChange({ content: event.target.value })}
        maxLength={2000}
        placeholder="Une idée, un rappel, quelques mots…"
      />
      <small>Vos notes sont sauvegardées avec ce dashboard.</small>
    </div>
  );
}
