// Apply the saved preference before the first paint, including native form controls.
(() => {
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  function applyPreference() {
    let saved;
    try {
      saved = localStorage.getItem('lumi_theme');
    } catch {
      /* Storage can be disabled. */
    }
    const theme =
      saved === 'light' || saved === 'dark'
        ? saved
        : system.matches
          ? 'dark'
          : 'light';
    document.documentElement.dataset.theme = theme;
  }
  for (const key of ['largeText', 'highContrast']) {
    try { document.documentElement.dataset[key] = String(localStorage.getItem(`lumi_${key}`) === 'true'); } catch { /* Optional preference. */ }
  }
  applyPreference();
  system.addEventListener('change', applyPreference);
  window.addEventListener('storage', (event) => {
    if (event.key === 'lumi_theme' || event.key === null) applyPreference();
  });
})();
