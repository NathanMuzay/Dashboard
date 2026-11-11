import React, { useEffect, useRef, useState } from 'react';
import api from '../api';
import { rememberUser } from '../session';
import { loadGoogleIdentity } from '../widgets/calendar/calendarClient';
export default function GoogleSignIn({ onLogin, link = false }) {
  const target=useRef(null);
  const [error,setError]=useState('');
  const [started,setStarted]=useState(false);
  const [success,setSuccess]=useState(false);
  const live=useRef(true);
  useEffect(() => {live.current=true;return () => {live.current=false;};},[]);
  async function start() {
    setError('');setStarted(true);
    try {
      const {clientId,nonce}=await api('/auth/google/challenge',{method:'POST'});
      await loadGoogleIdentity();
      if (!live.current) return;
      window.google.accounts.id.initialize({ client_id:clientId, nonce, auto_select:false, callback:async response => {
        if (!live.current) return;
        try {
          const data=await api(`/auth/google/${link?'link':'login'}`,{method:'POST',body:{credential:response.credential}});
          if (!live.current) return;
          if (link) setSuccess(true);
          else {rememberUser(data.user);onLogin(data.user);}
        } catch (err) {if(live.current){setError(err.message);setStarted(false);}}
      }});
      window.google.accounts.id.renderButton(target.current,{type:'standard',theme:'outline',size:'large',text:link?'continue_with':'signin_with'});
    } catch(err) {if(live.current){setError(err.message);setStarted(false);}}
  }
  return <div className="google-signin">{success?<p role="status">Compte Google associé. Vous pouvez désormais vous connecter à Lumi avec Google.</p>:<><button type="button" className="button button-secondary" onClick={start} disabled={started}>{link?'Associer mon compte Google':'Connexion avec Google'}</button><div ref={target} />{error&&<p role="alert">{error}</p>}</>}</div>;
}
