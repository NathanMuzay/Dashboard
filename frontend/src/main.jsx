import { handleSpotifyPopupReturn } from './widgets/spotify/spotifyPopup';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

if (!handleSpotifyPopupReturn()) {
  createRoot(document.getElementById('root')).render(<App />);
}
