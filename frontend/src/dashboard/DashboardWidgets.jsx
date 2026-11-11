import React, { useEffect, useRef, useState } from 'react';
import { WIDGET_TYPES } from '../widgets/catalog';
import {
  handleSpotifyCallback,
  getStoredAuth,
} from '../widgets/spotify/spotifyClient';
import WidgetCard from './WidgetCard';
import WidgetEditor from './WidgetEditor';
import { resolveLayout } from './layout';
import { widgetConfigKey } from './widgetConfig';

export default function DashboardWidgets({ userId, widgets, onWidgetsChange }) {
  const setWidgets = onWidgetsChange;
  const [arranging, setArranging] = useState(false);
  const [removed, setRemoved] = useState(null);
  const [editor, setEditor] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [resizeSession, setResizeSession] = useState(null);
  const [manualRows, setManualRows] = useState(1);
  const boardRef = useRef(null);
  const gridRows =
    Math.max(
      manualRows,
      ...widgets.map((widget) => widget.y + widget.height - 1),
    ) + (draggedId !== null ? 1 : 0);

  // Check for Spotify auth callback in query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('code') || params.get('error')) {
      const stored = getStoredAuth();
      const clientId =
        stored?.clientId || import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
      handleSpotifyCallback(clientId).catch((err) => {
        console.warn('Spotify auth callback notification:', err.message);
      });
    }
  }, []);

  useEffect(() => {
    if (!resizeSession) return undefined;
    function resizeWidget(event) {
      const board = boardRef.current;
      if (!board) return;
      const styles = window.getComputedStyle(board);
      const paddingLeft = parseFloat(styles.paddingLeft);
      const gap = parseFloat(styles.columnGap);
      const cellWidth =
        (board.clientWidth -
          paddingLeft -
          parseFloat(styles.paddingRight) -
          gap * 11) /
        12;
      const widthChange = Math.round(
        (event.clientX - resizeSession.startX) / (cellWidth + gap),
      );
      const heightChange = Math.round(
        (event.clientY - resizeSession.startY) /
          (128 + parseFloat(styles.rowGap)),
      );
      setWidgets((current) =>
        resolveLayout(
          current.map((widget) => {
            if (widget.id !== resizeSession.id) return widget;
            return {
              ...widget,
              width: Math.min(
                12 - widget.x + 1,
                WIDGET_TYPES[widget.type]?.maxWidth || 12,
                Math.max(1, resizeSession.width + widthChange),
              ),
              height: Math.min(
                WIDGET_TYPES[widget.type]?.maxHeight || 6,
                Math.max(1, resizeSession.height + heightChange),
              ),
            };
          }),
          resizeSession.id,
        ),
      );
    }
    function stopResize() {
      setResizeSession(null);
    }
    window.addEventListener('pointermove', resizeWidget);
    window.addEventListener('pointerup', stopResize);
    return () => {
      window.removeEventListener('pointermove', resizeWidget);
      window.removeEventListener('pointerup', stopResize);
    };
  }, [resizeSession]);

  function saveWidget(widget) {
    const width = Math.min(
      WIDGET_TYPES[widget.type]?.maxWidth || 12,
      Math.max(1, Number(widget.width) || 1),
    );
    const height = Math.min(
      WIDGET_TYPES[widget.type]?.maxHeight || 6,
      Math.max(1, Number(widget.height) || 1),
    );
    const x = Math.min(13 - width, Math.max(1, Number(widget.x) || 1));
    const y = Math.min(100, Math.max(1, Number(widget.y) || 1));
    const nextWidget = { ...widget, x, y, width, height };
    const duplicate = widgets.some(
      (item) =>
        item.id !== widget.id &&
        widgetConfigKey(item) === widgetConfigKey(nextWidget),
    );
    if (duplicate) return false;
    if (editor.mode === 'add') {
      const addedWidget = { ...nextWidget, id: crypto.randomUUID() };
      setWidgets((current) =>
        resolveLayout([...current, addedWidget], addedWidget.id),
      );
    } else {
      setWidgets((current) =>
        resolveLayout(
          current.map((item) => (item.id === widget.id ? nextWidget : item)),
          widget.id,
        ),
      );
    }
    setEditor(null);
    return true;
  }

  function moveWidget(event) {
    event.preventDefault();
    if (draggedId === null || !dragPreview) return;
    setWidgets((current) =>
      resolveLayout(
        current.map((widget) =>
          widget.id === draggedId
            ? { ...widget, x: dragPreview.x, y: dragPreview.y }
            : widget,
        ),
        draggedId,
      ),
    );
    setDraggedId(null);
    setDragPreview(null);
  }

  function startResize(event, widget) {
    event.preventDefault();
    event.stopPropagation();
    setResizeSession({
      id: widget.id,
      startX: event.clientX,
      startY: event.clientY,
      width: widget.width,
      height: widget.height,
    });
  }

  function updateDragPreview(event) {
    if (draggedId === null) return;
    const board = event.currentTarget.getBoundingClientRect();
    const draggedWidget = widgets.find((widget) => widget.id === draggedId);
    if (!draggedWidget) return;
    const styles = window.getComputedStyle(event.currentTarget);
    const paddingLeft = parseFloat(styles.paddingLeft);
    const paddingTop = parseFloat(styles.paddingTop);
    const columnGap = parseFloat(styles.columnGap);
    const rowGap = parseFloat(styles.rowGap);
    const usableWidth =
      event.currentTarget.clientWidth -
      paddingLeft -
      parseFloat(styles.paddingRight) -
      columnGap * 11;
    const cellWidth = usableWidth / 12;
    const column = Math.max(
      1,
      Math.min(
        13 - draggedWidget.width,
        Math.floor(
          (event.clientX - board.left - paddingLeft) / (cellWidth + columnGap),
        ) + 1,
      ),
    );
    const row = Math.max(
      1,
      Math.floor((event.clientY - board.top - paddingTop) / (128 + rowGap)) + 1,
    );
    setDragPreview({
      x: column,
      y: row,
      width: draggedWidget.width,
      height: draggedWidget.height,
    });
  }

  return (
    <section className="widget-workspace" aria-labelledby="widget-space-title">
      <div className="widget-workspace-header">
        <div>
          <h2 id="widget-space-title">Votre tableau de bord</h2>
          <p className="muted workspace-subtitle">
            Un espace à composer, un widget à la fois.
          </p>
        </div>
        <div className="workspace-actions">
          <button
            className="button button-secondary"
            aria-pressed={arranging}
            onClick={() => {
              setArranging(!arranging);
              setResizeSession(null);
            }}
          >
            {arranging ? 'Terminer' : 'Organiser'}
          </button>
          <button
            className="button button-dark add-widget-button"
            onClick={() => setEditor({ mode: 'add' })}
          >
            <span aria-hidden="true">+</span> Ajouter un widget
          </button>
        </div>
      </div>
      <div className="widget-board-meta">
        <span>
          {widgets.length} widget{widgets.length !== 1 ? 's' : ''}
        </span>
        <span>
          {arranging
            ? 'Déplacez les en-têtes ou modifiez la position dans le formulaire.'
            : 'Sauvegarde automatique dans votre compte'}
        </span>
      </div>
      {removed && (
        <div className="undo-banner" role="status">
          <span>« {removed.title} » a été supprimé.</span>
          <button
            className="text-button"
            onClick={() => {
              setWidgets((current) =>
                resolveLayout([...current, removed], removed.id),
              );
              setRemoved(null);
            }}
          >
            Annuler
          </button>
          <button
            className="icon-button"
            aria-label="Fermer le message"
            onClick={() => setRemoved(null)}
          >
            ×
          </button>
        </div>
      )}
      {widgets.length === 0 && (
        <div className="empty-state">
          <h3>Un peu d’espace pour vos idées.</h3>
          <p>Ajoutez votre premier widget pour commencer.</p>
          <button
            className="button button-dark"
            onClick={() => setEditor({ mode: 'add' })}
          >
            Choisir un widget
          </button>
        </div>
      )}
      <div
        ref={boardRef}
        hidden={widgets.length === 0}
        className={`widget-board ${arranging ? 'is-arranging' : ''} ${draggedId !== null ? 'is-dragging' : ''}`}
        style={{ '--widget-grid-rows': gridRows }}
        onDragOver={(event) => {
          event.preventDefault();
          updateDragPreview(event);
        }}
        onDrop={moveWidget}
      >
        {draggedId !== null && (
          <div className="widget-grid-dots" aria-hidden="true">
            {Array.from({ length: gridRows * 12 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        )}
        {dragPreview && (
          <div
            className="widget-drag-preview"
            style={{
              gridColumn: `${dragPreview.x} / span ${dragPreview.width}`,
              gridRow: `${dragPreview.y} / span ${dragPreview.height}`,
            }}
            aria-hidden="true"
          />
        )}
        {[...widgets]
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((widget) => (
            <WidgetCard
              userId={userId}
              key={widget.id}
              widget={widget}
              arranging={arranging}
              onChange={(patch) =>
                setWidgets((current) =>
                  current.map((w) =>
                    w.id === widget.id ? { ...w, ...patch } : w,
                  ),
                )
              }
              onEdit={(item) => setEditor({ mode: 'edit', widget: item })}
              onRemove={(id) => {
                setRemoved(widgets.find((w) => w.id === id));
                setWidgets((current) => current.filter((w) => w.id !== id));
              }}
              onMove={(id, direction) =>
                setWidgets((current) => {
                  const ordered = [...current].sort(
                    (a, b) => a.y - b.y || a.x - b.x,
                  );
                  const index = ordered.findIndex((item) => item.id === id);
                  const target = index + direction;
                  if (target < 0 || target >= ordered.length) return current;
                  [ordered[index], ordered[target]] = [
                    ordered[target],
                    ordered[index],
                  ];
                  let y = 1;
                  return ordered.map((item) => {
                    const result = { ...item, x: 1, y };
                    y += item.height;
                    return result;
                  });
                })
              }
              onResizeStart={startResize}
              onDragStart={(event, id) => {
                setDraggedId(id);
                setDragPreview(null);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(id));
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragPreview(null);
              }}
            />
          ))}
      </div>
      {arranging && (
        <div className="widget-row-controls">
          <button
            type="button"
            className="add-row-button"
            onClick={() => setManualRows((rows) => rows + 1)}
            aria-label="Ajouter une ligne"
            title="Ajouter une ligne"
          >
            +
          </button>
          <span>{gridRows} lignes disponibles</span>
        </div>
      )}
      {editor && (
        <WidgetEditor
          widget={editor.widget}
          mode={editor.mode}
          onClose={() => setEditor(null)}
          onSave={saveWidget}
        />
      )}
    </section>
  );
}
