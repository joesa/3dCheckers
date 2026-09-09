// Unified auth module - tries Supabase first, falls back to local auth
import {SRV,srvInit,onMeChange,signUp as srvSignUp,signIn as srvSignIn,signOut as srvSignOut,reportMatch as srvReportMatch,ladder as srvLadder} from './srv.js';
import {signUp as localSignUp,signIn as localSignIn,signOut as localSignOut,reportMatch as localReportMatch,ladder as localLadder,getLocalUser} from './localauth.js';

export const Auth={ok:false,me:null,profile:null,init};

async function init(){
  // Try Supabase first
  const srvOk=await srvInit();
  if(srvOk){
    Auth.ok=true;
    Auth.me=SRV.me;
    Auth.profile=SRV.profile;
    return true;
  }
  
  // Fallback to local auth
  const local=getLocalUser();
  if(local){
    Auth.ok=true;
    Auth.me={id:'local:'+local.handle,provider:'local'};
    Auth.profile=local.profile;
    return true;
  }
  
  return false;
}

export async function signUp(handle,pw){
  if(SRV.ok){
    return srvSignUp(handle,pw);
  }
  return localSignUp(handle,pw);
}

export async function signIn(handle,pw){
  if(SRV.ok){
    return srvSignIn(handle,pw);
  }
  return localSignIn(handle,pw);
}

export async function signOut(){
  if(SRV.ok){
    await srvSignOut();
  }else{
    localSignOut();
  }
  Auth.me=null;
  Auth.profile=null;
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

export {srvInit as srvInit, onMeChange};
