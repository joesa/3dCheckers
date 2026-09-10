// Unified auth module - tries Supabase first, falls back to local auth
import {SRV,srvInit,markOffline,signUp as srvSignUp,signIn as srvSignIn,signOut as srvSignOut,reportMatch as srvReportMatch,ladder as srvLadder} from './srv.js';
import {signUp as localSignUp,signIn as localSignIn,signOut as localSignOut,reportMatch as localReportMatch,ladder as localLadder,getLocalUser} from './localauth.js';

export const Auth={ok:false,me:null,profile:null,init};

function syncLocal(){
  const local=getLocalUser();
  if(!local){Auth.me=null;Auth.profile=null;return false;}
  Auth.ok=true;
  Auth.me={id:'local:'+local.handle,provider:'local'};
  Auth.profile=local.profile;
  return true;
}

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

async function init(){
  // Try Supabase first
  const srvOk=await srvInit();
  if(srvOk){
    Auth.ok=true;
    Auth.me=SRV.me;
    Auth.profile=SRV.profile;
    if(SRV.me)return true;
    // reachable backend but nobody signed in yet — still allow a local session
    return syncLocal();
  }

  // Fallback to local auth
  return syncLocal();
}

export async function signUp(handle,pw){
  const r=await viaSrv(()=>srvSignUp(handle,pw),()=>localSignUp(handle,pw));
  if(r&&r.ok)syncLocal();
  return r;
}

export async function signIn(handle,pw){
  const r=await viaSrv(()=>srvSignIn(handle,pw),()=>localSignIn(handle,pw));
  if(r&&r.ok){
    if(SRV.ok){Auth.me=SRV.me;Auth.profile=SRV.profile;}
    else syncLocal();
  }
  return r;
}

export async function signOut(){
  if(SRV.ok){
    await srvSignOut();
  }else{
    localSignOut();
  }
  Auth.me=null;
  Auth.profile=null;
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

