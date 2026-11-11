import { useEffect, useState } from 'react';
export function refreshSeconds(value, fallback = 60, min = 30, max = 3600) {
  const seconds = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : fallback));
}
export default function useRefresh(value, enabled = true, fallback = 60, min = 30) {
  const [revision, setRevision] = useState(0);
  const seconds = refreshSeconds(value, fallback, min);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { if (document.visibilityState !== 'hidden') setRevision(v => v + 1); };
    const timer = setInterval(refresh, seconds * 1000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [seconds, enabled]);
  return revision;
}
