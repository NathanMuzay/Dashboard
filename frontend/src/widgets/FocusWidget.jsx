import { notify } from '../../../bonus/frontend/Notifications';
import React, { useEffect, useRef, useState } from 'react';

export default function FocusWidget({ widget }) {
  const duration = Math.max(1, Number(widget.duration) || 25) * 60;
  const [remaining, setRemaining] = useState(duration);
  const [running, setRunning] = useState(false);
  const deadline = useRef(null);
  useEffect(() => {
    setRemaining(duration);
    setRunning(false);
  }, [duration]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const seconds = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000)
      );
      setRemaining(seconds);
      if (seconds === 0) { setRunning(false); clearInterval(timer); notify(`Session « ${widget.title} » terminée. Prenez une pause.`); }
    }, 250);
    return () => clearInterval(timer);
  }, [running]);
  function toggle() {
    if (running) setRunning(false);
    else {
      const seconds = remaining || duration;
      setRemaining(seconds);
      deadline.current = Date.now() + seconds * 1000;
      setRunning(true);
    }
  }
  return (
    <div className="focus-content">
      <div className="focus-clock" role="timer" aria-label="Temps restant">
        {String(Math.floor(remaining / 60)).padStart(2, '0')}
        <span>:{String(remaining % 60).padStart(2, '0')}</span>
      </div>
      <p role="status">
        {remaining === 0
          ? 'Session terminée. Prenez une pause.'
          : running
            ? 'Une chose à la fois.'
            : 'Un moment pour avancer.'}
      </p>
      <div className="focus-controls">
        <button className="button button-dark" onClick={toggle}>
          {running
            ? 'Pause'
            : remaining !== duration && remaining > 0
              ? 'Reprendre'
              : 'Démarrer'}
        </button>
        <button
          className="text-button"
          onClick={() => {
            setRunning(false);
            setRemaining(duration);
          }}
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}
