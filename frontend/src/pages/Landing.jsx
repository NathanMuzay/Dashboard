import React, { useState } from 'react';
import Brand from '../components/Brand';
import Icon from '../components/Icon';
import ThemeToggle from '../components/ThemeToggle';

const LANDING_PREVIEWS = {
  notes: [
    '01 / Poser ses idées',
    'Moins d’onglets.\nPlus de place pour penser.',
    'Une note, un rendez-vous, une pause. Chaque chose trouve sa place.',
  ],
  focus: [
    '02 / Prendre son temps',
    '25 minutes.\nUne seule chose à la fois.',
    'Lancez un temps de concentration et avancez à votre rythme.',
  ],
  agenda: [
    '03 / Voir sa journée',
    'Le prochain rendez-vous,\nsans le chercher.',
    'Gardez vos repères du jour juste à côté de vos notes.',
  ],
};

export default function Landing({ onOpen }) {
  const [preview, setPreview] = useState('notes');

  return (
    <div className="site-shell">
      <header className="site-header">
        <Brand />
        <nav aria-label="Navigation principale">
          <a href="#apercu">L’espace Lumi</a>
          <ThemeToggle />
          <button className="text-button" onClick={() => onOpen('login')}>
            Se connecter
          </button>
          <button
            className="button button-dark"
            onClick={() => onOpen('register')}
          >
            Créer un compte <Icon name="arrow" size={16} />
          </button>
        </nav>
      </header>
      <main id="main">
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <i className="status-dot" /> Votre quotidien, à portée de main
            </span>
            <h1>
              Votre quotidien.
              <br />
              <em>Sous contrôle.</em>
            </h1>
            <p>
              Vos idées, vos rendez-vous et un peu de musique.
              <br className="desktop-break" /> Un espace calme pour organiser
              vos journées.
            </p>
            <div className="hero-actions">
              <button
                className="button button-dark"
                onClick={() => onOpen('register')}
              >
                Composer mon espace <Icon name="arrow" size={18} />
              </button>
              <a className="text-link" href="#apercu">
                Jeter un œil ↓
              </a>
            </div>
            <span className="hero-footnote">
              Personnel ou professionnel. Toujours à votre façon.
            </span>
          </div>
          <div
            className="product-preview"
            aria-label="Aperçu du tableau de bord"
          >
            <div className="preview-bar">
              <span className="preview-logo">lumi.</span>
              <span>
                Mon espace <span aria-hidden="true">↗</span>
              </span>
            </div>
            <div className="preview-heading">
              <small>UN PEU DE CLARTÉ</small>
              <strong>
                Une belle journée
                <br />
                commence ici.
              </strong>
              <span className="preview-sun">
                <Icon name="sun" size={38} />
              </span>
            </div>
            <div className="preview-grid">
              <div className="preview-note">
                <span>↗ &nbsp; CARNET</span>
                <p>
                  Une idée à garder.
                  <br />
                  Un projet à lancer.
                  <br />
                  <em>À vous de jouer.</em>
                </p>
                <i />
              </div>
              <div className="preview-focus">
                <span>UN MOMENT POUR SOI</span>
                <strong>
                  25<span>:00</span>
                </strong>
                <span className="preview-start">▶ &nbsp; Se concentrer</span>
              </div>
              <div className="preview-agenda">
                <span className="preview-time">14:30</span>
                <div>
                  <strong>Faire le point</strong>
                  <small>Prendre du recul, puis avancer.</small>
                </div>
                <span>↗</span>
              </div>
            </div>
            <div className="preview-bottom">
              <span>Votre espace, vos repères.</span>
              <span>01 — 03</span>
            </div>
          </div>
        </section>
        <section id="apercu" className="feature-section">
          <div>
            <span className="eyebrow">À chacun son organisation</span>
            <h2>
              Un bureau qui
              <br />
              vous ressemble.
            </h2>
            <p>
              Ajoutez ce qui vous aide. Déplacez ce qui vous gêne. Gardez le
              reste pour plus tard.
            </p>
            <div
              className="feature-tabs"
              role="tablist"
              aria-label="Découvrir les widgets"
            >
              {[
                ['notes', 'Notes'],
                ['focus', 'Focus'],
                ['agenda', 'Agenda'],
              ].map(([key, label], index, tabs) => (
                <button
                  key={key}
                  id={`tab-${key}`}
                  role="tab"
                  aria-selected={preview === key}
                  aria-controls="feature-panel"
                  tabIndex={preview === key ? 0 : -1}
                  onClick={() => setPreview(key)}
                  onKeyDown={(e) => {
                    if (
                      ['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)
                    ) {
                      e.preventDefault();
                      const next =
                        e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? tabs.length - 1
                            : (index +
                                (e.key === 'ArrowRight' ? 1 : -1) +
                                tabs.length) %
                              tabs.length;
                      setPreview(tabs[next][0]);
                      document.getElementById(`tab-${tabs[next][0]}`).focus();
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            id="feature-panel"
            className={`feature-panel feature-${preview}`}
            role="tabpanel"
            aria-labelledby={`tab-${preview}`}
          >
            <span className="eyebrow">{LANDING_PREVIEWS[preview][0]}</span>
            <h3>{LANDING_PREVIEWS[preview][1]}</h3>
            <p>{LANDING_PREVIEWS[preview][2]}</p>
            <button className="text-button" onClick={() => onOpen('register')}>
              Essayer dans mon espace <Icon name="arrow" size={18} />
            </button>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <Brand />
        <span>Un peu de clarté dans votre journée.</span>
        <a href="/api/docs" target="_blank" rel="noreferrer">
          Documentation API ↗
        </a>
      </footer>
    </div>
  );
}
