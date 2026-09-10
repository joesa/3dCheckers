// Unified auth module - tries Supabase first, falls back to local auth
// Also owns which localStorage asset bucket is live, and mirrors it to the backend.
import {SRV,srvInit,markOffline,onMeChange,fetchAssets,pushWallet,pushEquip,
  signUp as srvSignUp,signIn as srvSignIn,signOut as srvSignOut,
  reportMatch as srvReportMatch,ladder as srvLadder} from './srv.js';
import {signUp as localSignUp,signIn as localSignIn,signOut as localSignOut,
  reportMatch as localReportMatch,ladder as localLadder,getLocalUser} from './localauth.js';
import {bind,reset,currentScope,GUEST} from './scope.js';
import {hydrateWallet,readGuestWallet,forgetGuestWallet} from './economy.js';
import {hydrateEquip} from './cosmetics.js';

export const Auth={ok:false,me:null,profile:null,init};

let meCb=null,assetsCb=null,wSink=null,eSink=null;
const DEBOUNCE=1200;

function sink(push){
  let t=null,pending=null,last=Promise.resolve();
  const go=()=>{
    t=null;
    const p=pending;pending=null;
    if(!p)return last;
    last=Promise.resolve(push(p)).catch(()=>false);
    return last;
  };
  return {
    send(p){pending=p;if(t)clearTimeout(t);t=setTimeout(go,DEBOUNCE);},
    flush(){if(t){clearTimeout(t);return go();}return last;},
  };
}

/* Push any queued wallet/loadout changes before the tab goes away. */
export function flushAssets(){
  const a=wSink?wSink.flush():Promise.resolve();
  const b=eSink?eSink.flush():Promise.resolve();
  return Promise.all([a,b]);
}

export function onAuthChange(fn){meCb=fn;}
export function onAssetsChange(fn){assetsCb=fn;}

/* Point the asset cache at an account. `server` mirrors to Postgres;
   offline/local accounts keep a private per-handle bucket instead. */
async function applyScope(uid,server){
  if(!uid){
    wSink=eSink=null;
    reset();
    if(assetsCb)assetsCb();
    return;
  }
  wSink=server?sink(pushWallet):null;
  eSink=server?sink(pushEquip):null;
  bind(uid,{wallet:p=>{if(wSink)wSink.send(p);},equip:p=>{if(eSink)eSink.send(p);}});
  if(server){
    const a=await fetchAssets();
    if(a){
      if(a.wallet)hydrateWallet(a.wallet);
      if(a.equip)hydrateEquip(a.equip);
    }
  }
  if(assetsCb)assetsCb();
}

/* Adopt this browser's unscoped progress when an account is first created,
   then burn the guest bucket so it can't be claimed a second time. */
async function adoptGuest(seed){
  if(!seed||!SRV.ok||!SRV.me)return;
  const worth=seed.coins!==300||seed.purchases.length>0||seed.passXp>0;
  if(!worth)return;
  hydrateWallet(seed);
  await pushWallet(seed);
  forgetGuestWallet();
}

/* serialized so overlapping auth events can't interleave scope switches */
let syncP=Promise.resolve();
function sync(){
  syncP=syncP.then(()=>syncFromState().catch(()=>false),()=>syncFromState().catch(()=>false));
  return syncP;
}

// spontaneous changes (token expiry, another tab signing out)
onMeChange(()=>{sync().then(()=>{if(meCb)meCb();});});

// supabase says it is unreachable -> drop to the local account store for this session
async function viaSrv(srvCall,localCall){
  if(!SRV.ok)return localCall();
  let r;
  try{
    r=await srvCall();
  }catch(e){
    markOffline();
    return localCall();
  }
  if(r&&r.offline){
    markOffline();
    return localCall();
  }
  return r;
}

/* Single source of truth for who is signed in — never clears a live Supabase session. */
async function syncFromState(){
  if(SRV.ok&&SRV.me){
    Auth.ok=true;
    Auth.me=SRV.me;
    Auth.profile=SRV.profile;
    await applyScope(SRV.me.id,true);
    return true;
  }
  const local=getLocalUser();
  if(local){
    Auth.ok=true;
    Auth.me={id:'local:'+local.handle,provider:'local'};
    Auth.profile=local.profile;
    await applyScope('local:'+local.handle,false);
    return true;
  }
  Auth.ok=SRV.ok;
  Auth.me=null;
  Auth.profile=null;
  await applyScope(null,false);
  return false;
}

async function init(){
  await srvInit();
  await sync();
  return Auth.me!==null;
}

export async function signUp(handle,pw){
  const seed=currentScope()===GUEST?readGuestWallet():null;
  const r=await viaSrv(()=>srvSignUp(handle,pw),()=>localSignUp(handle,pw));
  if(r&&r.ok){
    await sync();
    await adoptGuest(seed);
  }
  if(meCb)meCb();
  return r;
}

export async function signIn(handle,pw){
  const r=await viaSrv(()=>srvSignIn(handle,pw),()=>localSignIn(handle,pw));
  if(r&&r.ok)await sync();
  if(meCb)meCb();
  return r;
}

export async function signOut(){
  await flushAssets();
  if(SRV.ok&&SRV.me){
    await srvSignOut();
  }else if(Auth.me&&Auth.me.provider==='local'){
    localSignOut();
  }
  Auth.ok=SRV.ok;
  Auth.me=null;
  Auth.profile=null;
  await applyScope(null,false);
  if(meCb)meCb();
}

export async function reportMatch(opponentUid,result,nonce){
  if(SRV.ok){
    return srvReportMatch(opponentUid,result,nonce);
  }
  return localReportMatch(null,result,nonce);
}

export async function ladder(limit=50){
  if(SRV.ok){
    return srvLadder(limit);
  }
  return localLadder(limit);
}
