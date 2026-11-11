import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

export const widgetService = type => ({
  agenda: 'google_calendar', calendar_week: 'google_calendar',
  gmail_unread: 'gmail', gmail_compose: 'gmail',
  spotify_player: 'spotify', spotify_top: 'spotify',
  github_pushes: 'github', github_graph: 'github', openai_chat: 'openai',
}[type]);
const Context = createContext({ active: null, error: '', reload: () => {} });
export const useSubscriptions = () => useContext(Context);

export default function Subscriptions({ children }) {
  const [state, setState] = useState({ active: null, error: '' });
  const [generation, setGeneration] = useState(0);
  const reload = () => setGeneration(value => value + 1);
  useEffect(() => {
    let alive = true;
    setState({ active: null, error: '' });
    api('/services').then(active => {
      if (alive) setState({ active, error: '' });
    }).catch(error => {
      if (alive) setState({ active: null, error: error.message });
    });
    return () => { alive = false; };
  }, [generation]);
  useEffect(() => {
    window.addEventListener('lumi:subscriptions-changed', reload);
    return () => window.removeEventListener('lumi:subscriptions-changed', reload);
  }, []);
  return <Context.Provider value={{ ...state, reload }}>{children}</Context.Provider>;
}
