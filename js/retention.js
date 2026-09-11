/* Retention core — daily habit, compounding identity, and "come back tomorrow" hooks.
   Everything here is offline (localStorage + the existing wallet) and DOM-free so it
   can be unit-tested. Server-mirrored social features are intentionally NOT faked. */
import {dayKey,generatePuzzle} from './puzzles.js';
import * as ECO from './economy.js';
import {keyFor} from './scope.js';
import {SHAPES,PALETTES,THRONES,THEMEPACKS} from './cosmetics.js';
import {THEME_IDS} from './themes.js';

const CK='ad-retention';

function blank(){
  return {
    career:{wins:0,losses:0,played:0,captures:0,crowns:0,bestChain:0,winStreak:0,bestWinStreak:0,fastestWin:0,biggestComeback:0},
    puzzle:{streak:0,lastSolvedDay:''},
    login:{streak:0,lastActiveDay:''},
    milestones:[],granted:[],sets:[],
    quests:{day:'',prog:{},claimed:[]},
  };
}
function read(){try{return JSON.parse(localStorage.getItem(keyFor(CK))||'null')||blank();}catch(e){return blank();}}
function write(s){try{localStorage.setItem(keyFor(CK),JSON.stringify(s));}catch(e){}}
const yday=()=>dayKey(new Date(Date.now()-864e5));
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

/* ---------------- career stats + records ---------------- */
export function career(){return read().career;}

export function recordGame(res){
  const s=read();const c=s.career;const ev=[];
  c.played++;
  if(res.win){c.wins++;c.winStreak++;c.bestWinStreak=Math.max(c.bestWinStreak,c.winStreak);}
  else{c.losses++;c.winStreak=0;}
  c.captures+=res.captured||0;c.crowns+=res.crowns||0;
  c.bestChain=Math.max(c.bestChain,res.bestChain||0);
  if(res.win){
    const mv=res.moves||999;if(!c.fastestWin||mv<c.fastestWin)c.fastestWin=mv;
    if(res.comeback)c.biggestComeback=Math.max(c.biggestComeback,res.deficit||1);
    if(ECO.dailyOnce('ret-firstwin',()=>{})){ECO.addCoins(60,'retention-firstwin');ev.push({t:'firstwin',coins:60});}
    if(res.comeback&&ECO.dailyOnce('ret-jackpot',()=>{})){ECO.addCoins(220,'retention-jackpot');ev.push({t:'jackpot',coins:220});}
  }
  for(const m of MILESTONES){
    if(s.milestones.includes(m.id))continue;
    if(metMilestone(c,m)){s.milestones.push(m.id);ECO.grantItem(m.item,'milestone:'+m.id);ev.push({t:'milestone',m});}
  }
  write(s);
  return ev;
}

export const MILESTONES=[
  {id:'octagon', kind:'wins',need:10,  item:'octagon',  label:'10 duels won'},
  {id:'coralteal',kind:'wins',need:50, item:'coralteal',label:'50 duels won'},
  {id:'iron',    kind:'wins',need:100, item:'iron',     label:'100 duels won'},
  {id:'archmage',kind:'wins',need:250, item:'archmage', label:'250 duels won'},
  {id:'astral',  kind:'wins',need:500, item:'astral',   label:'500 duels won'},
  {id:'star',    kind:'chain',need:5,  item:'star',     label:'a 5-capture chain'},
  {id:'gilded',  kind:'fast', need:12, item:'gilded',   label:'a win in 12 moves'},
];
function metMilestone(c,m){
  if(m.kind==='wins')return c.wins>=m.need;
  if(m.kind==='chain')return c.bestChain>=m.need;
  if(m.kind==='fast')return c.fastestWin>0&&c.fastestWin<=m.need;
  return false;
}

/* ---------------- daily quests (3, seeded per day) ---------------- */
const QUEST_POOL=[
  {id:'win1',  label:'Win a duel',              goal:1, coins:80, xp:15, val:p=>p.wins||0},
  {id:'win2',  label:'Win 2 duels',             goal:2, coins:150,xp:22, val:p=>p.wins||0},
  {id:'cap12', label:'Capture 12 pieces',       goal:12,coins:70, xp:12, val:p=>p.captures||0},
  {id:'cap20', label:'Capture 20 pieces',       goal:20,coins:110,xp:16, val:p=>p.captures||0},
  {id:'chain3',label:'Land a 3+ capture chain', goal:1, coins:90, xp:15, val:p=>p.chain||0},
  {id:'crown3',label:'Crown 3 pieces',          goal:3, coins:80, xp:14, val:p=>p.crowns||0},
  {id:'play3', label:'Play 3 games',            goal:3, coins:80, xp:12, val:p=>p.played||0},
];
export function todayQuests(){
  const s=read();const day=dayKey();
  if(s.quests.day!==day){s.quests={day,prog:{},claimed:[]};write(s);}
  let seed=hash('q'+day);const rng=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const pool=QUEST_POOL.slice();const picks=[];
  for(let i=0;i<3&&pool.length;i++)picks.push(pool.splice(rng()*pool.length|0,1)[0]);
  return picks;
}
export function questBoard(){
  const s=read();const p=s.quests.prog;
  return todayQuests().map(q=>({q,prog:Math.min(q.goal,q.val(p)||0),done:s.quests.claimed.includes(q.id)}));
}
export function questProgress(res){
  const s=read();const day=dayKey();
  if(s.quests.day!==day)s.quests={day,prog:{},claimed:[]};
  const p=s.quests.prog;
  p.played=(p.played||0)+1;
  if(res.win)p.wins=(p.wins||0)+1;
  p.captures=(p.captures||0)+(res.captured||0);
  p.crowns=(p.crowns||0)+(res.crowns||0);
  if(res.bestChain>=3)p.chain=(p.chain||0)+1;
  const ev=[];
  for(const q of todayQuests()){
    if(s.quests.claimed.includes(q.id))continue;
    if((q.val(p)||0)>=q.goal){s.quests.claimed.push(q.id);ECO.addCoins(q.coins,'quest:'+q.id);ECO.addXp(q.xp);ev.push({t:'quest',q});}
  }
  write(s);
  return ev;
}

