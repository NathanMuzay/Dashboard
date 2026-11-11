import React, { useEffect, useRef } from 'react';

export default function Dialog({ children, titleId, onClose, className = '' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`app-dialog ${className}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [...ref.current.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        )].filter(element => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            closeRef.current();
        }
      }}
    >
      <button
        className="modal-close"
        onClick={onClose}
        aria-label="Fermer la fenêtre"
      >
        ×
      </button>
      {children}
    </dialog>
  );
}
