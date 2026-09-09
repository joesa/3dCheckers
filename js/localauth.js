// Local account system for when Supabase is unavailable
// Stores user data encrypted in localStorage
const KEY='ad-local-auth';
const USERKEY='ad-user-data';

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

export function getLocalUser(){
  try{
    const token=localStorage.getItem(KEY);
    if(!token)return null;
    return decrypt(token,getSecret());
  }catch(e){return null;}
}

export function setLocalUser(handle,pw,profile){
  try{
    const token=encrypt({handle,pw,profile},getSecret());
    if(token)localStorage.setItem(KEY,token);
    return true;
  }catch(e){return false;}
}

export function clearLocalUser(){
  try{localStorage.removeItem(KEY);}catch(e){}
}

export async function signUp(handle,pw){
  if(!/^[a-zA-Z0-9._-]{3,18}$/.test(handle))return {ok:false,why:'handle: 3–18 letters/digits/._-'};
  if((pw||'').length<8)return {ok:false,why:'password needs 8+ chars'};
  
  // Check if handle already exists
  const existing=getLocalUser();
  if(existing&&existing.handle.toLowerCase()===handle.toLowerCase()){
    return {ok:false,why:'handle already taken'};
  }
  
  const profile={elo:1200,wins:0,losses:0,coins:300,purchases:[],passXp:0,passSeason:'s1',passClaimed:[],lastLogin:0};
  if(setLocalUser(handle,pw,profile)){
    return {ok:true};
  }
  return {ok:false,why:'failed to save profile'};
}

export async function signIn(handle,pw){
  const user=getLocalUser();
  if(!user)return {ok:false,why:'user not found'};
  if(user.handle.toLowerCase()!==handle.toLowerCase()){
    return {ok:false,why:'user not found'};
  }
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
  // Local mode: return current user if they exist
  const user=getLocalUser();
  if(!user)return [];
  return [{handle:user.handle,elo:user.profile.elo,wins:user.profile.wins,losses:user.profile.losses}];
}

export async function createInvite(kind,meta){return {ok:false,why:'requires backend'};}
export async function getInvite(code){return null;}
export async function patchInvite(code,patch){return {ok:false,why:'requires backend'};}
export async function pushMove(code,seq,mover,move){}
export async function getMoves(code,afterSeq){return [];}
export async function react(code,emoji){}
export async function getReactions(code,afterId){return [];}
