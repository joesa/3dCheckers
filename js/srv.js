import {CONFIG} from './config.js';

/* Supabase backend: accounts, ELO ladder, invite links, spectating.
   Everything degrades gracefully when offline — the game never blocks on it. */

export const SRV={ok:false,me:null,profile:null,oppUid:null,why:''};
let sb=null,meCb=null,initP=null;
const PING_MS=2500,CALL_MS=8000;
export function onMeChange(fn){meCb=fn;}
const EMAIL=h=>h.toLowerCase().replace(/[^a-z0-9._-]/g,'')+'@aether.local';

export function markOffline(why){
  if(!SRV.ok)return;
  SRV.ok=false;sb=null;
  SRV.why=why||'backend unreachable';
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
    if(!CONFIG.SRV_URL){SRV.ok=false;SRV.why='no backend configured for '+location.hostname;return false;}
    try{
      if(!(await reachable(CONFIG.SRV_URL))){SRV.ok=false;SRV.why='no reply from '+CONFIG.SRV_URL;return false;}
      const mod=await import('https://esm.sh/@supabase/supabase-js@2.45.0');
      sb=mod.createClient(CONFIG.SRV_URL,CONFIG.SRV_ANON,{auth:{persistSession:true,autoRefreshToken:true}});
      SRV.ok=true;SRV.why='';
      const {data}=await sb.auth.getSession();
      if(data&&data.session){
        SRV.me=data.session.user;
        await loadProfile();
      }
      sb.auth.onAuthStateChange(ev=>{
        if(ev==='SIGNED_OUT'){SRV.me=null;SRV.profile=null;if(meCb)meCb();}
      });
    }catch(e){SRV.ok=false;sb=null;SRV.why='client load failed: '+(e&&e.message||e);}
    return SRV.ok;
  })();
}

/* idempotent — safe to call from several boot paths */
export function srvInit(){
  if(!initP)initP=doInit().then(ok=>{if(meCb)meCb();return ok;},()=>{SRV.ok=false;if(meCb)meCb();return false;});
  return initP;
}

