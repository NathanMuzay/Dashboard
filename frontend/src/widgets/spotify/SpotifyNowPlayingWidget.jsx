import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCurrentlyPlaying,
  getStoredAuth,
  redirectToSpotifyAuthorize,
  clearStoredAuth,
  getSpotifyRedirectUri,
  pausePlayback,
  resumePlayback,
  seekPlayback,
  skipToNext,
  skipToPrevious,
  checkTracksSaved,
  saveTracks,
  removeSavedTracks,
  getUserPlaylists,
  addTracksToPlaylist,
} from './spotifyClient';

/* ─── Icônes SVG intégrées ────────────────────────────────────── */
function SpotifyLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.305c-.216.353-.674.464-1.026.248-2.812-1.718-6.352-2.107-10.523-1.155-.403.092-.803-.162-.895-.565-.092-.403.162-.803.565-.895 4.568-1.043 8.487-.604 11.63 1.341.353.216.465.674.249 1.026zm1.467-3.26c-.272.443-.854.582-1.297.31-3.218-1.978-8.125-2.55-11.93-1.394-.498.15-1.03-.134-1.18-.632-.15-.499.133-1.03.632-1.181 4.354-1.321 9.76-.684 13.465 1.599.443.272.582.855.31 1.298zm.126-3.41c-3.858-2.29-10.222-2.502-13.899-1.385-.591.18-1.222-.154-1.402-.746-.18-.591.154-1.222.746-1.401 4.227-1.284 11.258-1.038 15.698 1.597.532.316.706 1.008.39 1.54-.316.533-1.008.706-1.54.391l.007.004z" />
    </svg>
  );
}

function IconPrev() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

function IconNext() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 18l8.5-6L6 6v12zm8.5-6v6H17V6h-2.5z" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function IconHeart({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function IconPlaylist() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

