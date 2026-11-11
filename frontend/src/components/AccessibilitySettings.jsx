import React, { useState } from 'react';
import Dialog from './Dialog';

export default function AccessibilitySettings() {
  const [open, setOpen] = useState(false);
  const [large, setLarge] = useState(document.documentElement.dataset.largeText === 'true');
  const [contrast, setContrast] = useState(document.documentElement.dataset.highContrast === 'true');
  function update(key, value, setter) {
    document.documentElement.dataset[key] = String(value);
    setter(value);
    try { localStorage.setItem(`lumi_${key}`, String(value)); } catch { /* Preference remains active. */ }
  }
  return <>
    <button type="button" className="accessibility-toggle" onClick={() => setOpen(true)} aria-haspopup="dialog">Accessibilité</button>
    {open && <Dialog titleId="accessibility-title" onClose={() => setOpen(false)}>
      <h2 id="accessibility-title">Confort de lecture</h2>
      <p>Ces réglages sont conservés sur cet appareil.</p>
      <label className="accessibility-option"><input type="checkbox" checked={large} onChange={e => update('largeText', e.target.checked, setLarge)} /> Texte agrandi</label>
      <label className="accessibility-option"><input type="checkbox" checked={contrast} onChange={e => update('highContrast', e.target.checked, setContrast)} /> Contraste renforcé</label>
      <p className="field-hint">Utilisez Tab pour naviguer et Échap pour fermer une fenêtre. Le zoom du navigateur reste disponible. Les animations suivent votre préférence système de mouvement réduit.</p>
    </Dialog>}
  </>;
}