/* force a fresh probe after the backend went away and came back */
export function srvReconnect(){
  initP=null;
  return srvInit();
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
    const {data:taken,error:e0}=await sb.from('ad_profiles').select('uid').eq('handle',handle).maybeSingle();
    if(e0)return {ok:false,why:e0.message};
    if(taken)return {ok:false,why:'handle already taken'};
    const {data,error}=await withTimeout(sb.auth.signUp({email:EMAIL(handle),password:pw,options:{data:{handle}}}),CALL_MS);
    if(error)return {ok:false,why:error.message};
    if(!data.session)return {ok:false,why:'email confirmation required'};
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

/* ---------- per-account assets: wallet + equipped cosmetics ---------- */

const rowToWallet=r=>r?{coins:r.coins,ledger:[],purchases:r.purchases||[],premium:!!r.premium,
  passXp:r.pass_xp,passClaimed:r.pass_claimed||[],passSeason:r.pass_season,lastLogin:r.last_login||0}:null;
const rowToEquip=r=>r?{skin:r.skin,throne:r.throne,victory:r.victory,board:r.board,clock:r.clock}:null;

export async function fetchAssets(){
  if(!SRV.ok||!SRV.me)return null;
  try{
    const [{data:w,error:ew},{data:e,error:ee}]=await Promise.all([
      sb.from('ad_wallet').select('*').eq('uid',SRV.me.id).maybeSingle(),
      sb.from('ad_equip').select('*').eq('uid',SRV.me.id).maybeSingle(),
    ]);
    if(ew||ee)throw ew||ee;
    return {wallet:rowToWallet(w),equip:rowToEquip(e)};
  }catch(e){
    markOffline('asset read failed: '+e.message);
    return null;
  }
}

export async function pushWallet(w){
  if(!SRV.ok||!SRV.me)return false;
  const {error}=await sb.from('ad_wallet').upsert({uid:SRV.me.id,coins:w.coins,purchases:w.purchases||[],
    premium:!!w.premium,pass_xp:w.passXp,pass_claimed:w.passClaimed||[],pass_season:w.passSeason,
    last_login:String(w.lastLogin||''),updated_at:new Date().toISOString()});
  if(error)markOffline('wallet write failed: '+error.message);
  return !error;
}

export async function pushEquip(e){
  if(!SRV.ok||!SRV.me)return false;
  const {error}=await sb.from('ad_equip').upsert({uid:SRV.me.id,skin:e.skin,throne:e.throne,
    victory:e.victory,board:e.board,clock:e.clock,updated_at:new Date().toISOString()});
  if(error)markOffline('loadout write failed: '+error.message);
  return !error;
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

/* ---------- open rooms: public lounges, no invite needed ----------
   Rows live in ad_invites with kind='room'. Guests (anon) may create,
   claim and watch — the RLS on ad_invites is already wide open. */

export async function roomOpen(meta){
  const code='R'+newCode(4);
  const r=await createInvite('room',{...meta,code});
  return r.ok?{ok:true,code}:r;
}
export async function roomList(){
  if(!SRV.ok)return [];
  const since=new Date(Date.now()-3*60000).toISOString();
  const {data,error}=await sb.from('ad_invites')
    .select('code,status,host_name,guest_name,theme,clock,created_at')
    .eq('kind','room').in('status',['open','joined','playing'])
    .gt('updated_at',since)
    .order('created_at',{ascending:false}).limit(40);
  return error?[]:(data||[]);
}
/* atomic seat claim — succeeds only if the seat is still free */
export async function roomClaim(code,who){
  if(!SRV.ok)return null;
  const {data,error}=await sb.from('ad_invites')
    .update({status:'joined',guest_uid:(who&&who.uid)||null,guest_name:(who&&who.name)||'?'})
    .eq('code',code).eq('kind','room').eq('status','open').is('guest_uid',null)
    .select('code');
  if(error||!data||!data.length)return null;
  return {ok:true};
}
export async function roomTouch(code){
  if(!SRV.ok)return;
  await sb.from('ad_invites').update({updated_at:new Date().toISOString()}).eq('code',code);
}
export async function roomReset(code){
  return patchInvite(code,{status:'open',guest_uid:null,guest_name:null,answer:null});
}
export async function roomClose(code){
  return patchInvite(code,{status:'done'});
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

/* ---------- correspondence duels (long-form, cross-device) ---------- */

export async function findHandle(handle){
  if(!SRV.ok)return null;
  const {data}=await sb.from('ad_profiles').select('uid,handle,elo').eq('handle',handle).maybeSingle();
  return data||null;
}
export async function corrCreate(guestUid,theme){
  if(!SRV.ok||!SRV.me)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_corr_create',{p_guest:guestUid,p_theme:theme||'island'});
  if(error)return {ok:false,why:error.message};
  return {ok:true,id:data};
}
export async function corrJoin(id){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_corr_join',{p_game:id});
  return error?{ok:false,why:error.message}:{ok:true,status:data};
}
export async function corrDecline(id){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_corr_decline',{p_game:id});
  return error?{ok:false,why:error.message}:{ok:true,status:data};
}
export async function corrResign(id){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_corr_resign',{p_game:id});
  return error?{ok:false,why:error.message}:{ok:true,status:data};
}
export async function corrPost(id,move,end){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_corr_post',{p_game:id,p_move:move,p_end:end||null});
  return error?{ok:false,why:error.message}:{ok:true,status:data};
}
export async function corrList(){
  if(!SRV.ok)return {ok:false,why:'backend offline',games:[]};
  const {data,error}=await sb.rpc('ad_corr_list');
  return error?{ok:false,why:error.message,games:[]}:{ok:true,games:data||[]};
}
export async function corrGame(id){
  if(!SRV.ok)return null;
  const {data,error}=await sb.rpc('ad_corr_game',{p_game:id});
  return error?null:data;
}

/* ---------- rivals / follow graph ---------- */

export async function follow(uid){
  if(!SRV.ok||!SRV.me)return {ok:false,why:'backend offline'};
  const {error}=await sb.rpc('ad_follow',{p_uid:uid});
  return error?{ok:false,why:error.message}:{ok:true};
}
export async function unfollow(uid){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {error}=await sb.rpc('ad_unfollow',{p_uid:uid});
  return error?{ok:false,why:error.message}:{ok:true};
}
export async function isFollowing(uid){
  if(!SRV.ok)return false;
  const {data}=await sb.rpc('ad_is_following',{p_uid:uid});
  return !!data;
}
export async function rivals(){
  if(!SRV.ok)return {ok:false,why:'backend offline',rivals:[]};
  const {data,error}=await sb.rpc('ad_rivals');
  return error?{ok:false,why:error.message,rivals:[]}:{ok:true,rivals:data||[]};
}

/* ---------- niche leaderboards ---------- */

export async function corrStandings(){
  if(!SRV.ok)return [];
  const {data,error}=await sb.rpc('ad_corr_standings',{p_limit:50});
  return error?[]:(data||[]);
}
export async function corrQuickest(){
  if(!SRV.ok)return [];
  const {data,error}=await sb.rpc('ad_corr_quickest',{p_limit:25});
  return error?[]:(data||[]);
}
export async function corrLongest(){
  if(!SRV.ok)return [];
  const {data,error}=await sb.rpc('ad_corr_longest',{p_limit:25});
  return error?[]:(data||[]);
}
export async function ladderWinrate(){
  if(!SRV.ok)return [];
  const {data,error}=await sb.rpc('ad_ladder_winrate',{p_min:3,p_limit:50});
  return error?[]:(data||[]);
}

/* ---------- web push subscriptions ---------- */

export async function pushRegister(sub){
  if(!SRV.ok||!SRV.me)return {ok:false,why:'backend offline'};
  const keys=(sub&&sub.keys)||{};
  const {error}=await sb.rpc('ad_push_register',{
    p_endpoint:sub.endpoint,p_p256dh:keys.p256dh,p_auth:keys.auth,
    p_user_agent:(typeof navigator!=='undefined'?navigator.userAgent:null)});
  return error?{ok:false,why:error.message}:{ok:true};
}
export async function pushUnregister(endpoint){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {error}=await sb.rpc('ad_push_unregister',{p_endpoint:endpoint});
  return error?{ok:false,why:error.message}:{ok:true};
}

/* ---------- server-authoritative staking + two-party-verified duel escrow ---------- */

export async function stakeBalance(){
  if(!SRV.ok||!SRV.me)return null;
  const {data,error}=await sb.rpc('ad_stake_balance');
  return error?null:data;
}
export async function stakeClaimDaily(){
  if(!SRV.ok||!SRV.me)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_stake_claim_daily');
  return error?{ok:false,why:error.message}:{ok:true,balance:data};
}
export async function duelOpen(opponentUid,seed,stake){
  if(!SRV.ok||!SRV.me)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_duel_open',{p_opponent:opponentUid,p_seed:seed,p_stake:stake});
  return error?{ok:false,why:error.message}:{ok:true,id:data};
}
export async function duelAccept(id){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_duel_accept',{p_duel:id});
  return error?{ok:false,why:error.message}:{ok:true,status:data};
}
export async function duelDecline(id){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_duel_decline',{p_duel:id});
  return error?{ok:false,why:error.message}:{ok:true,status:data};
}
export async function duelAttest(id,outcome){
  if(!SRV.ok)return {ok:false,why:'backend offline'};
  const {data,error}=await sb.rpc('ad_duel_attest',{p_duel:id,p_outcome:outcome});
  return error?{ok:false,why:error.message}:{ok:true,status:data};
}

/* ---------- spectator betting on ranked duels (pari-mutuel) ---------- */

export async function duelsOpen(){
  if(!SRV.ok)return [];
  const {data,error}=await sb.rpc('ad_duels_open',{p_limit:50});
  return error?[]:(data||[]);
}
export async function betPools(id){
  if(!SRV.ok||!SRV.me)return null;
  const {data,error}=await sb.rpc('ad_bet_pools',{p_duel:id});
  return error?null:(data&&data[0])||null;
}
export async function betMine(){
  if(!SRV.ok||!SRV.me)return [];
  const {data,error}=await sb.rpc('ad_bet_mine');
  return error?[]:(data||[]);
}
export async function betPlace(id,pick,stake){
  if(!SRV.ok||!SRV.me)return {ok:false,why:'backend offline'};
  const {error}=await sb.rpc('ad_bet_place',{p_duel:id,p_pick:pick,p_stake:stake});
  return error?{ok:false,why:error.message}:{ok:true};
}

/* ---------- live spectator presence ---------- */

export async function watchHeartbeat(code,sid,name,look){
  if(!SRV.ok)return {ok:false};
  const {error}=await sb.rpc('ad_watch_heartbeat',{p_code:code,p_sid:sid,p_name:name,p_look:look||{}});
  return error?{ok:false,why:error.message}:{ok:true};
}
export async function watchRoster(code,sid){
  if(!SRV.ok)return [];
  const {data,error}=await sb.rpc('ad_watch_roster',{p_code:code,p_sid:sid||null});
  return error?[]:(data||[]);
}
export async function watchLeave(code,sid){
  if(!SRV.ok)return {ok:false};
  const {error}=await sb.rpc('ad_watch_leave',{p_code:code,p_sid:sid});
  return error?{ok:false}:{ok:true};
}
