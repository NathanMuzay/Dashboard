import React from 'react';
import useWidgetSize from '../hooks/useWidgetSize';
import { WIDGET_TYPES } from '../widgets/catalog';
import WidgetContent from '../widgets/WidgetContent';

function WidgetIcon({ type }) {
  const meta = WIDGET_TYPES[type];
  return (
    <span className="widget-icon" aria-hidden="true">
      {meta?.icon || '◻'}
    </span>
  );
}

export default function WidgetCard({
  userId,
  widget,
  onEdit,
  onRemove,
  onDragStart,
  onDragEnd,
  onResizeStart,
  arranging,
  onChange,
  onMove,
}) {
  const sizeRef = useWidgetSize();
  const type = WIDGET_TYPES[widget.type] || {
    label: widget.title,
    eyebrow: 'Widget',
    color: 'sand',
  };
  return (
    <article
      ref={sizeRef}
      className={`widget-card widget-${type.color} ${arranging ? 'is-arranging' : ''} ${widget.type === 'spotify_player' ? 'spotify-widget-card' : ''} ${widget.type === 'gmail_compose' ? 'gmail-compose-card' : ''}`}
      style={{
        gridColumn: `${widget.x} / span ${widget.width}`,
        gridRow: `${widget.y} / span ${widget.height}`,
      }}
    >
      <div
        className="widget-card-header"
        draggable={arranging}
        onDragStart={(event) => onDragStart(event, widget.id)}
        onDragEnd={onDragEnd}
      >
        <div className="widget-heading">
          <WidgetIcon type={widget.type} />
          <div>
            <span>{type.eyebrow}</span>
            <h3>{widget.title}</h3>
          </div>
        </div>
        <div className="widget-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => onEdit(widget)}
            aria-label={`Modifier ${widget.title}`}
            title="Modifier"
          >
            ✎
          </button>
          <button
            type="button"
            className="icon-button danger"
            onClick={() => onRemove(widget.id)}
            aria-label={`Supprimer ${widget.title}`}
            title="Supprimer"
          >
            ×
          </button>
        </div>
      </div>
      {arranging && (
        <div className="widget-order-controls">
          <button
            type="button"
            aria-label={`Monter ${widget.title}`}
            onClick={() => onMove(widget.id, -1)}
          >
            ↑ Monter
          </button>
          <button
            type="button"
            aria-label={`Descendre ${widget.title}`}
            onClick={() => onMove(widget.id, 1)}
          >
            ↓ Descendre
          </button>
        </div>
      )}
      <WidgetContent widget={widget} onChange={onChange} userId={userId} />
      {arranging && (
        <span className="drag-hint">
          Déplacer par l’en-tête · ou utiliser Modifier
        </span>
      )}
      {arranging && (
        <button
          type="button"
          className="widget-resize-handle"
          draggable="false"
          onDragStart={(event) => event.preventDefault()}
          onPointerDown={(event) => onResizeStart(event, widget)}
          aria-label={`Redimensionner ${widget.title}`}
          title="Redimensionner"
        >
          <span aria-hidden="true" />
        </button>
      )}
    </article>
  );
}
