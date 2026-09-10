import {dayKey} from './puzzles.js';
import {keyFor,keyOf,emit} from './scope.js';

const KEY='ad-wallet';
const blank=()=>({coins:300,ledger:[],purchases:[],premium:false,passXp:0,passClaimed:[],passSeason:'s1',lastLogin:0});

export function getWallet(){
  try{
    const w=JSON.parse(localStorage.getItem(keyFor(KEY))||'null');
    if(w&&typeof w.coins==='number')return w;
  }catch(e){}
  return blank();
}
export function saveWallet(w){
  try{localStorage.setItem(keyFor(KEY),JSON.stringify(w));}catch(e){}
  emit('wallet',w);
}
/* server -> cache, without bouncing a write back to the server */
export function hydrateWallet(w){
  try{localStorage.setItem(keyFor(KEY),JSON.stringify(w||blank()));}catch(e){}
}
export function freshWallet(){return blank();}
/* the unscoped pre-account bucket, for one-time adoption into a new account */
export function readGuestWallet(){
  try{
    const w=JSON.parse(localStorage.getItem(keyOf(KEY,null))||'null');
    if(w&&typeof w.coins==='number')return w;
  }catch(e){}
  return null;
}
export function forgetGuestWallet(){try{localStorage.removeItem(keyOf(KEY,null));}catch(e){}}

export function addCoins(n,reason){
  const w=getWallet();
  w.coins+=n;
  w.ledger.push({t:Date.now(),n,reason});
  if(w.ledger.length>60)w.ledger=w.ledger.slice(-60);
  saveWallet(w);
  return w.coins;
}
export function spendCoins(n,reason){
  const w=getWallet();
  if(w.coins<n)return false;
  w.coins-=n;
  w.ledger.push({t:Date.now(),n:-n,reason});
  if(w.ledger.length>60)w.ledger=w.ledger.slice(-60);
  saveWallet(w);
  return true;
}
export function owns(itemId){
  return getWallet().purchases.includes(itemId);
}
function grant(itemId,reason){
  const w=getWallet();
  if(!w.purchases.includes(itemId))w.purchases.push(itemId);
  w.ledger.push({t:Date.now(),n:0,reason:'GRANT:'+itemId+' via '+reason});
  saveWallet(w);
}
export function grantItem(itemId,reason){grant(itemId,reason||'reward');}
export async function purchase(itemId,price,paidWith){
  if(owns(itemId))return true;
  if(paidWith==='cash'){
    const ok=await PROVIDER.checkout(itemId,price);
    if(!ok)return false;
    grant(itemId,'cash');
    return true;
  }
  if(!spendCoins(price,'buy:'+itemId))return false;
  grant(itemId,'coins');
  return true;
}

/* Payment provider seam: swap checkout for Stripe in production. */
export const PROVIDER={
  mode:'sandbox',
  checkout(itemId,usd){
    return new Promise(res=>{
      const box=document.getElementById('checkout');
      if(!box){res(false);return;}
      box.querySelector('#co-item').textContent=itemId;
      box.querySelector('#co-amt').textContent='$'+usd.toFixed(2)+' USD (sandbox)';
      box.classList.remove('hidden');
      box.querySelector('#co-buy').onclick=()=>{box.classList.add('hidden');res(true);};
      box.querySelector('#co-cancel').onclick=()=>{box.classList.add('hidden');res(false);};
    });
  },
};
PROVIDER.checkoutSync=(itemId,usd)=>{throw new Error('use provider.checkout promise');};

export function doneDaily(key){
  try{return !!localStorage.getItem(keyFor('ad-once')+'-'+key+'-'+dayKey());}catch(e){return false;}
}
export function dailyOnce(key,fn){
  const k=keyFor('ad-once')+'-'+key+'-'+dayKey();
  try{if(localStorage.getItem(k))return false;}catch(e){return false;}
  try{localStorage.setItem(k,'1');}catch(e){}
  fn();
  return true;
}

/* ---------- battle pass ---------- */
export const PASS_SEASON='s1';
export const PASS_TRACK=[
  {lvl:2,reward:'skin:slate',premium:false},
  {lvl:4,reward:'coins:150',premium:false},
  {lvl:6,reward:'throne:stone',premium:false},
  {lvl:8,reward:'coins:250',premium:false},
  {lvl:10,reward:'skin:obsidian',premium:true},
  {lvl:13,reward:'throne:iron',premium:true},
  {lvl:16,reward:'theme:voidgarden',premium:true},
  {lvl:20,reward:'skin:astral',premium:true},
];
export function xpNeeded(lvl){return 60+lvl*40;}
export function addXp(n){
  const w=getWallet();
  if(w.passSeason!==PASS_SEASON){w.passSeason=PASS_SEASON;w.passXp=0;w.passClaimed=[];}
  w.passXp+=n;
  saveWallet(w);
  return w;
}
export function passLevel(w){
  if(w.passSeason!==PASS_SEASON)return {lvl:1,xp:0,need:xpNeeded(1)};
  let lvl=1,xp=w.passXp;
  while(xp>=xpNeeded(lvl)){xp-=xpNeeded(lvl);lvl++;}
  return {lvl,xp,need:xpNeeded(lvl)};
}
export function claimPass(tierIdx){
  const w=getWallet();
  const p=PASS_TRACK[tierIdx];
  if(!p)return {ok:false,why:'no tier'};
  const {lvl}=passLevel(w);
  if(lvl<p.lvl)return {ok:false,why:'not unlocked'};
  if(p.premium&&!w.premium)return {ok:false,why:'premium required'};
  if(w.passClaimed.includes(tierIdx))return {ok:false,why:'claimed'};
  w.passClaimed.push(tierIdx);
  saveWallet(w);
  if(p.reward.startsWith('coins:'))addCoins(parseInt(p.reward.slice(6),10),'pass');
  else grant(p.reward,'pass');
  return {ok:true,reward:p.reward};
}

/* ---------- daily login bonus ---------- */
export function getDailyBonus(){
  const today=dayKey();
  const w=getWallet();
  if(w.lastLogin===today)return 0;
  const bonus=50+Math.min(5,w.purchases.length)*10;
  w.lastLogin=today;
  saveWallet(w);
  addCoins(bonus,'daily-login');
  return bonus;
}

/* ---------- wagers ---------- */
export function canWager(n){return getWallet().coins>=n;}
export function escrowWager(n){return spendCoins(n,'wager:escrow');}
export function settleWager(n,won){
  if(won)addCoins(n*2,'wager:win');
  else addCoins(0,'wager:lost');
}
