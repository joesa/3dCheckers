/* Supabase backend: accounts, ELO ladder, invite links, spectating.
   Everything degrades gracefully when offline — the game never blocks on it. */

export const SRV_URL=(location.hostname==='127.0.0.1'||location.hostname==='localhost')
  ?'http://127.0.0.1:54321'
  :'http://'+location.hostname+':54321';
const SRV_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const SRV={ok:false,me:null,profile:null,oppUid:null};
let sb=null,meCb=null;
export function onMeChange(fn){meCb=fn;}
const EMAIL=h=>h.toLowerCase().replace(/[^a-z0-9._-]/g,'')+'@aether.local';

export async function srvInit(){
  try{
    const mod=await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    sb=mod.createClient(SRV_URL,SRV_ANON,{auth:{persistSession:true,autoRefreshToken:true}});
    SRV.ok=true;
    const {data}=await sb.auth.getSession();
    if(data&&data.session){
      SRV.me=data.session.user;
      await loadProfile();
    }
    sb.auth.onAuthStateChange(ev=>{
      if(ev==='SIGNED_OUT'){SRV.me=null;SRV.profile=null;if(meCb)meCb();}
    });
  }catch(e){SRV.ok=false;}
  if(meCb)meCb();
  return SRV.ok;
}

async function loadProfile(){
  if(!SRV.me||!sb)return;
  const {data}=await sb.from('ad_profiles').select('*').eq('uid',SRV.me.id).maybeSingle();
  SRV.profile=data||{handle:'?',elo:1200,wins:0,losses:0};
}

export async function signUp(handle,pw){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  if(!/^[a-zA-Z0-9._-]{3,18}$/.test(handle))return {ok:false,why:'handle: 3–18 letters/digits/._-'};
  if((pw||'').length<8)return {ok:false,why:'password needs 8+ chars'};
  const {data,error}=await sb.auth.signUp({email:EMAIL(handle),password:pw});
  if(error)return {ok:false,why:error.message};
  if(!data.session)return {ok:false,why:'email confirmation required'};
  const {error:e2}=await sb.from('ad_profiles').insert({uid:data.user.id,handle});
  if(e2){await sb.auth.signOut();return {ok:false,why:/duplicate/i.test(e2.message)?'handle already taken':e2.message};}
  SRV.me=data.user;
  await loadProfile();
  if(meCb)meCb();
  return {ok:true};
}

export async function signIn(handle,pw){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.auth.signInWithPassword({email:EMAIL(handle),password:pw});
  if(error)return {ok:false,why:error.message};
  SRV.me=data.user;
  await loadProfile();
  if(meCb)meCb();
  return {ok:true};
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
