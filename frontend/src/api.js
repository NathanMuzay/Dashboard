import { legacyToken, accountId } from './session';

export default async function api(path, { body, timeoutMs = 10000, ...options } = {}) {
  const token = legacyToken();
  const account = accountId();
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        'X-Lumi-Client': 'web',
        ...(account && !path.startsWith('/auth/') ? { 'X-Lumi-Account': account } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error(
      'Connexion au serveur impossible. Réessayez dans un instant.',
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.message || 'Le serveur ne peut pas traiter cette demande.',
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
