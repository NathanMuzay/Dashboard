import useRefresh from '../../hooks/useRefresh';
import React, { useEffect, useState } from 'react';
import {
  getTopTracks,
  getStoredAuth,
  redirectToSpotifyAuthorize,
  getSpotifyRedirectUri,
} from './spotifyClient';

function SpotifyLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="Spotify" role="img">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.305c-.216.353-.674.464-1.026.248-2.812-1.718-6.352-2.107-10.523-1.155-.403.092-.803-.162-.895-.565-.092-.403.162-.803.565-.895 4.568-1.043 8.487-.604 11.63 1.341.353.216.465.674.249 1.026zm1.467-3.26c-.272.443-.854.582-1.297.31-3.218-1.978-8.125-2.55-11.93-1.394-.498.15-1.03-.134-1.18-.632-.15-.499.133-1.03.632-1.181 4.354-1.321 9.76-.684 13.465 1.599.443.272.582.855.31 1.298zm.126-3.41c-3.858-2.29-10.222-2.502-13.899-1.385-.591.18-1.222-.154-1.402-.746-.18-.591.154-1.222.746-1.401 4.227-1.284 11.258-1.038 15.698 1.597.532.316.706 1.008.39 1.54-.316.533-1.008.706-1.54.391l.007.004z" />
    </svg>
  );
}

const TIME_RANGES = {
  short_term: '4 semaines',
  medium_term: '6 mois',
  long_term: 'Toujours',
};

export default function SpotifyTopTracksWidget({ widget }) {
  const [auth, setAuth] = useState(getStoredAuth());
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(widget.timeRange || 'short_term');

  const tick = useRefresh(widget.refreshInterval, !!auth);
  useEffect(() => { setTimeRange(widget.timeRange || 'short_term'); }, [widget.timeRange]);
  const limit = Math.min(10, Math.max(1, Number(widget.limit) || 3));

  useEffect(() => {
    function handleAuthChange(event) {
      setAuth(event.detail);
    }
    window.addEventListener('lumi:spotify-auth-changed', handleAuthChange);
    return () => window.removeEventListener('lumi:spotify-auth-changed', handleAuthChange);
  }, []);

  useEffect(() => {
    if (!auth) {
      setTracks([]);
      return;
    }
    let isCancelled = false;
    setLoading(true);
    setError(null);

    getTopTracks(timeRange, limit)
      .then(data => {
        if (!isCancelled) {
          setTracks(data?.items || []);
        }
      })
      .catch(err => {
        if (!isCancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [auth, timeRange, limit, tick]);

  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      await redirectToSpotifyAuthorize(widget.clientId);
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  }

  if (!auth) {
    return (
      <div className="spotify-widget-content spotify-disconnected">
        <div className="spotify-badge-header">
          <SpotifyLogo size={18} />
          <span>Top Titres Spotify</span>
        </div>
        <p className="spotify-notice">Authentifiez-vous pour afficher vos titres les plus écoutés.</p>
        <button
          type="button"
          className="button button-dark spotify-btn spotify-btn-primary"
          onClick={handleConnect}
          disabled={connecting}
        >
          <SpotifyLogo size={14} />
          {connecting ? 'Génération PKCE & redirection…' : 'Se connecter avec Spotify'}
        </button>
        {error && <span className="spotify-error-message">{error}</span>}
        {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
          <a
            href={window.location.href.replace('//localhost', '//127.0.0.1')}
            className="spotify-link-btn"
            style={{ marginTop: '6px', display: 'inline-block' }}
          >
            Ouvrir sur 127.0.0.1 ↗
          </a>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="spotify-widget-content spotify-error-state">
        <div className="spotify-badge-header">
          <SpotifyLogo size={16} />
          <span>Top Titres</span>
        </div>
        <p className="spotify-error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="spotify-widget-content spotify-top-tracks">
      <div className="spotify-top-header">
        <div className="spotify-time-range-picker">
          {Object.entries(TIME_RANGES).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`spotify-range-pill ${timeRange === key ? 'active' : ''}`}
              onClick={() => setTimeRange(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {loading && <span className="spotify-pulse-dot" title="Chargement..." />}
      </div>

      <ul className="spotify-track-list">
        {tracks.map((track, idx) => {
          const cover = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url;
          return (
            <li key={track.id || idx} className="spotify-track-item">
              <span className="spotify-track-rank">0{idx + 1}</span>
              {cover && <img src={cover} alt="" className="spotify-mini-cover" />}
              <div className="spotify-mini-info">
                <a
                  href={track.external_urls?.spotify || '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="spotify-mini-title"
                >
                  {track.name}
                </a>
                <small className="spotify-mini-artist">
                  {(track.artists || []).map(a => a.name).join(', ')}
                </small>
              </div>
            </li>
          );
        })}
        {tracks.length === 0 && !loading && (
          <li className="spotify-empty-list">Aucun titre disponible sur cette période.</li>
        )}
      </ul>

      <div className="spotify-footer">
        <div className="spotify-attribution">
          <SpotifyLogo size={14} />
          <a href="https://open.spotify.com" target="_blank" rel="noreferrer noopener">
            Spotify ↗
          </a>
        </div>
        <small className="spotify-refresh-hint">{tracks.length} titres</small>
      </div>
    </div>
  );
}

