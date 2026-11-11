import React, { useEffect, useState } from 'react';
import Icon from './Icon';

export default function ThemeToggle() {
  const [dark, setDark] = useState(
    document.documentElement.dataset.theme === 'dark',
  );
  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.dataset.theme === 'dark');
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setDark(next === 'dark');
    try {
      localStorage.setItem('lumi_theme', next);
    } catch {
      /* The theme still works for this page. */
    }
  }
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Mode nuit"
      aria-pressed={dark}
      onClick={toggle}
      title={dark ? 'Passer en mode jour' : 'Passer en mode nuit'}
    >
      {dark ? (
        <Icon name="sun" size={17} />
      ) : (
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
        </svg>
      )}
      <span>{dark ? 'Nuit' : 'Jour'}</span>
    </button>
  );
}
