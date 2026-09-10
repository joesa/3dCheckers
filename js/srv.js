import {CONFIG} from './config.js';

/* Supabase backend: accounts, ELO ladder, invite links, spectating.
   Everything degrades gracefully when offline — the game never blocks on it. */

export const SRV={ok:false,me:null,profile:null,oppUid:null};
let sb=null,meCb=null,initP=null;
const PING_MS=2500,CALL_MS=8000;
export function onMeChange(fn){meCb=fn;}
const EMAIL=h=>h.toLowerCase().replace(/[^a-z0-9._-]/g,'')+'@aether.local';

export function markOffline(){
  if(!SRV.ok)return;
  SRV.ok=false;sb=null;
}

const offline=why=>({ok:false,why:why||'backend unreachable',offline:true});

function withTimeout(p,ms){
  return Promise.race([
    p,
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms)),
  ]);
}

async function reachable(url){
  const ctl=new AbortController();
  const t=setTimeout(()=>ctl.abort(),PING_MS);
  try{
    await fetch(url+'/auth/v1/health',{signal:ctl.signal,cache:'no-store',mode:'cors'});
    return true; // any HTTP reply means the API is listening
  }catch(e){
    return false;
  }finally{
    clearTimeout(t);
  }
}

function doInit(){
  return (async()=>{
    if(!CONFIG.SRV_URL){SRV.ok=false;return false;}
    try{
      if(!(await reachable(CONFIG.SRV_URL))){SRV.ok=false;return false;}
      const mod=await import('https://esm.sh/@supabase/supabase-js@2.45.0');
      sb=mod.createClient(CONFIG.SRV_URL,CONFIG.SRV_ANON,{auth:{persistSession:true,autoRefreshToken:true}});
      SRV.ok=true;
      const {data}=await sb.auth.getSession();
      if(data&&data.session){
        SRV.me=data.session.user;
        await loadProfile();
      }
      sb.auth.onAuthStateChange(ev=>{
        if(ev==='SIGNED_OUT'){SRV.me=null;SRV.profile=null;if(meCb)meCb();}
      });
    }catch(e){SRV.ok=false;sb=null;}
    return SRV.ok;
  })();
}

/* idempotent — safe to call from several boot paths */
export function srvInit(){
  if(!initP)initP=doInit().then(ok=>{if(meCb)meCb();return ok;},()=>{SRV.ok=false;if(meCb)meCb();return false;});
  return initP;
}

async function loadProfile(){
  if(!SRV.me||!sb)return;
  try{
    const {data}=await sb.from('ad_profiles').select('*').eq('uid',SRV.me.id).maybeSingle();
    SRV.profile=data||{handle:'?',elo:1200,wins:0,losses:0};
  }catch(e){markOffline();}
}

export async function signUp(handle,pw){
  if(!SRV.ok)return offline('backend offline');
  if(!/^[a-zA-Z0-9._-]{3,18}$/.test(handle))return {ok:false,why:'handle: 3–18 letters/digits/._-'};
  if((pw||'').length<8)return {ok:false,why:'password needs 8+ chars'};
  try{
    const {data,error}=await withTimeout(sb.auth.signUp({email:EMAIL(handle),password:pw}),CALL_MS);
    if(error)return {ok:false,why:error.message};
    if(!data.session)return {ok:false,why:'email confirmation required'};
    const {error:e2}=await sb.from('ad_profiles').insert({uid:data.user.id,handle});
    if(e2){await sb.auth.signOut();return {ok:false,why:/duplicate/i.test(e2.message)?'handle already taken':e2.message};}
    SRV.me=data.user;
    await loadProfile();
    if(meCb)meCb();
    return {ok:true};
  }catch(e){
    markOffline();
    return offline();
  }
}

export async function signIn(handle,pw){
  if(!SRV.ok)return offline('backend offline');
  try{
    const {data,error}=await withTimeout(sb.auth.signInWithPassword({email:EMAIL(handle),password:pw}),CALL_MS);
    if(error)return {ok:false,why:error.message};
    SRV.me=data.user;
    await loadProfile();
    if(meCb)meCb();
    return {ok:true};
  }catch(e){
    markOffline();
    return offline();
  }
}

export async function signOut(){
  if(!SRV.ok)return;
  await sb.auth.signOut();
  SRV.me=null;SRV.profile=null;SRV.oppUid=null;
  if(meCb)meCb();
}

export async function reportMatch(opponentUid,result,nonce){
  if(!SRV.ok||!SRV.me||!opponentUid)return null;
  const {data,error}=await sb.rpc('ad_report_match',{p_opponent:opponentUid,p_result:result,p_nonce:nonce});
  if(error)return null;
  const before=SRV.profile?SRV.profile.elo:null;
  await loadProfile();
  if(meCb)meCb();
  return {elo:before,data};
}

export async function ladder(limit=50){
  if(!SRV.ok)return [];
  const {data}=await sb.from('ad_profiles').select('handle,elo,wins,losses').order('elo',{ascending:false}).limit(limit);
  return data||[];
}

/* ---------- invites (link duels + spectate rooms) ---------- */

const CODE_A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newCode(n=8){
  return Array.from({length:n},()=>CODE_A[Math.random()*CODE_A.length|0]).join('');
}
export async function createInvite(kind,meta){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const code=meta.code||newCode();
  const row={code,kind,status:'open',host_uid:SRV.me?SRV.me.id:null,
    host_name:meta.name||'?',theme:meta.theme||null,clock:meta.clock||'none',offer:meta.offer||null};
  const {error}=await sb.from('ad_invites').insert(row);
  if(error)return {ok:false,why:error.message};
  return {ok:true,code};
}
export async function getInvite(code){
  if(!SRV.ok)return null;
  const {data}=await sb.from('ad_invites').select('*').eq('code',code).maybeSingle();
  return data;
}
export async function patchInvite(code,patch){
  if(!SRV.ok)return {ok:false};
  const {error}=await sb.from('ad_invites').update(patch).eq('code',code);
  return error?{ok:false,why:error.message}:{ok:true};
}

/* ---------- spectate streams ---------- */

export async function pushMove(code,seq,mover,move){
  if(!SRV.ok)return;
  await sb.from('ad_moves').insert({code,seq,mover,move});
}
export async function getMoves(code,afterSeq){
  if(!SRV.ok)return [];
  const {data}=await sb.from('ad_moves').select('seq,move,mover').eq('code',code).gt('seq',afterSeq).order('seq');
  return data||[];
}
export async function react(code,emoji){
  if(!SRV.ok)return;
  await sb.from('ad_reactions').insert({code,emoji});
}
export async function getReactions(code,afterId){
  if(!SRV.ok)return [];
  const {data}=await sb.from('ad_reactions').select('id,emoji').eq('code',code).gt('id',afterId).order('id');
  return data||[];
}