/* ---------------- daily login streak ---------------- */
export function touchLogin(){
  const s=read();const today=dayKey();
  if(s.login.lastActiveDay===today)return{streak:s.login.streak,isNewDay:false};
  s.login.streak=s.login.lastActiveDay===yday()?s.login.streak+1:1;
  s.login.lastActiveDay=today;
  let jewel=null;
  if(s.login.streak>=7&&!s.granted.includes('streak7')){s.granted.push('streak7');ECO.grantItem('gilded','streak7');jewel='gilded';}
  write(s);
  return{streak:s.login.streak,isNewDay:true,jewel};
}
export function loginStreak(){return read().login.streak;}

/* ---------------- daily puzzle streak + shareable card ---------------- */
export function markPuzzle(solved){
  const s=read();const today=dayKey();
  if(s.puzzle.lastSolvedDay===today)return s.puzzle.streak;
  if(solved){s.puzzle.streak=s.puzzle.lastSolvedDay===yday()?s.puzzle.streak+1:1;s.puzzle.lastSolvedDay=today;write(s);}
  return s.puzzle.streak;
}
export function puzzleStreak(){return read().puzzle.streak;}
export function shareCard(solved){
  const s=read();const day=dayKey();const pz=generatePuzzle(day);const target=pz?pz.target:0;
  const n=s.puzzle.streak;
  const band=n>=14?'🌩️':n>=7?'⚡':n>=3?'🔥':'⭐';
  const bar='▓'.repeat(Math.min(n,12))+'░'.repeat(Math.max(0,12-n));
  const host=(typeof location!=='undefined'&&location.host)||'aetherdraughts';
  return [
    'AETHER DRAUGHTS · Daily Puzzle',day,
    (solved?'✅ solved':'❌ slipped')+' · '+target+'-capture chain',
    'Streak '+n+'  '+band+'  '+bar,
    'play: '+host,
  ].join('\n');
}

/* ---------------- world of the day (free worlds only) ---------------- */
export function worldOfToday(){
  const free=THEME_IDS.filter(id=>!THEMEPACKS[id]);
  if(!free.length)return THEME_IDS[0];
  return free[hash('w'+dayKey())%free.length];
}

/* ---------------- collection sets + crown jewels ---------------- */
export const SETS=[
  {id:'shapers', name:'The Shapers', label:'Command every piece shape',  catalog:SHAPES,   jewel:'court'},
  {id:'chromatic',name:'Chromatic',  label:'Hold every army palette',    catalog:PALETTES, jewel:'astral'},
  {id:'thrones', name:'Throne Room',  label:'Seat yourself on every throne',catalog:THRONES,jewel:'gilded'},
];
export function setProgress(){
  const owned=ECO.getWallet().purchases;
  return SETS.map(set=>{
    const ids=Object.keys(set.catalog);
    const have=ids.filter(id=>(set.catalog[id].price||0)===0||owned.includes(id)).length;
    return{set,have,total:ids.length,done:have>=ids.length};
  });
}
export function checkSets(){
  const s=read();const ev=[];
  for(const pr of setProgress()){
    if(pr.done&&!s.sets.includes(pr.set.id)){s.sets.push(pr.set.id);ECO.grantItem(pr.set.jewel,'set:'+pr.set.id);ev.push({t:'set',set:pr.set,jewel:pr.set.jewel});}
  }
  if(ev.length)write(s);
  return ev;
}
export function unlockedByMilestone(){return read().milestones;}

/* ---------------- async duel inbox + "your move" reminders ----------------
   Client-side ledger of correspondence-style duels. Reminders use the browser
   Notification API; cross-device move sync rides the account backend when present. */
const IK='ad-inbox';
export function inbox(){try{return JSON.parse(localStorage.getItem(keyFor(IK))||'[]');}catch(e){return[];}}
export function saveInbox(l){try{localStorage.setItem(keyFor(IK),JSON.stringify(l.slice(0,24)));}catch(e){}}
export function noteInbox(g){const l=inbox().filter(x=>x.id!==g.id);l.unshift(g);saveInbox(l);}
export function clearInbox(id){saveInbox(inbox().filter(x=>x.id!==id));}
export function pendingInbox(){const t=dayKey();return inbox().filter(x=>x.status==='wait'&&x.lastDay!==t);}
export function requestNotify(){try{if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}catch(e){}}
export function fireReminder(){try{if('Notification' in window&&Notification.permission==='granted')new Notification('Aether Draughts',{body:'A duel awaits your move.',tag:'ad-move'});}catch(e){}}
