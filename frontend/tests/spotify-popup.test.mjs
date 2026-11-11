import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForSpotifyPopup, spotifyPopupChannel } from '../src/widgets/spotify/spotifyPopup.js';

test('popup exchanges the code once despite duplicate callbacks', async () => {
  const state=crypto.randomUUID();
  const callback=new BroadcastChannel(spotifyPopupChannel(state));
  let exchanges=0, closed=false;
  const result=waitForSpotifyPopup({state,owner:'alice',currentOwner:()=> 'alice',popup:{close(){closed=true;}},exchange:async code=>{exchanges++;assert.equal(code,'code');return {accessToken:'token'};},timeoutMs:2000});
  callback.postMessage({state:'wrong',code:'ignored'});
  callback.postMessage({state,code:'code'});
  callback.postMessage({state,code:'code'});
  assert.deepEqual(await result,{accessToken:'token'});
  assert.equal(exchanges,1);assert.equal(closed,true);
  callback.close();
});
test('popup rejects a callback from an old Lumi session without exchanging the code',async()=>{
  const state=crypto.randomUUID();const callback=new BroadcastChannel(spotifyPopupChannel(state));
  const result=waitForSpotifyPopup({state,owner:'alice',currentOwner:()=> 'bob',popup:{close(){}},exchange:()=>assert.fail('Must not exchange'),timeoutMs:2000});
  const rejection=assert.rejects(result,/Session Lumi modifiée/);
  callback.postMessage({state,code:'code'});await rejection;callback.close();
});
test('refusal and timeout do not clear existing service connections',async()=>{
  const state=crypto.randomUUID();const callback=new BroadcastChannel(spotifyPopupChannel(state));
  const result=waitForSpotifyPopup({state,owner:'alice',currentOwner:()=> 'alice',popup:{close(){}},exchange:()=>assert.fail('Must not exchange'),timeoutMs:2000});
  const rejection=assert.rejects(result,/annulée ou refusée/);
  callback.postMessage({state,error:'access_denied'});await rejection;callback.close();
  await assert.rejects(waitForSpotifyPopup({state:'timeout',owner:'alice',currentOwner:()=> 'alice',popup:{close(){}},exchange:()=>assert.fail('Must not exchange'),timeoutMs:10}),/non terminée/);
});
