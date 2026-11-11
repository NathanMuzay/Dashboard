export function weatherLabel(code) {
  if (code === 0) return 'Ciel dégagé';
  if ([1, 2].includes(code)) return 'Éclaircies';
  if (code === 3) return 'Couvert';
  if ([45, 48].includes(code)) return 'Brouillard';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Bruine';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Pluie';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Neige';
  if ([95, 96, 99].includes(code)) return 'Orage';
  return 'Conditions non renseignées';
}

export async function loadWeather(city, { signal, fetchImpl = fetch } = {}) {
  const name = (city || 'Paris').trim();
  if (name.length < 2 || name.length > 80) throw new Error('Indiquez une ville de 2 à 80 caractères.');
  async function read(url) {
    const response = await fetchImpl(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(response.status === 429 ? 'Quota météo atteint. Réessayez plus tard.' : 'Service météo indisponible.');
    return response.json();
  }
  const search = new URL('https://geocoding-api.open-meteo.com/v1/search');
  search.search = new URLSearchParams({ name, count: '1', language: 'fr', format: 'json' });
  const locations = await read(search);
  const location = locations.results?.[0];
  if (!location) throw new Error('Ville introuvable. Précisez le pays, par exemple Paris, France.');
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) throw new Error('Localisation météo invalide.');
  const forecast = new URL('https://api.open-meteo.com/v1/forecast');
  forecast.search = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude,
    current: 'temperature_2m,weather_code', timezone: 'auto', forecast_days: '1' });
  const data = await read(forecast);
  if (!Number.isFinite(data.current?.temperature_2m) || !Number.isInteger(data.current?.weather_code)
    || typeof data.current?.time !== 'string') throw new Error('Données météo incomplètes.');
  return { temperature: data.current.temperature_2m, condition: weatherLabel(data.current.weather_code),
    location: [location.name, location.admin1, location.country].filter(Boolean).join(', '),
    time: data.current.time, timezone: data.timezone || 'Heure locale' };
}