/* ─── Utilitaire temps ─────────────────────────────────────────── */
function formatMs(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/* ─── Composant principal ──────────────────────────────────────── */
export default function SpotifyNowPlayingWidget({ widget }) {
  const [auth, setAuth] = useState(getStoredAuth());
  const [playback, setPlayback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);

  // Controls state
  const [actionPending, setActionPending] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  // Playlist modal
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistSuccess, setPlaylistSuccess] = useState(null);

  // Local progress interpolation
  const [localProgress, setLocalProgress] = useState(0);
  const progressRef = useRef(null);
  const timerRef = useRef(null);

  const refreshInterval = Math.min(120, Math.max(5, Number(widget.refreshInterval) || 10));

  /* auth change listener */
  useEffect(() => {
    function handleAuthChange(event) { setAuth(event.detail); }
    window.addEventListener('lumi:spotify-auth-changed', handleAuthChange);
    return () => window.removeEventListener('lumi:spotify-auth-changed', handleAuthChange);
  }, []);

  /* fetch playback state */
  const fetchPlayback = useCallback(async () => {
    if (!getStoredAuth()) return;
    try {
      setError(null);
      const data = await getCurrentlyPlaying();
      setPlayback(data);
      if (data?.progress_ms !== undefined) {
        setLocalProgress(data.progress_ms);
      }
      // Check if current track is liked
      if (data?.item?.id) {
        const saved = await checkTracksSaved([data.item.id]);
        setIsLiked(Array.isArray(saved) ? saved[0] : false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) { setPlayback(null); return undefined; }
    setLoading(true);
    fetchPlayback();
    timerRef.current = setInterval(fetchPlayback, refreshInterval * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [auth, refreshInterval, fetchPlayback]);

  /* smooth local progress bar interpolation */
  useEffect(() => {
    if (!playback?.is_playing || !playback?.duration_ms) {
      if (progressRef.current) clearInterval(progressRef.current);
      return;
    }
    progressRef.current = setInterval(() => {
      setLocalProgress(prev => Math.min(prev + 1000, playback.duration_ms));
    }, 1000);
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, [playback?.is_playing, playback?.duration_ms, playback?.progress_ms]);

  /* ─── Handlers de contrôle ─── */
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

  async function handlePlayPause() {
    if (actionPending) return;
    setActionPending(true);
    try {
      if (playback?.is_playing) {
        await pausePlayback();
        setPlayback(prev => prev ? { ...prev, is_playing: false } : prev);
      } else {
        await resumePlayback();
        setPlayback(prev => prev ? { ...prev, is_playing: true } : prev);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActionPending(false);
      setTimeout(fetchPlayback, 800);
    }
  }

  async function handleSeek(event) {
    const positionMs = Number(event.target.value);
    setLocalProgress(positionMs);
    try {
      await seekPlayback(positionMs);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleNext() {
    if (actionPending) return;
    setActionPending(true);
    try {
      await skipToNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionPending(false);
      setTimeout(fetchPlayback, 800);
    }
  }

  async function handlePrev() {
    if (actionPending) return;
    setActionPending(true);
    try {
      await skipToPrevious();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionPending(false);
      setTimeout(fetchPlayback, 800);
    }
  }

  async function handleLike() {
    if (!playback?.item?.id || actionPending) return;
    const id = playback.item.id;
    setActionPending(true);
    try {
      if (isLiked) {
        await removeSavedTracks([id]);
        setIsLiked(false);
      } else {
        await saveTracks([id]);
        setIsLiked(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActionPending(false);
    }
  }

  async function handleOpenPlaylistModal() {
    setShowPlaylistModal(true);
    setPlaylistSuccess(null);
    if (playlists.length > 0) return;
    setPlaylistLoading(true);
    try {
      const data = await getUserPlaylists(20);
      setPlaylists(data?.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setPlaylistLoading(false);
    }
  }

  async function handleAddToPlaylist(playlistId) {
    if (!playback?.item?.uri) return;
    try {
      await addTracksToPlaylist(playlistId, [playback.item.uri]);
      setPlaylistSuccess(playlistId);
      setTimeout(() => {
        setShowPlaylistModal(false);
        setPlaylistSuccess(null);
      }, 1500);
    } catch (err) {
      setError(err.message);
      setShowPlaylistModal(false);
    }
  }

  /* ─── Rendu : non connecté ─── */
  if (!auth) {
    return (
      <div className="spotify-widget-content spotify-disconnected">
        <div className="spotify-badge-header">
          <SpotifyLogo size={18} />
          <span>Spotify</span>
        </div>
        <p className="spotify-notice">Connectez-vous pour accéder à votre musique.</p>
        <button
          type="button"
          className="button button-dark spotify-btn spotify-btn-primary"
          onClick={handleConnect}
          disabled={connecting}
        >
          <SpotifyLogo size={14} />
          {connecting ? 'Redirection…' : 'Se connecter avec Spotify'}
        </button>
        {error && <p className="spotify-error-message" role="alert">{error}</p>}
        {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
          <a
            href={window.location.href.replace('//localhost', '//127.0.0.1')}
            className="spotify-link-btn"
            style={{ marginTop: '6px', display: 'inline-block' }}
          >
            Ouvrir sur 127.0.0.1 ↗
          </a>
        )}
        <small className="spotify-redirect-hint">
          Redirect URI : <code>{getSpotifyRedirectUri()}</code>
        </small>
      </div>
    );
  }

  /* ─── Rendu : idle ─── */
  if (!playback || !playback.item) {
    return (
      <div className="spotify-widget-content spotify-idle">
        <div className="spotify-badge-header">
          <SpotifyLogo size={16} />
          <span>Spotify · En veille</span>
          {loading && <span className="spotify-pulse-dot" />}
        </div>
        <div className="spotify-idle-message">
          <p>Aucune musique en cours d'écoute.</p>
          <small>Lancez un titre sur Spotify ({refreshInterval}s)</small>
        </div>
        <div className="spotify-attribution">
          <a href="https://open.spotify.com" target="_blank" rel="noreferrer noopener">Ouvrir Spotify ↗</a>
        </div>
      </div>
    );
  }

  const track = playback.item;
  const isPlaying = playback.is_playing;
  const albumImage = track.album?.images?.[1]?.url || track.album?.images?.[0]?.url;
  const artists = (track.artists || []).map(a => a.name).join(', ');
  const trackUrl = track.external_urls?.spotify || 'https://open.spotify.com';
  const duration = track.duration_ms || 1;

  return (
    <div className="main-music-card">
      <div className="track-info">
        <a href={trackUrl} target="_blank" rel="noreferrer noopener" className="album-art" title="Ouvrir le morceau sur Spotify">
          {albumImage && <img src={albumImage} alt={track.album?.name || track.name} />}
        </a>
        <div className="track-details">
          <a href={trackUrl} target="_blank" rel="noreferrer noopener" className="track-title" title={track.name}>{track.name}</a>
          <a href={track.artists?.[0]?.external_urls?.spotify || trackUrl} target="_blank" rel="noreferrer noopener" className="artist-name" title={artists}>{artists}</a>
        </div>
        <div className="volume-bars" aria-label={isPlaying ? 'Lecture en cours' : 'Lecture en pause'}>
          {[0, 1, 2, 3, 4].map((bar) => <span key={bar} className="bar" style={{ '--delay': `${bar * 0.12}s`, animationPlayState: isPlaying ? 'running' : 'paused' }} />)}
        </div>
      </div>

      <div className="playback-controls">
        <div className="time-info"><span>{formatMs(localProgress)}</span><span>{formatMs(duration)}</span></div>
        <input className="progress-bar" type="range" min="0" max={duration} value={Math.min(localProgress, duration)} onChange={handleSeek} aria-label="Position dans le morceau" />
      </div>

      <div className="button-row">
        <button type="button" className="control-button" onClick={handleLike} disabled={actionPending} aria-label={isLiked ? 'Retirer des favoris' : 'Ajouter aux favoris'} title={isLiked ? 'Retirer des favoris' : 'Ajouter aux favoris'}><IconHeart filled={isLiked} /></button>
        <div className="main-control-btns">
          <button type="button" className="control-button" onClick={handlePrev} disabled={actionPending} aria-label="Titre précédent" title="Titre précédent"><IconPrev /></button>
          <button type="button" className="control-button play-pause-button" onClick={handlePlayPause} disabled={actionPending} aria-label={isPlaying ? 'Pause' : 'Lecture'} title={isPlaying ? 'Pause' : 'Lecture'}>{isPlaying ? <IconPause /> : <IconPlay />}</button>
          <button type="button" className="control-button" onClick={handleNext} disabled={actionPending} aria-label="Titre suivant" title="Titre suivant"><IconNext /></button>
        </div>
        <div className="spotify-playlist-wrap">
          <button type="button" className="control-button" onClick={handleOpenPlaylistModal} disabled={actionPending} aria-label="Ajouter à une playlist" title="Ajouter à une playlist"><IconPlaylist /></button>
          {showPlaylistModal && (
            <div className="spotify-playlist-dropdown" role="dialog" aria-label="Choisir une playlist">
              <div className="spotify-playlist-header"><span>Ajouter à une playlist</span><button type="button" className="spotify-playlist-close" onClick={() => setShowPlaylistModal(false)} aria-label="Fermer">×</button></div>
              {playlistLoading ? <div className="spotify-playlist-loading">Chargement…</div> : <ul className="spotify-playlist-list">{playlists.map(pl => <li key={pl.id}><button type="button" className={`spotify-playlist-item ${playlistSuccess === pl.id ? 'added' : ''}`} onClick={() => handleAddToPlaylist(pl.id)}>{playlistSuccess === pl.id ? '✓ Ajouté !' : pl.name}</button></li>)}{playlists.length === 0 && <li className="spotify-empty-list">Aucune playlist</li>}</ul>}
            </div>
          )}
        </div>
      </div>
      <div className="spotify-player-footer"><SpotifyLogo size={13} /><a href={trackUrl} target="_blank" rel="noreferrer noopener">Spotify ↗</a><button type="button" className="spotify-link-btn" onClick={() => clearStoredAuth()}>Déconnecter</button></div>
    </div>
  );
}
