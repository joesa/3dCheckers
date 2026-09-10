// Local account system for when Supabase is unavailable
// Stores user data obfuscated in localStorage (multi-user, survives sign-out)
const KEY='ad-local-auth-v2';
const CUR='ad-local-auth-current';
const OLD='ad-local-auth';

function encrypt(data,secret){
  try{
    const str=JSON.stringify(data);
    const enc=new TextEncoder();
    const encoded=enc.encode(str);
    // Simple XOR obfuscation (not crypto-grade, but hides plain text)
    const xored=new Uint8Array(encoded.length);
    for(let i=0;i<encoded.length;i++){
      xored[i]=encoded[i]^secret.charCodeAt(i%secret.length);
    }
    return btoa(String.fromCharCode(...xored));
  }catch(e){return null;}
}

function decrypt(token,secret){
  try{
    const decoded=atob(token);
    const bytes=new Uint8Array(decoded.length);
    for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
    const xored=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++){
      xored[i]=bytes[i]^secret.charCodeAt(i%secret.length);
    }
    const dec=new TextDecoder();
    return JSON.parse(dec.decode(xored));
  }catch(e){return null;}
}

function getSecret(){
  // Use a fixed secret per browser for obfuscation
  return 'aether-local-auth-secret-v1';
}

const slot=h=>String(h||'').toLowerCase();

function readStore(){
  try{
    const token=localStorage.getItem(KEY);
    if(token){
      const s=decrypt(token,getSecret());
      if(s&&s.users)return s;
    }
    // migrate the old single-slot record
    const legacy=localStorage.getItem(OLD);
    if(legacy){
      const u=decrypt(legacy,getSecret());
      if(u&&u.handle){
        const s={users:{[slot(u.handle)]:u}};
        writeStore(s);
        localStorage.setItem(CUR,slot(u.handle));
        localStorage.removeItem(OLD);
        return s;
      }
    }
  }catch(e){}
  return {users:{}};
}

function writeStore(store){
  try{
    const token=encrypt(store,getSecret());
    if(!token)return false;
    localStorage.setItem(KEY,token);
    return true;
  }catch(e){return false;}
}

export function getLocalUser(handle){
  const store=readStore();
  const who=handle?slot(handle):localStorage.getItem(CUR);
  return (who&&store.users[slot(who)])||null;
}

export function setLocalUser(handle,pw,profile){
  const store=readStore();
  const k=slot(handle);
  if(!k)return false;
  store.users[k]={handle,pw,profile};
  if(!writeStore(store))return false;
  localStorage.setItem(CUR,k);
  return true;
}

export function clearLocalUser(){
  try{localStorage.removeItem(CUR);}catch(e){}
}

export function listLocalUsers(){
  const store=readStore();
  return Object.values(store.users);
}

const freshProfile=()=>({elo:1200,wins:0,losses:0,coins:300,purchases:[],passXp:0,passSeason:'s1',passClaimed:[],lastLogin:0});

export async function signUp(handle,pw){
  if(!/^[a-zA-Z0-9._-]{3,18}$/.test(handle))return {ok:false,why:'handle: 3–18 letters/digits/._-'};
  if((pw||'').length<8)return {ok:false,why:'password needs 8+ chars'};

  const store=readStore();
  if(store.users[slot(handle)]){
    return {ok:false,why:'handle already taken'};
  }

  store.users[slot(handle)]={handle,pw,profile:freshProfile()};
  if(writeStore(store)){
    localStorage.setItem(CUR,slot(handle));
    return {ok:true};
  }
  return {ok:false,why:'failed to save profile'};
}

export async function signIn(handle,pw){
  const store=readStore();
  const user=store.users[slot(handle)];
  if(!user)return {ok:false,why:'user not found'};
  if(user.pw!==pw){
    return {ok:false,why:'incorrect password'};
  }

  // Update last login
  user.profile.lastLogin=new Date().toISOString().split('T')[0];
  setLocalUser(user.handle,user.pw,user.profile);

  return {ok:true,profile:user.profile};
}

export async function signOut(){
  clearLocalUser();
}

export async function reportMatch(opponent,result,nonce){
  // Local mode: no opponent tracking, just update current user's stats
  const user=getLocalUser();
  if(!user)return null;
  const profile=user.profile;
  if(result==='win'){
    profile.elo+=10;
    profile.wins+=1;
  }else{
    profile.elo-=5;
    profile.losses+=1;
  }
  user.profile=profile;
  setLocalUser(user.handle,user.pw,profile);
  return {elo:profile.elo,data:profile};
}

export async function ladder(limit=50){
  return listLocalUsers()
    .map(u=>({handle:u.handle,elo:u.profile.elo,wins:u.profile.wins,losses:u.profile.losses}))
    .sort((a,b)=>b.elo-a.elo)
    .slice(0,limit);
}

export async function createInvite(kind,meta){return {ok:false,why:'requires backend'};}
export async function getInvite(code){return null;}
export async function patchInvite(code,patch){return {ok:false,why:'requires backend'};}
export async function pushMove(code,seq,mover,move){}
export async function getMoves(code,afterSeq){return [];}
export async function react(code,emoji){}
export async function getReactions(code,afterId){return [];}
