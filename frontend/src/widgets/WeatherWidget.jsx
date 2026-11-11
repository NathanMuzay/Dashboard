import React, { useEffect, useState } from 'react';
import useRefresh from '../hooks/useRefresh';
import { loadWeather } from './weather/weatherClient';

export default function WeatherWidget({ widget }) {
  const [state, setState] = useState({ loading: true });
  const [retry, setRetry] = useState(0);
  const revision = useRefresh(widget.refreshInterval, true, 900, 300);
  const city = widget.city || 'Paris';
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setState({ loading: true });
    loadWeather(city, { signal: controller.signal }).then(data => {
      if (active) setState({ data });
    }).catch(error => {
      if (active) setState({ error: error.name === 'AbortError' ? 'Le service météo ne répond pas. Réessayez.' : error.message });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [city, revision, retry]);
  if (state.loading) return <p role="status">Chargement météo pour {city}…</p>;
  if (state.error) return <div><p role="alert">{state.error}</p><button type="button" onClick={() => setRetry(v => v + 1)}>Réessayer la météo</button></div>;
  return (
    <div className="weather-content">
      <strong>{Math.round(state.data.temperature)} °C</strong>
      <span>{state.data.condition}</span>
      <small>{state.data.location}<br />
        <time dateTime={state.data.time}>{state.data.time.replace('T', ' ')}</time> · {state.data.timezone}<br />
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Données Open-Meteo</a> · Modèle météo
      </small>
    </div>
  );
}
