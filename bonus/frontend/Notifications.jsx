import React, { useEffect, useState } from 'react';
export function notify(message) { window.dispatchEvent(new CustomEvent('lumi:notification', { detail: { id: crypto.randomUUID(), message, time: Date.now() } })); }
export default function Notifications() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { const receive = event => setItems(values => [event.detail, ...values].slice(0,20)); window.addEventListener('lumi:notification',receive); return () => window.removeEventListener('lumi:notification',receive); },[]);
  return <div className="notification-center"><button className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>Notifications ({items.length})</button><span className="sr-only" role="status">{items[0]?.message}</span>{open && <div className="notification-panel"><h2>Notifications de cette session</h2>{!items.length && <p>Aucune notification.</p>}<ul>{items.map(item => <li key={item.id}><time>{new Date(item.time).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</time> {item.message}</li>)}</ul><button onClick={() => setItems([])}>Tout effacer</button></div>}</div>;
}
