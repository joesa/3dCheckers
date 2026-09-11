import * as GAME from './game.js';
import {createWorld} from './world.js';
import {visibleSet} from './fog.js';
import {makeAvatar,makeCrowd,makeNameTag} from './actors.js';
import {chooseMove,LEVEL_NAMES,PERSONAS,taunt as aiTaunt,QK,qkReset} from './ai.js';
import {TabsTransport,RTCRoom} from './net.js';
import {THEMES,THEME_IDS,DEFAULT_THEME} from './themes.js';
import {setSkin} from './pieces.js';
import {sfx,music} from './audio.js';
import {Clocks,CONTROLS} from './clock.js';
import {generatePuzzle,dayKey} from './puzzles.js';
import {GAUNTLET_ROUNDS,rollDaily,gauntletState,saveGauntlet,roundReward,clearReward} from './gauntlet.js';
import {buildCode,parseCode,openViewer} from './replay.js';
import * as ECO from './economy.js';
import {SKINS,THRONES,VICTORIES,THEMEPACKS,CLOCKS,AVATARS,SHAPES,PALETTES,getEquip,setEquip,unlocked,pieceSkinParams,allCatalog,avatarLook,armyPalette} from './cosmetics.js';
import {Auth,signUp as authSignUp,signIn as authSignIn,signOut as authSignOut,reportMatch as authReportMatch,ladder as authLadder,onAuthChange,onAssetsChange,flushAssets} from './auth.js';
import * as RET from './retention.js';
import {SRV,srvInit,srvReconnect,corrCreate,corrJoin,corrDecline,corrResign,corrPost,corrList,corrGame,findHandle,follow,unfollow,rivals,corrStandings,corrQuickest,corrLongest,ladderWinrate,pushRegister,pushUnregister,duelOpen,duelAccept,duelAttest,stakeBalance,stakeClaimDaily,duelsOpen,betPools,betMine,betPlace,watchHeartbeat,watchRoster,watchLeave,createInvite,getInvite,pushMove,getMoves,getReactions,react as srvReact,newCode as srvNewCode} from './srv.js';
import {corrState} from './corr.js';
import {CONFIG} from './config.js';
import {addTween} from './tween.js';

const $=s=>document.querySelector(s);
const show=(el,on)=>el.classList.toggle('hidden',!on);
const TEAM_NAME={red:'Ember',black:'Frost'};

const ADJ=['Swift','Smoky','Crimson','Frosty','Rogue','Gilded','Misty','Thunder','Quiet','Lucky'];
const NOUN=['Comet','Willow','Raven','Ember','Glacier','Nomad','Pixie','Heron','Vagabond','Star'];
let MYNAME=ADJ[Math.random()*ADJ.length|0]+' '+NOUN[Math.random()*NOUN.length|0];
let MYHANDLE=null,OPPNAME=null;
function myHandle(){
  const p=currentProfile();
  return (signedIn()&&p&&(p.handle||String((SRV.me&&SRV.me.id)||'').replace(/^local:/,'')))||null;
}
function refreshNames(){
  const rn={red:TEAM_NAME.red,black:TEAM_NAME.black};
  if(G.mode==='watch'&&G.watchNames){rn.red=G.watchNames.host||rn.red;rn.black=G.watchNames.guest||rn.black;}
  else if(G.myColor){
    rn[G.myColor]=MYHANDLE||TEAM_NAME[G.myColor];
    const o=G.myColor===GAME.RED?'black':'red';
    rn[o]=OPPNAME||TEAM_NAME[o];
  }else if(G.mode==='ai'){rn.black='Storm';}
  G.dispName=rn;
  const short=s=>String(s).length>8?String(s).slice(0,7)+'…':String(s);
  const rl=document.querySelector('.ember-l'),fl=document.querySelector('.frost-l');
  if(rl)rl.textContent=short(rn.red);
  if(fl)fl.textContent=short(rn.black);
}

function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}

// Initialize auth on boot
Auth.init().then(()=>updateAuthUI());

// Create world - must be before Auth.init() completes if it triggers world usage
const world=createWorld($('#gl'),lsGet('ad-theme')||DEFAULT_THEME);

const chatLastSend={last:0,throttle:1500};
function throttledChat(text){
  const now=Date.now();
  if(now-chatLastSend.last<chatLastSend.throttle){
    toast('Please wait before sending another message','bad');
    return false;
  }
  chatLastSend.last=now;
  return true;
}

/* avatars + crowd — seeded so both duelists see the same designs */
let SEED=Math.random()*1e9|0;
const rigs={red:null,black:null};
const anchors={red:null,black:null};
const seats={red:{facing:Math.PI,z:5.3,side:1},black:{facing:0,z:-5.3,side:-1}};
let crowd=null;
let opening=false;
function buildActors(){
  for(const[team,facing,zpos]of[['red',Math.PI,5.3],['black',0,-5.3]]){
    if(anchors[team])world.removeObject(anchors[team]);
    const anchor=world.makeGroup(0,.05,zpos);
    const a=makeAvatar(team,facing,(SEED+(team==='red'?1:2))>>>0,getEquip().throne,avatarLook());
    anchor.add(a.group);
    anchors[team]=anchor;
    rigs[team]={rig:a.rig,update:a.update,person:a.person,chair:a.chair,setStand:a.setStand,setWalk:a.setWalk,setHeading:a.setHeading};
    a.person.position.set(0,0,0);
  }
  if(crowd)world.removeObject(crowd.group);
  crowd=makeCrowd(SEED);
  world.addObject(crowd.group);
}
world.reshape(getEquip().shape);
world.army(armyPalette());
buildActors();
world.onFrame(dt=>{
  if(rigs.red)rigs.red.update(dt);
  if(rigs.black)rigs.black.update(dt);
  if(crowd)crowd.update(dt);
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* per-move turn clock: a fresh countdown armed on every move */
const TURN_MS=30000, BLAZING_MS=15000;

const G={
  mode:null, transport:null, myColor:null,
  state:null, moves:[], selected:null,
  busy:false, over:false, started:false,
  peerSeen:false, turnEnd:null, lastTick:0, turnMoves:-1,
  rtcWasHost:false, aiLevel:'medium', aiTimer:0,
  clock:null, clockId:'none', clockInited:false, turnLen:TURN_MS, blazing:false,
  record:[], gv:null, pz:null, persona:null, wagerN:0, nextAction:null,
  duelId:null,
  behind:false, deficit:0,
  fog:false,
  dispName:{red:'Ember',black:'Frost'}, watchNames:null,
};
const isOnline=()=>G.mode==='host'||G.mode==='guest';
let roomTheme=DEFAULT_THEME;

/* ================= rendering ================= */

function applyFog(){
  if(G.fog&&(G.mode==='ai'||G.mode==='hotseat')&&G.state){
    const viewer=G.mode==='ai'?(G.myColor||GAME.RED):G.state.turn;
    world.setFog(visibleSet(G.state.board,viewer),viewer);
  }else world.setFog(null);
}

function renderBoard(stagger=false){
  world.syncBoard(G.state.board,stagger);
  applyFog();
}

function updateHUD(){
  const t=G.state.turn;
  applyFog();
  $('#turn-emblem').className=t;
  $('#turn-emblem').style.color=t==='red'?'var(--ember)':'var(--frost)';
  let label=G.dispName[t]+' to move';
  if(G.mode==='ai')label+=t===GAME.BLACK?' — machine':' — you';
  else if(G.myColor)label+= (t===G.myColor?' — you':' — opponent');
  $('#turn-text').textContent=G.over?'Game over':label;
  updateMoveHud();
  show($('#clocks'),!!(G.clock&&G.clock.on));
  if(G.over){show($('#timer-wrap'),false);show($('#timer-secs'),false);}
  for(const color of['red','black']){
    const lost=12-GAME.countPieces(G.state.board,color);
    const el=$(color==='red'?'#cap-red':'#cap-black');
    el.innerHTML='';
    for(let i=0;i<lost;i++){
      const d=document.createElement('div');
      d.className='pip '+color;
      el.appendChild(d);
    }
  }
}

function updateMoveHud(){
  const el=$('#move-count');
  if(el&&G.state)el.textContent='Move '+(Math.floor(G.state.moveNo/2)+1);
}
function setTimerSecs(secs){
  const el=$('#timer-secs');if(!el)return;
  const active=!!G.turnEnd&&!G.over;
  show(el,active);
  if(!active)return;
  const m=(secs/60)|0,s=secs%60;
  el.textContent=m+':'+(s<10?'0':'')+s;
  el.classList.toggle('low',secs<=10);
}
function localMoverOk(){
  if(G.mode==='hotseat')return true;
  if(G.mode==='guest')return false;
  if(G.mode==='ai'||G.mode==='puzzle')return G.state.turn===GAME.RED;
  if(G.mode==='host')return G.state.turn===G.myColor;
  if(G.mode==='corr')return G.state.turn===G.myColor;
  return false;
}

function logMove(move,color,promoted,moveNo){
  const li=document.createElement('li');
  li.className=color;
  const n=move.captures.length;
  li.innerHTML=`<span class="n">${moveNo}.</span> <i>${G.dispName[color]}</i> ${GAME.sqName(move.from)}→${GAME.sqName(move.path[move.path.length-1])}${n?' ×'+n:''}${promoted?' ♛':''}`;
  $('#log').appendChild(li);
  $('#log').scrollTop=1e9;
}

function toast(msg,cls=''){
  const d=document.createElement('div');
  d.className='toast '+cls;
  d.textContent=msg;
  $('#toasts').appendChild(d);
  setTimeout(()=>d.remove(),2700);
}

function appendChat(cls,who,text){
  const d=document.createElement('div');
  d.className=cls;
  d.textContent=who?`${who}: ${text}`:text;
  $('#chat-msgs').appendChild(d);
  $('#chat-msgs').scrollTop=1e9;
}

/* ================= game flow ================= */

function refreshMoves(){
  G.moves=G.state?GAME.legalMoves(G.state):[];
}

function clearSelection(){
  G.selected=null;
  world.showSelect(null);
  world.clearMarkers();
}

function applyState(state){
  if(state.moveNo===0)$('#log').innerHTML='';
  if(G.clock&&G.clock.on&&G.state&&state.moveNo>G.state.moveNo)G.clock.commit(G.state.turn);
  G.state=state;
  refreshMoves();
  clearSelection();
  renderBoard();
  G.over=!!state.winner;
  if(G.over)endGame(state.winner,false);
  else{show($('#result'),false);armTurn();}
  updateHUD();
  maybeAI();
}

async function playMove(move){
  if(G.busy||G.over)return;
  if(G.mode==='guest'){
    G.record.push(move);
    G.transport.send({t:'move',move});
    return;
  }
  if(G.mode==='host'&&!G.moves.some(x=>GAME.movesEqual(x,move))){
    sfx.error();
    if(G.transport)G.transport.send({t:'state',state:G.state});
    return;
  }
  if(G.mode==='host')G.transport.send({t:'startmove',move});
  const color=G.state.board[move.from[0]][move.from[1]].color;
  const promoted=G.isPromoCheck(move);
  await runAnimation(move,color);
  const nextState=GAME.applyMove(G.state,move);
  G.state=nextState;
  if(G.myColor){let mine=0,opp=0;for(const row of nextState.board)for(const p of row){if(!p)continue;p.color===G.myColor?mine++:opp++;}if(mine<opp){G.behind=true;G.deficit=Math.max(G.deficit,opp-mine);}}
  refreshMoves();
  logMove(move,color,promoted,nextState.moveNo);
  world.showLastMove(move);
  G.record.push(move);
  if(G.clock&&G.clock.on)G.clock.commit(color);
  if(promoted){
    sfx.crown();world.burst(move.path[move.path.length-1],0xffd75e,26);crowd.react('crown');
    if(G.gv&&G.gv.mod==='royal'&&!G.state.winner)G.state={...G.state,winner:color};
  }
  if(move.captures.length&&G.mode==='ai'&&color===GAME.BLACK&&G.persona&&Math.random()<.4)showTaunt(aiTaunt(G.aiLevel,'cap'));
  if(G.gv)gauntletMoveHook(color,move);
  if(G.qk)quantMoveHook(color,move);
  if(G.mode==='puzzle'){puzzleJudge(move);return;}
  if(G.watchCode&&isOnline())pushMove(G.watchCode,nextState.moveNo,color,move);
  if(G.mode!=='hotseat'&&isOnline())G.transport.send({t:'state',state:G.state});
  if(G.mode==='corr'&&G.corrId){
    const end=G.state.winner&&G.state.winner===G.myColor?'win':null;
    corrPost(G.corrId,move,end).then(r=>{if(!r.ok)toast('Server unreachable — your move was not saved ('+(r.why||'')+')','bad');});
  }
  renderBoard();
  updateHUD();
  G.busy=false;
  if(G.state.winner)endGame(G.state.winner,false);
  else armTurn();
  maybeAI();
}
G.isPromoCheck=move=>{
  const p=G.state.board[move.from[0]][move.from[1]];
  const last=move.path[move.path.length-1];
  return p&&!p.king&&GAME.isPromo(p.color,last[0]);
};

async function runAnimation(move,color){
  G.busy=true;
  clearSelection();
  const rig=color?rigs[color]:null;
  if(rig){
    rig.rig.focusOn(world.sqToVec(move.from,.5));
    rig.rig.reach(world.sqToVec(move.from,.42));
    await sleep(340);
    rig.rig.grab();
    sfx.grab();
    await sleep(160);
  }
  let combo=0;
  sfx[move.captures.length?'jump':'move']();
  await world.animateMove(move,
    sq=>{
      world.removeCaptured(sq);
      combo++;
      sfx.capture(combo);
      world.shake(combo>1?.42:.2);
      crowd.react(combo>1?'multi':'capture');
    },
    rig?(p=>rig.rig.follow({x:p.x,y:p.y+.42,z:p.z})):null,
    {carry:!!rig});
  if(rig){
    const last=move.path[move.path.length-1];
    rig.rig.follow(world.sqToVec(last,.34));
    await sleep(170);
    rig.rig.release();
    rig.rig.focusOn(world.sqToVec(last,.4));
  }
}

function endGame(winnerColor,resigned){
  if($('#result').classList.contains('hidden')===false)return;
  G.over=true;
  clearSelection();
  updateHUD();
  const me=G.myColor;
  const winName=G.dispName[winnerColor];
  $('#result-emblem').style.color=winnerColor==='red'?'var(--ember)':'var(--frost)';
  let title,sub;
  if(!me){title=`${winName.toUpperCase()} TRIUMPHS`;sub='Pass the crown to the next duelist.';sfx.win();}
  else if(winnerColor===me){title='VICTORY';sub=resigned?'Your opponent surrendered the skies.':'Total dominance, '+MYNAME+'.';sfx.win();}
  else{title='DEFEAT';sub=resigned?'You surrendered.':'Regroup and reclaim the storm.';sfx.lose();}
  $('#result-title').textContent=title;
  $('#result-sub').textContent=sub;
  const btn=$('#b-rematch2');
  btn.textContent=(me&&G.mode==='guest')?'Ask for Rematch':'Rematch';
  btn.onclick=doRematch;
  G.nextAction=null;
  show($('#result'),true);
  world.celebrate(winnerColor);
  crowd.celebrate();
  const vic=getEquip().victory;
  if(vic&&vic!=='default')setTimeout(()=>world.victoryDance(winnerColor,vic),350);
  if(G.mode==='ai'&&!G.gv)ECO.addXp(20);
  else if(isOnline()||G.mode==='hotseat')ECO.addXp(15);
  if(G.mode==='ai'&&!G.gv&&G.persona)showTaunt(winnerColor===GAME.BLACK?G.persona.win:G.persona.loss);
  show($('#b-replay-code'),G.record.length>0&&G.mode!=='puzzle');
  if(G.duelId){
    duelAttest(G.duelId, winnerColor===me?'win':'loss').then(r=>{
      if(!r||!r.ok)return;
      if(r.status==='completed')toast(me&&winnerColor===me?'Stake won — escrow paid to you':'Stake lost to your opponent',me&&winnerColor===me?'good':'bad');
      else if(r.status==='refunded')toast('Result disputed — stakes refunded','bad');
      else if(r.status==='active')toast('Your result is attested — awaiting your opponent');
    });
  }else if(G.wagerN>0){
    const won=me&&winnerColor===me;
    ECO.settleWager(G.wagerN,won);
    toast(won?'Wager won: +'+(G.wagerN*2)+' coins':'Wager lost',won?'good':'bad');
    G.wagerN=0;
    refreshWallet();
  }
  if(G.qk)quantEnd(winnerColor);
  if(G.gv)gauntletEnd(winnerColor);
  if(me){
    let captured=0,bestChain=0;
    for(const mv of G.record){if(mv.captures&&mv.captures.length){captured+=mv.captures.length;bestChain=Math.max(bestChain,mv.captures.length);}}
    let crowns=0;for(const row of G.state.board)for(const p of row)if(p&&p.king&&p.color===me)crowns++;
    const res={win:winnerColor===me,captured,bestChain,crowns,moves:G.state.moveNo||0,comeback:G.behind&&winnerColor===me,deficit:G.deficit};
    const evs=[...RET.recordGame(res),...RET.questProgress(res),...RET.checkSets()];
    for(const e of evs){
      if(e.t==='firstwin')toast('First victory of the day! +'+e.coins+' coins','good');
      else if(e.t==='jackpot')toast('COMEBACK JACKPOT! +'+e.coins+' coins — you turned it around!','good');
      else if(e.t==='quest')toast('Quest complete: '+e.q.label+'  +'+e.q.coins+' coins +'+e.q.xp+' XP','good');
      else if(e.t==='milestone')toast('Milestone — '+e.m.label+'! Signature item unlocked in the Marketplace','good');
      else if(e.t==='set')toast('Collection complete: '+e.set.name+'! Crown-jewel unlocked','good');
    }
    if(evs.length)refreshWallet();
  }
  if(isOnline()&&SRV.ok&&SRV.me&&SRV.oppUid&&G.myColor&&!G.gv&&G.state){
    const res=winnerColor===G.myColor?'win':'loss';
    const nonce=(SEED>>>0)*4096+(G.state.moveNo||0);
    reportMatch(SRV.oppUid,res,nonce).then(r=>{
      if(r&&r.data!=null&&r.elo!=null)toast('Ladder: '+r.elo+' \u2192 '+r.data+' elo','good');
    });
  }
}

function gauntletEnd(winnerColor){
  const won=winnerColor===GAME.RED;
  const i=G.gv.i;
  const btn=$('#b-rematch2');
  if(won){
    ECO.addCoins(roundReward(i),'gauntlet');
    const s=gauntletState();
    s.cleared=Math.max(s.cleared,i+1);
    if(i>=GAUNTLET_ROUNDS.length-1)ECO.addCoins(clearReward(),'gauntlet-clear');
    saveGauntlet(s);
    refreshWallet();
    if(i<GAUNTLET_ROUNDS.length-1){
      btn.textContent='Next Round \u25B6';
      G.nextAction=()=>{show($('#result'),false);gvRound(i+1);};
      btn.onclick=()=>{const f=G.nextAction;G.nextAction=null;if(f)f();};
    }else{
      $('#result-sub').textContent='The Gauntlet is conquered. The storm remembers your name.';
    }
  }else{
    toast('The Gauntlet claims you \u2014 regroup and return tomorrow','bad');
  }
}

function resetMatch(){
  G.state=GAME.initialState();
  G.over=false;G.busy=false;
  G.record=[];
  G.duelId=null;G._stakeWait=false;G.wagerN=0;
  G.clockInited=false;
  $('#log').innerHTML='';
  world.showLastMove(null);
  show($('#result'),false);
  renderBoard(true);
  refreshMoves();
  armTurn();
  updateHUD();
  if(G.mode==='host')G.transport.send({t:'state',state:G.state});
  maybeAI();
}

/* ================= picking ================= */

world.onPick(sq=>{
  if(!G.started||G.busy||G.over||!G.state)return;
  if(G.myColor&&G.state.turn!==G.myColor)return;
  if(G.selected){
    const mv=G.moves.find(m=>
      m.from[0]===G.selected[0]&&m.from[1]===G.selected[1]&&
      m.path[m.path.length-1][0]===sq[0]&&m.path[m.path.length-1][1]===sq[1]);
    if(mv){G.selected=null;playMove(mv);return;}
  }
  const mine=G.moves.filter(m=>m.from[0]===sq[0]&&m.from[1]===sq[1]);
  if(mine.length){
    G.selected=[...sq];
    world.showSelect(sq);
    world.showTargets(mine);
    sfx.select();
  }else clearSelection();
});

world.onHover(sq=>{
  if(!G.started||!G.state){$('#gl').style.cursor='default';return;}
  const turnOk=!G.myColor||G.state.turn===G.myColor;
  let hot=false;
  if(turnOk&&!G.busy&&!G.over&&sq){
    if(G.moves.some(m=>m.from[0]===sq[0]&&m.from[1]===sq[1]))hot=true;
    if(G.selected&&G.moves.some(m=>m.from[0]===G.selected[0]&&m.from[1]===G.selected[1]&&m.path[m.path.length-1][0]===sq[0]&&m.path[m.path.length-1][1]===sq[1]))hot=true;
  }
  $('#gl').style.cursor=hot?'pointer':'default';
});

/* ================= network ================= */

function onMessage(m){
  if(!m||!m.t)return;
  switch(m.t){
    case 'who':
      if(m.uid&&SRV.me&&m.uid!==SRV.me.id)SRV.oppUid=m.uid;
      {const nm=m.handle||m.name;if(nm){OPPNAME=nm;refreshNames();}}
      break;
    case 'hello':
      if(G.mode==='host'&&!G.peerSeen){
        G.peerSeen=true;
        G.transport.send({t:'hello'});
        G.transport.send({t:'seed',seed:SEED});
        G.transport.send({t:'start',state:G.state,theme:roomTheme,clock:G.clockId});
        enterMatch();
        sfx.join();
      }
      break;
    case 'seed':
      if(G.mode==='guest'&&!G.started){
        SEED=(m.seed>>>0)||SEED;
        buildActors();
      }
      break;
    case 'start':
      if(G.mode==='guest'){
        G.peerSeen=true;
        roomTheme=m.theme||DEFAULT_THEME;
        world.setTheme(roomTheme);
        G.clockId=m.clock||'none';
        G.clock=new Clocks(G.clockId);
        G.clockInited=false;
        enterMatch();
        applyState(m.state);
        sfx.join();
      }
      break;
    case 'move':
      if(G.mode==='host'&&G.started&&!G.over&&G.state.turn!==G.myColor){
        const ok=GAME.legalMoves(G.state).some(x=>GAME.movesEqual(x,m.move));
        if(ok)playMove(m.move);
        else G.transport.send({t:'state',state:G.state});
      }
      break;
    case 'startmove':
      if(G.mode==='guest'){
        G.record.push(m.move);
        const p=G.state.board[m.move.from[0]][m.move.from[1]];
        const color=p?p.color:G.state.turn;
        const promoted=G.isPromoCheck(m.move);
        const moveNo=G.state.moveNo+1;
        runAnimation(m.move,color).then(()=>{
          G.busy=false;
          logMove(m.move,color,promoted,moveNo);
          world.showLastMove(m.move);
          if(promoted){sfx.crown();world.burst(m.move.path[m.move.path.length-1],0xffd75e,26);crowd.react('crown');}
        }).catch(()=>{G.busy=false;});
      }
      break;
    case 'state':
      if(G.started)applyState(m.state);
      break;
    case 'chat':
      appendChat('peer',m.name,m.text);
      break;
    case 'resign':
      toast('Opponent resigned!','good');
      if(G.state){G.state={...G.state,winner:G.myColor};endGame(G.myColor,true);}
      break;
    case 'rematch-req':
      if(G.mode==='host'){toast('Opponent wants a rematch','good');resetMatch();}
      break;
    case 'emote':{
      const opp=G.myColor==='red'?'black':'red';
      if(rigs[opp])rigs[opp].rig.emote(m.e);
      if(crowd)crowd.react('cheer');
      break;
    }
    case 'wager-ask':
      if(G.wagerN>0||G.duelId){G.transport.send({t:'wager-no'});break;}
      offerWager(m.n,!!m.stake);
      break;
    case 'wager-ok':
      confirmWager(m.n,!!m.stake,'Opponent accepted the stake');
      break;
    case 'wager-no':
      if(G._stakeWait)G._stakeWait=false;
      if(G.wagerN===0&&!G.duelId)toast('Opponent declined the stake');
      break;
    case 'duel':
      if(G._stakeWait&&!G.duelId){G._stakeWait=false;duelAccept(m.id).then(r=>{
        if(r.ok&&r.status==='active'){G.duelId=m.id;toast('Stake held in escrow — play on','good');}
        else{G.duelId=null;toast('Could not enter escrow ('+(r.why||r.status||'')+') — duel is unwaged','bad');G.transport.send({t:'duel-fail',id:m.id});}
      });}
      break;
    case 'duel-fail':
      G._stakeWait=false;G.duelId=null;toast('Opponent could not fund the stake — duel is unwaged','bad');
      break;
    case 'watchreq':
      if(G.mode==='host'&&!G.watchCode&&SRV.ok){
        createWatch().then(c=>{if(c)G.transport.send({t:'watch',code:c});});
      }
      break;
    case 'watch':
      G.watchCode=m.code;
      presStart(m.code,false);
      toast('Spectators have taken the stands','good');
      show($('#btn-watch'),false);
      break;
    case 'peer-gone':
      toast('Opponent disconnected','bad');
      break;
  }
}

/* ============ arena opening: arrange throne -> walk to it -> take a seat ============ */
const easeIO=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const WALK_FROM=-2.8,WALK_TO=-1.2;   // seat-local depth (behind the throne -> just behind the seat)
const SEAT_RMIN=4.6,SEAT_RMAX=6.1,SEAT_BOARD=4.25; // placement ring + board clearance

/* --- chair placement: drag your throne around the lawn before the duel --- */
let placing=false,placeTeam=null,placeDrag=false;
const pDown=e=>placePointer('down',e),pMove=e=>placePointer('move',e),pUp=e=>placePointer('up',e);

function seatValid(x,z){
  const r=Math.hypot(x,z);
  if(r<SEAT_RMIN||r>SEAT_RMAX)return false;
  if(Math.max(Math.abs(x),Math.abs(z))<SEAT_BOARD)return false;
  return true;
}
function projectSeat(x,z){
  const rawValid=seatValid(x,z);
  let r=Math.hypot(x,z);
  if(r<1e-3){x=0;z=r=1;}
  const R=Math.max(SEAT_RMIN+.1,Math.min(SEAT_RMAX,r));
  let px=x/r*R,pz=z/r*R;
  const m=Math.max(Math.abs(px),Math.abs(pz));
  if(m<SEAT_BOARD){const k=SEAT_BOARD/m;px*=k;pz*=k;const nr=Math.hypot(px,pz);if(nr>SEAT_RMAX){const k2=SEAT_RMAX/nr;px*=k2;pz*=k2;}}
  return {x:px,z:pz,rawValid};
}
function setSeatPos(team,x,z){
  const a=anchors[team];if(!a)return;
  a.position.set(x,.05,z);
  const r=rigs[team];if(r&&r.setHeading)r.setHeading(Math.atan2(-x,-z));
}
function moveSeatTo(cx,cy){
  const p=world.groundAt(cx,cy);
  if(!p)return;
  const s=projectSeat(p.x,p.z);
  setSeatPos(placeTeam,s.x,s.z);
  world.showGhost(s.x,s.z,s.rawValid);
}
function placePointer(kind,e){
  if(!placing)return;
  if(kind==='down'){placeDrag=true;moveSeatTo(e.clientX,e.clientY);}
  else if(kind==='move'&&placeDrag){moveSeatTo(e.clientX,e.clientY);}
  else if(kind==='up'){placeDrag=false;}
}
function placementCamera(){
  const cam=world.cam;if(!cam)return;
  const {camera,controls}=cam;
  controls.enabled=false;controls.autoRotate=false;
  const c0=camera.position.clone(),t0=controls.target.clone();
  const p1=[0,13.6,18.4],t1=[0,.4,0];
  addTween(.7,p=>{const e=easeIO(p);
    camera.position.set(c0.x+(p1[0]-c0.x)*e,c0.y+(p1[1]-c0.y)*e,c0.z+(p1[2]-c0.z)*e);
    controls.target.set(t0.x+(t1[0]-t0.x)*e,t0.y+(t1[1]-t0.y)*e,t0.z+(t1[2]-t0.z)*e);
  });
}
function beginPlace(){
  const team=G.myColor||'red';
  placeTeam=team;
  const r=rigs[team];
  if(!r||!world.groundAt){runWalkIn();return;}
  placing=true;G.busy=true;
  setSeatPos(team,0,seats[team].z);
  r.person.visible=false;
  world.showGhost(0,seats[team].z,true);
  placementCamera();
  const cv=$('#gl');
  cv.addEventListener('pointerdown',pDown);
  window.addEventListener('pointermove',pMove);
  window.addEventListener('pointerup',pUp);
  show($('#seat-place'),true);
  $('#seat-place .sp-hint').textContent=G.mode==='hotseat'
    ?'Drag the Ember throne onto the lawn'
    :'Drag your throne onto the lawn';
  $('#b-seat-done').onclick=()=>{sfx.click();endPlace();};
}
function endPlace(){
  if(!placing)return;
  placing=false;placeDrag=false;
  const cv=$('#gl');
  cv.removeEventListener('pointerdown',pDown);
  window.removeEventListener('pointermove',pMove);
  window.removeEventListener('pointerup',pUp);
  world.hideGhost();
  show($('#seat-place'),false);
  const r=rigs[placeTeam];if(r)r.person.visible=true;
  runWalkIn();
}

function seatWalkIn(team){
  const r=rigs[team];
  if(!r)return Promise.resolve();
  const arc=.7*seats[team].side;
  return new Promise(res=>{
    r.person.position.set(0,0,WALK_FROM);
    r.setStand(1);r.setWalk(1);
    addTween(1.95,p=>{
      const e=easeIO(p);
      r.person.position.z=WALK_FROM+(WALK_TO-WALK_FROM)*e;
      r.person.position.x=Math.sin(p*Math.PI)*arc;
    },()=>{
      r.setWalk(0);
      addTween(.72,p=>{
        const e=easeIO(p);
        r.person.position.z=WALK_TO*(1-e);
        r.setStand(1-e);
      },()=>{
        r.person.position.set(0,0,0);r.setStand(0);r.setWalk(0);
        res();
      });
    });
  });
}

function openingCamera(dur){
  const cam=world.cam;
  if(!cam)return;
  const {camera,controls}=cam;
  controls.enabled=false;controls.autoRotate=false;
  const c0=camera.position.clone(),t0=controls.target.clone();
  const p1=[0,9.7,14],t1=[0,0,0];
  addTween(dur,p=>{
    const e=easeIO(p);
    camera.position.set(c0.x+(p1[0]-c0.x)*e,c0.y+(p1[1]-c0.y)*e,c0.z+(p1[2]-c0.z)*e);
    controls.target.set(t0.x+(t1[0]-t0.x)*e,t0.y+(t1[1]-t0.y)*e,t0.z+(t1[2]-t0.z)*e);
  },()=>{
    camera.position.set(p1[0],p1[1],p1[2]);
    controls.target.set(0,0,0);
    controls.enabled=true;
  });
}

function runWalkIn(){
  if(opening)return;opening=true;
  for(const t of['red','black']){const r=rigs[t];if(r){r.person.visible=true;r.setStand(0);r.setWalk(0);r.person.position.set(0,0,0);}}
  openingCamera(2.7);
  G.busy=true;
  toast('The duelists take their seats','good');
  Promise.all([seatWalkIn('red'),seatWalkIn('black')]).then(()=>{
    show($('#emote-bar'),true);
    G.busy=false;opening=false;
    armTurn();updateHUD();
    maybeAI();
  });
}

function enterMatch(){
  G.started=true;
  show($('#menu'),false);
  show($('#hud'),true);
  show($('#chat'),isOnline());
  show($('#result'),false);
  const hasClock=!!(G.clock&&G.clock.on);
  show($('#timer-wrap'),false);
  show($('#clocks'),hasClock);
  show($('#emote-bar'),false);
  show($('#wallet-chip'),true);
  show($('#btn-wager'),isOnline());
  show($('#btn-watch'),isOnline()&&SRV.ok&&!G.watchCode);
  refreshWallet();
  const btn=$('#b-rematch2');
  btn.textContent='Rematch';
  btn.onclick=doRematch;
  G.nextAction=null;
  refreshNames();
  if(world.refit)world.refit();
  beginPlace();
}

function sendChat(text){
  if(!text.trim())return;
  if(G.mode==='hotseat'){appendChat('sys',MYNAME,'(chat needs an online duel)');return;}
  if(!throttledChat(text))return;
  const sanitized=text.trim().replace(/[<>]/g,'');
  G.transport.send({t:'chat',name:MYNAME,text:sanitized});
  appendChat('me',MYNAME,sanitized);
}

/* ================= lobby ================= */

function newCode(){
  const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({length:4},()=>A[Math.random()*A.length|0]).join('');
}

function copyText(s){
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(s).then(()=>toast('Copied','good')).catch(()=>{});
}

function openLobby(html){
  show($('#lobby'),true);
  $('#lobby').innerHTML=html;
}

function fillThemeSelect(sel,cur){
  if(!sel)return;
  sel.innerHTML='';
  for(const id of THEME_IDS){
    const o=document.createElement('option');
    o.value=id;o.textContent=THEMES[id].name;
    if(id===cur)o.selected=true;
    sel.appendChild(o);
  }
}

function localLobby(){
  openLobby(`
    <h2>Same-Browser Tabs</h2>
    <p class="hint">Two tabs in this browser, one duel. Create a room here, then open a second tab of this page and join with the same code.</p>
    <label>Room code</label>
    <input type="text" id="lc-code" placeholder="e.g. K7QM" maxlength="8"/>
    <label>Room world (default for both duelists)</label>
    <select id="lb-theme"></select>
    ${tcSelect('lb-tc')}
    <div class="row">
      <button class="btn primary" id="lc-create">Create Room</button>
      <button class="btn" id="lc-join">Join Room</button>
    </div>
    <div class="status" id="lb-status"></div>`);
  fillThemeSelect($('#lb-theme'),world.currentTheme());
  $('#lc-create').onclick=()=>{
    const code=($('#lc-code').value.trim().toUpperCase())||newCode();
    $('#lc-code').value=code;
    roomTheme=$('#lb-theme').value;
    world.setTheme(roomTheme);
    G.clockId=$('#lb-tc').value;
    G.clock=new Clocks(G.clockId);
    G.clockInited=false;
    teardownNet();
    G.mode='host';G.myColor=GAME.RED;
    G.transport=new TabsTransport(code,onMessage);
    G.state=GAME.initialState();
    $('#lb-status').innerHTML='<span class="spinner"></span>Room <b>'+code+'</b> open. Open a second tab and join…';
  };
  $('#lc-join').onclick=()=>{
    const code=$('#lc-code').value.trim().toUpperCase();
    if(!code){$('#lb-status').textContent='Enter the host\u2019s room code first.';$('#lb-status').className='status err';return;}
    teardownNet();
    G.mode='guest';G.myColor=GAME.BLACK;
    G.transport=new TabsTransport(code,onMessage);
    G.transport.send({t:'hello'});
    $('#lb-status').innerHTML='<span class="spinner"></span>Joining room '+code+'…';
  };
}

function rtcLobby(){
  openLobby(`
    <h2>Online Duel — serverless WebRTC</h2>
    <p class="hint">No accounts, no servers. Exchange a one-time invite code with your opponent (paste into any chat app).</p>
    <label>Room world (default for both duelists)</label>
    <select id="rtc-theme"></select>
    ${tcSelect('rtc-tc')}
    <div class="row" style="margin-top:14px">
      <button class="btn primary" id="rtc-create">Create Invite</button>
      <button class="btn" id="rtc-haveinvite">I Have an Invite</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="rtc-link">Create Link Duel</button>
      <button class="btn" id="rtc-paste-link">Join by Link</button>
    </div>
    <div id="rtc-linkinfo" class="hidden">
      <label>Duel link — send it to your opponent</label>
      <input type="text" id="rtc-duelink" readonly/>
      <button class="btn tiny" id="rtc-copy-link">Copy link</button>
    </div>
    <div id="rtc-host" class="hidden">
      <label>1 — Send this invite to your opponent</label>
      <textarea id="rtc-offer" rows="3" readonly></textarea>
      <button class="btn tiny" id="rtc-copy-offer">Copy invite</button>
      <label>2 — Paste their answer, then connect</label>
      <textarea id="rtc-answer" rows="3" placeholder="Paste answer code…"></textarea>
      <button class="btn" id="rtc-finish">Connect</button>
    </div>
    <div id="rtc-join" class="hidden">
      <label>1 — Paste the invite you received</label>
      <textarea id="rtc-in" rows="3" placeholder="Paste invite code…"></textarea>
      <button class="btn primary" id="rtc-accept">Generate Answer</button>
      <label>2 — Send this answer back to the host</label>
      <textarea id="rtc-out" rows="3" readonly></textarea>
      <button class="btn tiny" id="rtc-copy-answer">Copy answer</button>
    </div>
    <div class="status" id="lb-status"></div>`);
  const status=(t,err)=>{const s=$('#lb-status');s.textContent='';s.innerHTML=t;s.className='status'+(err?' err':'');};
  let room=null;
  const BLOCK_HINT='Peer-to-peer seems blocked on this network. If it stays stuck, play via <b>Same-Browser Tabs</b> or swap roles/networks.';
  const watchLink=(r)=>{
    r.onState=st=>{
      if(st==='connecting')status('Negotiating link…');
      else if(st==='connected')status('Link established — entering duel…');
      else if(st==='failed')status('Direct link failed, relaying through TURN… ' + BLOCK_HINT,true);
      else if(st==='disconnected')status('Peer connection lost.',true);
    };
    setTimeout(()=>{
      if(!r.dc||r.dc.readyState!=='open'){
        status('Still connecting — relays can take up to 30s. If nothing happens, ' + BLOCK_HINT,true);
      }
    },20000);
  };
  fillThemeSelect($('#rtc-theme'),world.currentTheme());
  $('#rtc-haveinvite').onclick=()=>{
    sfx.click();
    show($('#rtc-join'),true);
    show($('#rtc-host'),false);
  };
  $('#rtc-create').onclick=async()=>{
    teardownNet();
    roomTheme=$('#rtc-theme').value||DEFAULT_THEME;
    world.setTheme(roomTheme);
    G.clockId=$('#rtc-tc').value;
    G.clock=new Clocks(G.clockId);
    G.clockInited=false;
    status('Generating invite (gathering network paths)…');
    room=new RTCRoom(onMessage);
    G.rtcWasHost=true;
    room.onOpen=()=>{
      G.mode='host';G.myColor=GAME.RED;
      G.state=GAME.initialState();
      G.transport.send({t:'who',uid:(SRV.me&&SRV.me.id)||null,name:MYNAME,handle:MYHANDLE});
    };
    G.transport=room;
    try{
      const code=await room.host();
      $('#rtc-offer').value=code;
      show($('#rtc-host'),true);
      show($('#rtc-join'),false);
      status('Send the invite code to your opponent, then paste their answer back.');
    }catch(e){status('Could not create invite: '+e.message,true);}
  };
  $('#rtc-copy-offer').onclick=()=>copyText($('#rtc-offer').value);
  $('#rtc-finish').onclick=async()=>{
    try{
      status('Connecting…');
      await room.acceptAnswer($('#rtc-answer').value);
      watchLink(room);
    }catch(e){status('Bad answer code: '+e.message,true);}
  };
  $('#rtc-accept').onclick=async()=>{
    teardownNet();
    try{
      room=new RTCRoom(onMessage);
      G.rtcWasHost=false;
      G.transport=room;
      room.onOpen=()=>{G.mode='guest';G.myColor=GAME.BLACK;G.transport.send({t:'hello'});G.transport.send({t:'who',uid:(SRV.me&&SRV.me.id)||null,name:MYNAME,handle:MYHANDLE});};
      watchLink(room);
      const ans=await room.acceptOffer($('#rtc-in').value);
      $('#rtc-out').value=ans;
      show($('#rtc-join'),true);
      show($('#rtc-host'),false);
      status('Paste the answer back to the host — the duel begins when they connect.');
    }catch(e){status('Bad invite code: '+e.message,true);}
  };
  $('#rtc-copy-answer').onclick=()=>copyText($('#rtc-out').value);
  $('#rtc-link').onclick=async()=>{
    if(!SRV.ok){toast('Link duels need the backend — start the ladder service');return;}
    teardownNet();
    roomTheme=$('#rtc-theme').value||DEFAULT_THEME;
    world.setTheme(roomTheme);
    G.clockId=$('#rtc-tc').value;
    G.clock=new Clocks(G.clockId);
    G.clockInited=false;
    status('Gathering network paths for the link\u2026');
    room=new RTCRoom(onMessage);
    G.rtcWasHost=true;
    room.onOpen=()=>{G.mode='host';G.myColor=GAME.RED;G.state=GAME.initialState();};
    G.transport=room;
    try{
      const offer=await room.host();
      const inv=await createInvite('duel',{name:MYNAME,theme:roomTheme,clock:G.clockId,offer});
      if(!inv.ok){status('Link failed: '+inv.why,true);return;}
      G.inviteCode=inv.code;
      $('#rtc-duelink').value=duelUrl(inv.code);
      show($('#rtc-linkinfo'),true);
      status('Send the link \u2014 the duel connects the moment they open it.');
      pollAnswer(room,inv.code,status,watchLink);
    }catch(e){status('Could not create link: '+e.message,true);}
  };
  $('#rtc-copy-link').onclick=()=>copyText($('#rtc-duelink').value);
  $('#rtc-paste-link').onclick=async()=>{
    const t=await askText('Join by link','Paste the duel link you received (or just the code).','http://\u2026 or CODE','Join');
    if(!t)return;
    const m=t.match(/[?&]duel=([A-Za-z0-9]+)/);
    joinByCode((m?m[1]:t).trim().toUpperCase());
  };
}

function duelUrl(code){return location.origin+location.pathname+'?duel='+code;}

async function pollAnswer(room,code,status,watch){
  for(let i=0;i<100;i++){
    await sleep(900);
    if(G.transport!==room)break;
    const row=await getInvite(code);
    if(!row||row.status==='done')break;
    if(row.answer){
      if(row.guest_uid)SRV.oppUid=row.guest_uid;
      status('Answer received \u2014 negotiating\u2026');
      try{await room.acceptAnswer(row.answer);}
      catch(e){status('Bad answer through link: '+e.message,true);return;}
      watch(room);
      await patchInvite(code,{status:'playing'});
      return;
    }
  }
  status('Link expired \u2014 create a fresh one.',true);
}

async function joinByCode(code){
  if(!SRV.ok){toast('Backend offline \u2014 cannot open the duel link');return;}
  teardownNet();
  const row=await getInvite(code);
  if(!row||row.kind!=='duel'){toast('No duel waits under that link','bad');return;}
  if(row.status!=='open'){toast('That duel already began or expired');return;}
  SRV.oppUid=row.host_uid;
  G.inviteCode=code;
  roomTheme=row.theme&&THEMES[row.theme]?row.theme:lsGet('ad-theme')||DEFAULT_THEME;
  world.setTheme(roomTheme);
  openLobby('<h2>Link duel</h2><div class="status"><span class="spinner"></span>Handshaking through the link\u2026</div><div class="status" id="lkst"></div>');
  const st=t=>{const s=$('#lkst');if(s){s.innerHTML=t;s.className='status';}};
  const r=new RTCRoom(onMessage);
  G.rtcWasHost=false;
  G.transport=r;
  r.onOpen=()=>{G.mode='guest';G.myColor=GAME.BLACK;G.transport.send({t:'hello'});G.transport.send({t:'who',uid:(SRV.me&&SRV.me.id)||null,name:MYNAME,handle:MYHANDLE});};
  r.onState=s2=>{
    if(s2==='connecting')st('Negotiating link\u2026');
    else if(s2==='connected')st('Link established \u2014 entering duel\u2026');
    else if(s2==='failed')st('Direct link failed \u2014 relaying through TURN\u2026',true);
    else if(s2==='disconnected')st('Peer connection lost.',true);
  };
  try{
    const ans=await r.acceptOffer(row.offer);
    await patchInvite(code,{answer:ans,status:'joined',guest_uid:SRV.me?SRV.me.id:null});
    st('Answer posted \u2014 establishing the link\u2026');
  }catch(e){st('Bad invite: '+e.message,true);}
}

function teardownNet(){
  clearTimeout(G.aiTimer);
  presStop();
  if(G.transport){try{G.transport.close();}catch(e){}}
  G.transport=null;G.mode=null;G.myColor=null;G.peerSeen=false;
  G.duelId=null;G._stakeWait=false;G.wagerN=0;
  G.gv=null;G.blazing=false;G.record=[];G.wagerN=0;G.pz=null;
  G.behind=false;G.deficit=0;
  G.watchNames=null;OPPNAME=null;
  show($('#mode-banner'),false);
  show($('#btn-wager'),false);
  show($('#btn-watch'),false);
}

function tcSelect(id,cur){
  let h='<label>Time control</label><select id="'+id+'">';
  for(const[k,c]of Object.entries(CONTROLS))
    h+='<option value="'+k+'"'+(k===(cur||'none')?' selected':'')+'>'+c.name+'</option>';
  return h+'</select>';
}

/* ================= hotseat ================= */

function fogToggle(id){
  return `<label class="fog-opt"><input type="checkbox" id="${id}"/> <span>Fog of War</span> <em>— hidden information: each side only sees the squares its own scouts touch. Pass &amp; Play or solo vs Storm.</em></label>`;
}

function startHotseat(tcId,fog){
  teardownNet();
  G.clockId=tcId||'none';
  G.clock=new Clocks(G.clockId);
  G.clockInited=false;
  G.mode='hotseat';G.myColor=null;
  G.fog=!!fog;
  G.state=GAME.initialState();
  G.started=true;
  enterMatch();
  renderBoard(true);
  refreshMoves();
  updateHUD();
}

function hotseatLobby(){
  openLobby('<h2>Pass &amp; Play</h2><p class="hint">Two duelists, one device. Optional clock keeps the pace honest.</p>'+tcSelect('hs-tc')+fogToggle('hs-fog')+'<div class="row"><button class="btn primary" id="hs-go">Start Duel</button></div>');
  $('#hs-go').onclick=()=>{sfx.click();startHotseat($('#hs-tc').value,$('#hs-fog').checked);};
}

/* ================= AI duel ================= */

function maybeAI(){
  if(G.mode!=='ai'||!G.started||G.over||G.busy||!G.state)return;
  if(G.state.turn!==GAME.BLACK)return;
  clearTimeout(G.aiTimer);
  G.aiTimer=setTimeout(()=>{
    if(G.mode!=='ai'||G.over||G.busy||G.state.turn!==GAME.BLACK)return;
    qkReset();
    const mv=chooseMove(G.state,G.aiLevel,G.qk?{forceSlip:G.qk.armed&&!G.qk.slipSeen&&G.qk.myMoves>=G.qk.slipAt}:undefined);
    if(G.qk&&QK.lastSlip){
      G.qk.slipSeen=true;
      G.qk.armed=false;
      const s=qkState();
      s.armed=false;
      qkSave(s);
      toast('QUANTKING LETS HIS GUARD DOWN!','good');
      showTaunt(aiTaunt('titan','slip'));
    }
    if(mv)playMove(mv);
  },520+Math.random()*560);
}

function aiLobby(){
  openLobby(`
    <h2>Play vs Storm</h2>
    <p class="hint">Challenge the island's own golem. You lead as Ember; the machine answers as Frost.</p>
    <label>Difficulty</label>
    <div class="row">
      <button class="btn lv" data-lv="easy">${LEVEL_NAMES.easy}</button>
      <button class="btn lv" data-lv="medium">${LEVEL_NAMES.medium}</button>
      <button class="btn lv" data-lv="hard">${LEVEL_NAMES.hard}</button>
      <button class="btn lv" data-lv="master">${LEVEL_NAMES.master}</button>
    </div>
    ${tcSelect('ai-tc')}
    ${fogToggle('ai-fog')}
    <div class="status">Squire is forgiving. Storm Monarch is not. Each duelist has a mind of their own.</div>`);
  $('#lobby').querySelectorAll('.lv').forEach(b=>b.onclick=()=>{sfx.click();startAI(b.dataset.lv,$('#ai-tc').value,$('#ai-fog').checked);});
}

function startAI(level,tcId,fog){
  teardownNet();
  G.mode='ai';G.myColor=GAME.RED;G.aiLevel=level;
  G.fog=!!fog;
  G.clockId=tcId||'none';
  G.clock=new Clocks(G.clockId);
  G.clockInited=false;
  G.persona=PERSONAS[level]||null;
  G.state=GAME.initialState();
  G.over=false;G.busy=false;
  $('#log').innerHTML='';
  world.showLastMove(null);
  enterMatch();
  renderBoard(true);
  refreshMoves();
  updateHUD();
  toast(`Duel vs ${LEVEL_NAMES[level]} \u2014 you are Ember`,'good');
  if(G.persona)setTimeout(()=>showTaunt(G.persona.start),800);
}

/* ================= correspondence duels ================= */

function corrClose(){show($('#lobby'),false);if(!G.started)show($('#menu'),true);}

async function corrMenu(){
  await srvInit();
  openLobby('<h2>Correspondence</h2><div class="status">Loading…</div>');
  if(!SRV.ok){
    $('#lobby').innerHTML='<h2>Correspondence</h2><p class="hint">The backend is offline right now, so long-form duels are unavailable. Play solo or pass-and-play meanwhile.</p><div class="row"><button class="btn" id="corr-close">Close</button></div>';
    $('#corr-close').onclick=()=>{sfx.click();corrClose();};
    return;
  }
  if(!SRV.me){
    $('#lobby').innerHTML='<h2>Correspondence</h2><p class="hint">Sign in from the menu (Account) to challenge rivals and pick your duels up on any device.</p><div class="row"><button class="btn primary" id="corr-close">Close</button></div>';
    $('#corr-close').onclick=()=>{sfx.click();corrClose();};
    return;
  }
  renderCorr();
}

function corrCard(g){
  const you=g.my_turn?'<span class="corr-badge">your move</span>':'';
  const watch=g.last_seq>0?`<button class="btn small" data-corr="watch" data-id="${g.id}">Watch</button> `:'';
  let btns='';
  if(g.status==='pending'&&g.me_side==='guest')
    btns=`<button class="btn primary" data-corr="accept" data-id="${g.id}">Accept</button> <button class="btn" data-corr="decline" data-id="${g.id}">Decline</button>`;
  else if(g.status==='active')
    btns=`${watch}<button class="btn ${g.my_turn?'primary':''}" data-corr="open" data-id="${g.id}">${g.my_turn?'Make your move':'Resume'}</button>`;
  else
    btns=`${watch}<button class="btn" data-corr="open" data-id="${g.id}">View result</button>`;
  const label=g.status==='pending'?'invitation':(g.status==='active'?'live':'finished');
  return `<div class="corr-row"><div class="corr-info"><b>${esc(g.opp_name)}</b> <span class="corr-tag">${label}</span>${you}</div><div class="corr-act">${btns}</div></div>`;
}

async function renderCorr(){
  const res=await corrList();
  const games=(res&&res.games)||[];
  let html='<h2>Correspondence</h2><p class="hint">Long-form duels — trade a move whenever you like, from any device. As host you play Ember (Red) and move first.</p>';
  html+='<div class="corr-new"><label>Challenge a rival by handle</label><div class="row"><input type="text" id="corr-handle" placeholder="their handle" maxlength="18"/><button class="btn" id="corr-send">Send</button></div></div>';
  html+='<div class="corr-list">'+(games.length?games.map(corrCard).join(''):'<div class="status">No correspondence duels yet — send the first challenge.</div>')+'</div>';
  html+='<div class="row"><button class="btn" id="corr-close">Close</button></div>';
  $('#lobby').innerHTML=html;
  bindCorrList();
}

function bindCorrList(){
  const send=$('#corr-send');
  if(send)send.onclick=async()=>{
    const h=($('#corr-handle').value||'').trim();
    if(!h)return;
    send.disabled=true;send.textContent='…';
    const p=await findHandle(h);
    if(!p){toast('No player named '+h,'bad');send.disabled=false;send.textContent='Send';return;}
    const r=await corrCreate(p.uid,world.currentTheme?world.currentTheme():null);
    if(r.ok){toast('Challenge sent to '+p.handle,'good');renderCorr();}
    else{toast(r.why||'Could not send challenge','bad');send.disabled=false;send.textContent='Send';}
  };
  for(const b of $('#lobby').querySelectorAll('[data-corr]')){
    b.onclick=()=>{
      const id=+b.dataset.id,act=b.dataset.corr;
      if(act==='accept'){b.disabled=true;corrJoin(id).then(r=>{if(r.ok){toast('Duel accepted','good');openCorr(id);}else{toast(r.why||'failed','bad');b.disabled=false;}});}
      else if(act==='decline'){b.disabled=true;corrDecline(id).then(()=>renderCorr());}
      else if(act==='open')openCorr(id);
      else if(act==='watch')watchCorr(id);
    };
  }
  const c=$('#corr-close');if(c)c.onclick=()=>{sfx.click();corrClose();};
}

async function openCorr(id){
  const g=await corrGame(id);
  if(!g){toast('Could not load that duel','bad');return;}
  show($('#lobby'),false);
  startCorr(g);
}

async function watchCorr(id){
  const g=await corrGame(id);
  if(!g||!g.moves||!g.moves.length){toast('Nothing to replay yet','bad');return;}
  const moves=g.moves.map(m=>m.move);
  const started=openViewer(GAME,world,buildCode(moves,0,'corr'),()=>{if(G.started&&G.state){show($('#hud'),true);renderBoard();}else show($('#menu'),true);});
  if(!started)toast('Could not start the replay','bad');
}

function startCorr(g){
  teardownNet();
  const s=corrState(g);
  G.mode='corr';G.myColor=s.myColor;G.corrId=g.id;
  G.clock=null;G.clockId='none';G.clockInited=false;
  G.state=s.state;G.over=s.over;G.busy=false;G.record=[];
  $('#log').innerHTML='';
  world.showLastMove(null);
  if(g.theme&&THEMES&&THEMES[g.theme]){world.setTheme(g.theme);roomTheme=g.theme;try{lsSet('ad-theme',g.theme);}catch(e){}}
  show($('#result'),false);
  enterMatch();
  renderBoard(true);
  refreshMoves();
  updateHUD();
  if(s.over)endGame(s.winner,false);
  else if(!s.myTurn)toast('Waiting for '+s.oppName+' to reply — check back any time','good');
  else toast('Your move, '+G.dispName[G.myColor],'good');
}

/* ================= leaderboards ================= */

let boardsTab='corr';
function boardRow(a,b){return `<div class="corr-row"><div class="corr-info">${a}</div><div class="corr-act"><span class="corr-tag">${b}</span></div></div>`;}
async function boardsMenu(tab){boardsTab=tab||boardsTab;await srvInit();openLobby('<h2>Leaderboards</h2><div class="status">Loading…</div>');renderBoards();}
async function renderBoards(){
  const tabs=[['elo','Ladder'],['wr','Win rate'],['corr','Correspondence'],['fast','Quickest wins'],['long','Longest duels']];
  const nav=tabs.map(t=>`<button class="btn small ${t[0]===boardsTab?'primary':''}" data-board="${t[0]}">${t[1]}</button>`).join(' ');
  let body='<div class="status">Loading…</div>';
  try{
    if(boardsTab==='elo'){const rows=await authLadder(50);body=rows.map((r,i)=>boardRow(`<b>${i+1}. ${esc(r.handle)}</b>`,`${r.elo} · ${r.wins}-${r.losses}`)).join('')||'<div class="status">The ladder is empty.</div>';}
    else if(boardsTab==='wr'){const rows=await ladderWinrate();body=rows.map(r=>boardRow(`<b>${esc(r.handle)}</b>`,`${r.winrate}% · ${r.wins}-${r.losses}`)).join('')||'<div class="status">No qualified duelists yet (min 3 rated games).</div>';}
    else if(boardsTab==='corr'){const rows=await corrStandings();body=rows.map(r=>boardRow(`<b>${esc(r.handle)}</b>`,`${r.wins}W · ${r.played} played · ${r.winrate==null?'—':r.winrate+'%'}`)).join('')||'<div class="status">No finished correspondence duels yet.</div>';}
    else if(boardsTab==='fast'){const rows=await corrQuickest();body=rows.map(r=>boardRow(`<b>${esc(r.winner_name)}</b> <span class="corr-tag">over ${esc(r.host_name===r.winner_name?r.guest_name:r.host_name)}</span>`,`${r.moves} moves`)).join('')||'<div class="status">No decisive correspondence wins yet.</div>';}
    else{const rows=await corrLongest();body=rows.map(r=>boardRow(`<b>${esc(r.host_name)}</b> <span class="corr-tag">vs</span> <b>${esc(r.guest_name)}</b>`,`${r.moves} moves`)).join('')||'<div class="status">No finished duels yet.</div>';}
  }catch(e){body='<div class="status">Board unavailable right now.</div>';}
  $('#lobby').innerHTML=`<h2>Leaderboards</h2><div class="board-tabs">${nav}</div><div class="corr-list">${body}</div><div class="row"><button class="btn" id="bd-close">Close</button></div>`;
  for(const b of $('#lobby').querySelectorAll('[data-board]'))b.onclick=()=>{sfx.click();boardsTab=b.dataset.board;renderBoards();};
  const c=$('#bd-close');if(c)c.onclick=()=>{sfx.click();corrClose();};
}

/* ================= spectator betting on ranked duels ================= */

let betsTab='open';
async function betsMenu(tab){betsTab=tab||betsTab;await srvInit();openLobby('<h2>Ranked Betting</h2><div class="status">Loading…</div>');renderBets();}
async function renderBets(){
  const me=SRV.ok&&SRV.me;
  const bal=me?(await stakeBalance()):null;
  const tabs=[['open','Live duels'],['mine','My bets']];
  const nav=tabs.map(t=>`<button class="btn small ${t[0]===betsTab?'primary':''}" data-bets="${t[0]}">${t[1]}</button>`).join(' ');
  const hdr='<h2>Ranked Betting</h2><div class="board-tabs">'+nav+'</div>'
    +'<div class="status">'+(me?('Stake balance <b>stk '+(bal==null?0:bal)+'</b> · pari-mutuel: winners split the losing pool; the payout lands once both players attest the result.'):'Sign in to place bets. The live board is public.')+' <button class="btn small" id="bet-claim">Claim daily stakes</button></div>';
  let body='<div class="status">Loading…</div>';
  try{
    if(betsTab==='mine'){
      if(!me)body='<div class="status">Sign in to see your bets.</div>';
      else{const rows=await betMine();body=rows.map(r=>{const side=r.pick==='a'?r.a_handle:r.b_handle;
        const tag=r.status==='won'?('won stk '+r.payout):r.status==='lost'?'lost':r.status==='refunded'?'refunded':'open';
        return boardRow(`<b>${esc(r.a_handle)} vs ${esc(r.b_handle)}</b> <span class="corr-tag">on ${esc(side)}</span>`,`stk ${r.stake} · ${tag}`);}).join('')||'<div class="status">No bets yet.</div>';}
    }else{
      const rows=await duelsOpen();
      body=rows.map(d=>{const act=me
        ?`<div class="corr-act"><button class="btn small" data-bet="${d.id}" data-pick="a">Back ${esc(d.a_handle)} (${d.pool_a})</button> <button class="btn small" data-bet="${d.id}" data-pick="b">Back ${esc(d.b_handle)} (${d.pool_b})</button></div>`
        :`<div class="corr-act"><span class="corr-tag">pool ${d.pool_a} / ${d.pool_b}</span></div>`;
        return `<div class="corr-row"><div class="corr-info"><b>${esc(d.a_handle)} vs ${esc(d.b_handle)}</b><div class="corr-meta">duel stake stk ${d.stake} · pools ${d.pool_a} / ${d.pool_b}</div></div>${act}</div>`;
      }).join('')||'<div class="status">No live ranked duels right now. Wagered duels appear here so spectators can bet on the outcome.</div>';
    }
  }catch(e){body='<div class="status">Betting board unavailable right now.</div>';}
  $('#lobby').innerHTML=hdr+`<div class="corr-list">${body}</div><div class="row"><button class="btn" id="bet-close">Close</button></div>`;
  for(const b of $('#lobby').querySelectorAll('[data-bets]'))b.onclick=()=>{sfx.click();betsTab=b.dataset.bets;renderBets();};
  for(const b of $('#lobby').querySelectorAll('[data-bet]'))b.onclick=async()=>{sfx.click();
    const id=+b.dataset.bet,pick=b.dataset.pick;
    const n=parseInt(await askText('Place a bet','Pari-mutuel escrow: paid only if your pick wins the two-party-verified result. (1–50000)','25','Bet'),10);
    if(!(n>=1&&n<=50000)){toast('Bet must be 1–50000');return;}
    const res=await betPlace(id,pick,n);
    if(res&&res.ok){toast('Bet placed · stk '+n);renderBets();}else if(res&&res.why)toast(res.why);
  };
  const cl=$('#bet-claim');if(cl)cl.onclick=async()=>{sfx.click();const r=await stakeClaimDaily();if(r&&r.ok)toast('Daily stakes claimed');else if(r&&r.why)toast(r.why);renderBets();};
  const c=$('#bet-close');if(c)c.onclick=()=>{sfx.click();corrClose();};
}

/* ================= rivals / follow graph ================= */

async function rivalsMenu(){
  await srvInit();
  openLobby('<h2>Rivals</h2><div class="status">Loading…</div>');
  if(!SRV.ok||!SRV.me){
    $('#lobby').innerHTML='<h2>Rivals</h2><p class="hint">'+(SRV.ok?'Sign in from the menu (Account) to track rivals and friends.':'The backend is offline right now.')+'</p><div class="row"><button class="btn primary" id="rv-close">Close</button></div>';
    $('#rv-close').onclick=()=>{sfx.click();corrClose();};return;
  }
  renderRivals();
}
function rivalRow(r){
  const rel=r.mutual?'mutual':(r.i_follow?'you follow':(r.follows_me?'follows you':''));
  const relTag=rel?`<span class="corr-tag">${rel}</span>`:'';
  const unf=r.i_follow?`<button class="btn small" data-rv="unfollow" data-uid="${r.uid}">Unfollow</button>`:'';
  const ch=r.follows_me?`<button class="btn small primary" data-rv="challenge" data-uid="${r.uid}">Challenge</button>`:'';
  return `<div class="corr-row"><div class="corr-info"><b>${esc(r.handle)}</b> <span class="corr-tag">${r.elo}</span>${relTag}${r.follows_me?'<span class="corr-badge">follows you</span>':''}</div><div class="corr-act">${ch}${unf}</div></div>`;
}
async function renderRivals(){
  const res=await rivals();
  const list=(res&&res.rivals)||[];
  let html='<h2>Rivals</h2><p class="hint">Follow duelists to keep them close, and challenge a mutual to a correspondence duel.</p>';
  html+='<div class="corr-new"><label>Follow a duelist by handle</label><div class="row"><input type="text" id="rv-handle" placeholder="their handle" maxlength="18"/><button class="btn" id="rv-follow">Follow</button></div></div>';
  html+='<div class="corr-list">'+(list.length?list.map(rivalRow).join(''):'<div class="status">You are not tracking anyone yet.</div>')+'</div>';
  html+='<div class="row"><button class="btn" id="rv-close">Close</button></div>';
  $('#lobby').innerHTML=html;
  bindRivals();
}
function bindRivals(){
  const f=$('#rv-follow');
  if(f)f.onclick=async()=>{
    const h=($('#rv-handle').value||'').trim();if(!h)return;
    f.disabled=true;const p=await findHandle(h);
    if(!p){toast('No player named '+h,'bad');f.disabled=false;return;}
    const r=await follow(p.uid);
    if(r.ok){toast('Following '+p.handle,'good');renderRivals();}else{toast(r.why||'failed','bad');f.disabled=false;}
  };
  for(const b of $('#lobby').querySelectorAll('[data-rv]')){
    b.onclick=async()=>{
      const uid=b.dataset.uid,act=b.dataset.rv;
      if(act==='unfollow'){b.disabled=true;await unfollow(uid);renderRivals();}
      else if(act==='challenge'){b.disabled=true;const r=await corrCreate(uid,world.currentTheme?world.currentTheme():null);toast(r.ok?'Challenge sent — open Correspondence to track it':(r.why||'failed'),r.ok?'good':'bad');b.disabled=false;}
    };
  }
  const c=$('#rv-close');if(c)c.onclick=()=>{sfx.click();corrClose();};
}

/* ================= QuantKing — beat the machine, earn the points ================= */

const QK_STORE='ad-qk';
function qkState(){
  try{return {losses:0,wins:0,best:0,armed:false,...JSON.parse(localStorage.getItem(QK_STORE)||'{}')};}
  catch(e){return {losses:0,wins:0,best:0,armed:false};}
}
function qkSave(s){try{localStorage.setItem(QK_STORE,JSON.stringify(s));}catch(e){}}

function quantLobby(){
  const s=qkState();
  openLobby(`
    <h2 style="color:var(--gold)">THE QUANTKING</h2>
    <p class="hint"><b>Want to earn free points? Beat QuantKing in a one-on-one match.</b><br/>
    He is the king of checkers \u2014 he has solved this game a million times over and wins his duels the way storms win arguments.
    But pride is a crack in every theorem: the further he pulls ahead, the more carelessly he flings his crown around.
    Puncture him early, drag him deep, and when his guard finally drops \u2014 strike. The purse is real.</p>
    <div class="shop-grid" style="margin:12px 0">
      <div class="shop-card"><h4>Draw blood</h4><div class="desc">Every piece you tear from the Titan (first 15)</div><div class="price">+2 pts</div></div>
      <div class="shop-card"><h4>Survive 12 moves</h4><div class="desc">Still standing at move twelve</div><div class="price">+10 pts</div></div>
      <div class="shop-card"><h4>Survive 25 moves</h4><div class="desc">The crowd starts chanting</div><div class="price">+25 pts</div></div>
      <div class="shop-card"><h4>THE THRONE</h4><div class="desc">Beat QuantKing outright \u2014 plus +250 the first time each day</div><div class="price">+500 pts</div></div>
    </div>
    <div class="status">Record \u2014 <b style="color:var(--gold)">${s.wins}</b> W / ${s.losses} L${s.armed?' \u00B7 <b style="color:var(--gold)">he underestimates you \u2014 his guard WILL drop this duel</b>':' \u00B7 every 4 losses he grows arrogant: his next duel guarantees one slip'}</div>
    <div class="row"><button class="btn primary" id="qk-go">Sit at the Board</button><button class="btn" id="qk-back">Back</button></div>`);
  $('#qk-back').onclick=()=>{sfx.click();show($('#lobby'),false);};
  $('#qk-go').onclick=()=>{sfx.click();startQuant();};
}

function startQuant(){
  teardownNet();
  const s=qkState();
  G.mode='ai';G.myColor=GAME.RED;G.aiLevel='titan';
  G.clockId='none';
  G.clock=new Clocks('none');
  G.clockInited=false;
  G.persona=PERSONAS.titan;
  G.qk={caps:0,myMoves:0,m12:false,m25:false,pts:0,armed:!!s.armed,slipSeen:false,slipAt:6+(Math.random()*10|0)};
  G.state=GAME.initialState();
  G.over=false;G.busy=false;
  $('#log').innerHTML='';
  world.showLastMove(null);
  enterMatch();
  renderBoard(true);
  refreshMoves();
  updateHUD();
  showModeBanner('THE QUANTKING \u00B7 beat him, take 500 pts');
  if(s.armed)toast('He underestimates you \u2014 his guard will drop this duel','good');
  setTimeout(()=>showTaunt(PERSONAS.titan.start),900);
}

function quantMoveHook(color,move){
  if(!G.qk||G.state.winner)return;
  if(color!==GAME.RED)return;
  if(move.captures.length&&G.qk.caps<15){
    const n=Math.min(move.captures.length,15-G.qk.caps);
    ECO.addCoins(n,'qk-blood');
    G.qk.pts+=n;
    refreshWallet();
    toast('+'+n+' pts \u00B7 a splinter from the Titan','good');
  }
  G.qk.caps+=move.captures.length;
  G.qk.myMoves++;
  if(!G.qk.m12&&G.qk.myMoves>=12){
    G.qk.m12=true;ECO.addCoins(10,'qk-12');G.qk.pts+=10;refreshWallet();
    toast('+10 pts \u00B7 twelve moves survived','good');
  }
  if(!G.qk.m25&&G.qk.myMoves>=25){
    G.qk.m25=true;ECO.addCoins(25,'qk-25');G.qk.pts+=25;refreshWallet();
    toast('+25 pts \u00B7 they are chanting your name','good');
  }
}

function quantEnd(winnerColor){
  const s=qkState();
  const won=winnerColor===GAME.RED;
  const btn=$('#b-rematch2');
  btn.textContent='Another Duel';
  btn.onclick=()=>{sfx.click();show($('#result'),false);quantLobby();};
  const earned=G.qk.pts;
  G.qk=null;
  if(won){
    let purse=500;
    let bonus='';
    if(ECO.dailyOnce('qkwin',()=>{})){purse+=250;bonus=' \u00B7 +250 for the first fall of the day!';}
    ECO.addCoins(purse,'qk-win');
    if(!unlocked('clockwork')){
      ECO.grantItem('clockwork','titan-slayer');
      setTimeout(()=>toast('First Titan slain \u2014 Clockwork Brass armor unlocked free!','good'),1200);
    }
    s.wins++;
    s.best=Math.max(s.best||0,earned+purse);
    s.armed=false;
    qkSave(s);
    refreshWallet();
    $('#result-title').textContent='THE TITAN FALLS';
    $('#result-sub').textContent='+'+(earned+purse)+' points this duel'+bonus+' \u2014 the Marketplace bows to you, Titan-Slayer.';
  }else{
    ECO.addCoins(5,'qk-consolation');
    s.losses++;
    if(s.losses%4===0)s.armed=true;
    qkSave(s);
    refreshWallet();
    $('#result-title').textContent='THE TITAN PREVAILS';
    $('#result-sub').textContent=(s.armed
      ?'Four losses \u2014 his pride swells. Next duel, his guard WILL drop. Strike then. '
      :'So close is a country you now live in. He keeps the crown; you keep +'+(earned+5)+' points. Crowns are also for sale in the Marketplace. ')+
      'Wins: '+s.wins+' \u00B7 losses: '+s.losses;
  }
}

/* ================= UI wiring ================= */

$('#b-hotseat').onclick=()=>{sfx.click();hotseatLobby();};
$('#b-ai').onclick=()=>{sfx.click();aiLobby();};
$('#b-quant').onclick=()=>{sfx.click();quantLobby();};
$('#b-online').onclick=()=>{sfx.click();rtcLobby();};
$('#b-local').onclick=()=>{sfx.click();localLobby();};
$('#b-corr').onclick=()=>{sfx.click();corrMenu();};
$('#b-howto').onclick=()=>{sfx.click();show($('#menu'),false);show($('#howto'),true);};
$('#b-howto-close').onclick=()=>{sfx.click();show($('#howto'),false);show($('#menu'),true);};
$('#btn-quit').onclick=()=>location.reload();
$('#btn-sound').onclick=e=>{
  const on=!sfx.enabled;
  sfx.setEnabled(on);
  e.target.textContent=on?'♪':'✕';
  e.target.style.opacity=on?1:.5;
};
$('#btn-theme-mode').onclick=()=>{
  toggleTheme();
  const current=localStorage.getItem('ad-theme-mode')||'dark';
  $('#btn-theme-mode').textContent=current==='dark'?'🌗':'☀';
};
$('#btn-resign').onclick=()=>{
  if(!G.started||G.over)return;
  sfx.click();
  if(G.mode==='corr'){
    if(G.state.turn!==G.myColor){toast('You can only resign on your own turn','bad');return;}
    const opp=G.myColor===GAME.RED?GAME.BLACK:GAME.RED;
    clearTimeout(G.aiTimer);
    G.state={...G.state,winner:opp};G.over=true;endGame(opp,true);
    if(G.corrId)corrResign(G.corrId).then(r=>{if(!r.ok)toast('Resignation not saved ('+(r.why||'')+')','bad');});
    corrMenu();
    return;
  }
  const winner=isOnline()||G.mode==='ai'
    ?(G.myColor===GAME.RED?GAME.BLACK:GAME.RED)
    :(G.state.turn===GAME.RED?GAME.BLACK:GAME.RED);
  if(isOnline())G.transport.send({t:'resign'});
  clearTimeout(G.aiTimer);
  G.state={...G.state,winner};
  endGame(winner,true);
};
function doRematch(){
  sfx.click();
  if(G.mode==='guest'){
    G.transport.send({t:'rematch-req'});
    toast('Rematch requested…');
  }else resetMatch();
}
$('#btn-rematch').onclick=doRematch;
$('#b-rematch2').onclick=doRematch;
$('#b-back').onclick=()=>location.reload();
$('#auth-form').onsubmit=e=>{
  e.preventDefault();
  sfx.click();
  authDo(authSignIn);
};
$('#chat-form').onsubmit=e=>{
  e.preventDefault();
  sendChat($('#chat-input').value);
  $('#chat-input').value='';
};

/* worlds picker */
function openThemes(){
  const g=$('#theme-grid');
  g.innerHTML='';
  const cur=world.currentTheme();
  for(const id of THEME_IDS){
    const t=THEMES[id];
    const packId='theme:'+id;
    const pack=THEMEPACKS[id];
    const locked=pack&&!unlocked(packId);
    const b=document.createElement('button');
    b.className='th-btn'+(id===cur?' on':'')+(locked?' locked':'');
    const sw=document.createElement('div');
    sw.className='th-sw';
    sw.style.background=`linear-gradient(90deg,${t.sky[1]},${t.sky[2]},${t.sky[3]})`;
    b.appendChild(sw);
    b.appendChild(document.createTextNode(t.name+(locked?' 🔒':'')));
    b.onclick=()=>{
      if(locked){
        toast(`${t.name} is a locked realm — find it in the Marketplace`,'bad');
        openShop('Realms');
        show($('#themes'),false);
        return;
      }
      world.setTheme(id);
      lsSet('ad-theme',id);
      toast(`${t.name} envelops you`,'good');
      g.querySelectorAll('.th-btn').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
    };
    g.appendChild(b);
  }
  show($('#themes'),true);
}
$('#btn-theme').onclick=()=>{sfx.click();openThemes();};
$('#b-themes-close').onclick=()=>{sfx.click();show($('#themes'),false);};

/* ================= clocks & turn timers ================= */

function armTurn(){
  G.turnMoves=G.state?G.state.moveNo:0;
  G.lastTick=0;
  G.turnLen=G.blazing?BLAZING_MS:TURN_MS;
  updateMoveHud();
  if(G.clock&&G.clock.on){G.turnEnd=null;return;}
  G.turnEnd=performance.now()+G.turnLen;
}

world.onFrame(dt=>{
  if(!G.started||G.over||!G.state)return;
  if(G.clock&&G.clock.on){
    if(!G.clockInited){G.clock.init();G.clockInited=true;}
    G.clock.side=G.state.turn;
    G.clock.paused=G.busy;
    const flag=G.clock.tick(dt);
    const er=$('#clk-red'),eb=$('#clk-black');
    er.textContent=G.clock.fmt('red');
    eb.textContent=G.clock.fmt('black');
    er.classList.toggle('live',G.state.turn==='red'&&!G.busy);
    eb.classList.toggle('live',G.state.turn==='black'&&!G.busy);
    const side=G.state.turn;
    const low=G.clock.t[side]<10;
    er.classList.toggle('low',side==='red'&&low);
    eb.classList.toggle('low',side==='black'&&low);
    if(low&&G.clock.beepSecond(Math.ceil(G.clock.t[side]))&&G.mode!=='guest')sfx.tick();
    if(flag)flagFall(flag);
    show($('#timer-wrap'),false);show($('#timer-secs'),false);
    return;
  }
  /* per-move turn clock — re-armed every time the move number changes */
  if(G.turnMoves!==G.state.moveNo){G.turnMoves=G.state.moveNo;G.turnEnd=performance.now()+G.turnLen;G.lastTick=0;}
  if(!G.turnEnd){show($('#timer-wrap'),false);setTimerSecs(0);return;}
  if(G.busy)G.turnEnd+=dt*1000;   // freeze during the walk-in, move animations & inspection
  const left=G.turnEnd-performance.now();
  show($('#timer-wrap'),true);
  const bar=$('#timer-bar');
  bar.style.width=Math.max(0,Math.min(1,left/G.turnLen)*100)+'%';
  bar.classList.toggle('low',left<10000);
  const secs=Math.max(0,Math.ceil(left/1000));
  setTimerSecs(secs);
  if(secs<=5&&secs>0&&secs!==G.lastTick){G.lastTick=secs;if(G.mode!=='guest')sfx.tick();}
  if(left<=0&&!G.busy){
    if(localMoverOk()){
      const opts=GAME.legalMoves(G.state);
      if(opts.length){toast('Turn timer \u2014 auto-moving','bad');playMove(opts[Math.random()*opts.length|0]);}
      else G.turnEnd=null;
    }else{
      G.turnEnd=performance.now()+G.turnLen;   // remote/AI is to move — keep counting, never auto-move for them
    }
  }
});

function flagFall(side){
  const moverOk=G.mode==='hotseat'||G.mode==='ai'||G.mode==='host';
  if(!moverOk)return;
  const winner=side==='red'?GAME.BLACK:GAME.RED;
  toast((side==='red'?'Ember':'Frost')+' let the hourglass run dry','bad');
  sfx.lose();
  G.state={...G.state,winner};
  if(isOnline()&&G.mode==='host')G.transport.send({t:'state',state:G.state});
  endGame(winner,false);
}

/* ================= taunt bubble ================= */

let tauntTimer=0;
function showTaunt(text){
  if(!text)return;
  const el=$('#taunt');
  el.textContent=text;
  show(el,true);
  clearTimeout(tauntTimer);
  tauntTimer=setTimeout(()=>show(el,false),3400);
}

/* ================= dialogs ================= */

function askText(title,sub,placeholder,okLabel){
  return new Promise(res=>{
    $('#dlg-title').textContent=title;
    $('#dlg-sub').textContent=sub;
    const inp=$('#dlg-input');
    inp.value='';
    inp.placeholder=placeholder||'Paste here…';
    inp.classList.remove('hidden');
    $('#dlg-ok').textContent=okLabel||'Go';
    show($('#dialog'),true);
    $('#dlg-ok').onclick=()=>{show($('#dialog'),false);res(inp.value.trim());};
    $('#dlg-cancel').onclick=()=>{show($('#dialog'),false);res(null);};
  });
}
function confirmBox(title,sub){
  return new Promise(res=>{
    $('#dlg-title').textContent=title;
    $('#dlg-sub').textContent=sub;
    $('#dlg-input').classList.add('hidden');
    $('#dlg-ok').textContent='Accept';
    show($('#dialog'),true);
    $('#dlg-ok').onclick=()=>{show($('#dialog'),false);res(true);};
    $('#dlg-cancel').onclick=()=>{show($('#dialog'),false);res(false);};
  });
}

/* ================= wagers ================= */

function canServerStake(){return isOnline()&&SRV.ok&&SRV.me&&SRV.oppUid&&SRV.oppUid!==SRV.me.id;}

async function proposeWager(){
  if(!isOnline()){toast('Wagers need an online duel');return;}
  if(G.wagerN>0||G.duelId){toast('A stake is already set this duel');return;}
  const staked=canServerStake();
  const t=await askText('Stake this duel',
    staked?'Two-party verified escrow: stakes are held up-front and paid only if you both attest the result. (10–5000)':'Stake coins on your own victory. Winner takes both stakes (10–5000).','250','Offer');
  const n=parseInt(t,10);
  if(!(n>=10&&n<=5000)){toast('Stake must be 10–5000');return;}
  if(staked){
    const bal=await stakeBalance();
    if(!(bal>=n)){toast('You hold '+(bal||0)+' stakes — claim your daily stake, or lower the amount','bad');return;}
    G._stakeWait=true;
    G.transport.send({t:'wager-ask',n,stake:true});
    toast('Stake offer sent — awaiting opponent');
    return;
  }
  if(!ECO.canWager(n)){toast('Not enough coins — top up in the Marketplace');return;}
  if(!ECO.escrowWager(n)){toast('Escrow failed');return;}
  G.wagerN=n;
  refreshWallet();
  G.transport.send({t:'wager-ask',n});
  toast('Wager offer sent — awaiting opponent');
}
async function offerWager(n,staked){
  if(!isOnline())return;
  const ok=await confirmBox('Stake offered',
    staked?('Your opponent stakes '+n+' stakes (server escrow). Match it?'):('Your opponent stakes '+n+' coins. Match it?'));
  if(!ok){G.transport.send({t:'wager-no'});return;}
  if(staked){
    const bal=await stakeBalance();
    if(!(bal>=n)){toast('You hold '+(bal||0)+' stakes — cannot match','bad');G.transport.send({t:'wager-no'});return;}
    const r=await duelOpen(SRV.oppUid,(SEED>>>0),n);
    if(!r.ok){toast('Escrow failed: '+(r.why||''), 'bad');G.transport.send({t:'wager-no'});return;}
    G.duelId=r.id;G._stakeWait=false;
    G.transport.send({t:'wager-ok',n,stake:true});
    G.transport.send({t:'duel',id:r.id});
    toast('Staked '+n+' stakes — held in escrow','good');
    return;
  }
  if(ECO.canWager(n)&&ECO.escrowWager(n)){
    G.wagerN=n;refreshWallet();
    G.transport.send({t:'wager-ok',n});
    toast('Wager on: '+n+' coins each','good');
  }else{toast('Not enough coins to match','bad');G.transport.send({t:'wager-no'});}
}
function confirmWager(n,staked,msg){
  if(staked){
    if(G.duelId||G._stakeWait){toast(msg,'good');return;}
    toast('Opponent accepted — finalising escrow…');return;
  }
  if(G.wagerN===n){toast(msg,'good');return;}
  if(G.wagerN>0){G.transport.send({t:'wager-no'});return;}
  if(ECO.canWager(n)&&ECO.escrowWager(n)){G.wagerN=n;refreshWallet();toast(msg,'good');}
  else G.transport.send({t:'wager-no'});
}
$('#btn-wager').onclick=()=>{sfx.click();proposeWager();};

/* ================= emotes ================= */

const KEYEM={'1':'wave','2':'point','3':'laugh','4':'bow','5':'taunt'};
document.querySelectorAll('#emote-bar .emote').forEach(b=>b.onclick=()=>doEmote(b.dataset.e));
window.addEventListener('keydown',e=>{
  if(!G.started||G.over||!G.state)return;
  const tag=e.target&&e.target.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA')return;
  if(KEYEM[e.key])doEmote(KEYEM[e.key]);
});
function doEmote(id){
  const c=G.myColor||G.state.turn;
  if(rigs[c])rigs[c].rig.emote(id);
  if(crowd)crowd.react('cheer');
  if(isOnline())G.transport.send({t:'emote',e:id});
}

/* ================= daily puzzle ================= */

function startPuzzle(){
  teardownNet();
  const pz=generatePuzzle(dayKey());
  if(!pz){toast('The puzzle forge rests today');return;}
  G.mode='puzzle';G.myColor=GAME.RED;
  G.state=pz.state;G.pz=pz;G.over=false;G.busy=false;
  G.started=true;
  $('#log').innerHTML='';
  enterMatch();
  renderBoard(true);
  refreshMoves();
  updateHUD();
  showModeBanner('Daily Puzzle \u2014 find the '+pz.target+'-capture chain');
  toast(ECO.doneDaily('puzzle')?'Today\u2019s reward is banked \u2014 play for pride':'Chain every capture for a reward');
}
function puzzleJudge(move){
  G.busy=false;
  clearSelection();
  show($('#mode-banner'),false);
  if(move.captures.length===G.pz.target||G.state.winner){
    let reward='';
    if(ECO.dailyOnce('puzzle',()=>{ECO.addCoins(60,'puzzle');})){
      reward=' \u00B7 +60 coins banked';
      refreshWallet();
    }
    sfx.win();
    showTaunt('The chain holds!');
    const st=RET.markPuzzle(true);
    showPzEnd('CHAIN COMPLETE','A flawless '+G.pz.target+'-capture hunt.'+reward+'  ·  Streak '+st,true);
  }else{
    const line=G.pz.solution.path.map(GAME.sqName).join('\u2192');
    world.showTargets([G.pz.solution]);
    G.pz.solution.captures.forEach(sq=>world.burst(sq,0xff9d2e,12));
    sfx.error();
    RET.markPuzzle(false);
    showPzEnd('THE HUNT SLIPS','The true chain was '+line+' \u2014 '+G.pz.target+' captures.',false);
  }
  G.over=true;
}
function showPzEnd(title,sub,solved){
  $('#pz-title').textContent=title;
  $('#pz-sub').textContent=sub;
  const share=$('#pz-share');
  if(share){
    share.style.display=solved===undefined?'none':'';
    share.onclick=()=>copyText(RET.shareCard(!!solved));
  }
  show($('#pzend'),true);
}
$('#pz-btn').onclick=()=>{sfx.click();location.reload();};

/* ================= gauntlet ================= */

function startGauntlet(){
  teardownNet();
  const s=rollDaily(dayKey());
  const done=s.cleared>=GAUNTLET_ROUNDS.length;
  const rows=GAUNTLET_ROUNDS.map((r,i)=>{
    const st=i<s.cleared?'<b class="ok-l">cleared</b>':(i===s.cleared&&!done?'<b class="ember-l">next</b>':'sealed');
    return '<div class="shop-card"><h4>Round '+(i+1)+'</h4><div class="desc">'+r.label+'</div><div class="price">'+st+' \u00B7 +'+roundReward(i)+' coins</div></div>';
  }).join('');
  openLobby('<h2>The Daily Gauntlet</h2><p class="hint">Five escalating rounds against the Storm. Clear them all for a bonus. The climb resets with the moon. Current streak: <b>'+s.streak+'</b></p><div class="shop-grid" style="margin:12px 0">'+rows+'</div><div class="row"><button class="btn primary" id="gv-go"'+(done?' disabled':'')+'>'+(done?'Return when the moon renews':'Begin Round '+(s.cleared+1))+'</button><button class="btn" id="gv-back">Back</button></div>');
  $('#gv-back').onclick=()=>{sfx.click();show($('#lobby'),false);};
  if(!done)$('#gv-go').onclick=()=>{sfx.click();gvRound(s.cleared);};
}
function gvRound(i){
  const r=GAUNTLET_ROUNDS[i];
  startAI(r.lv);
  G.gv={i,mod:r.mod,caps:{red:0,black:0}};
  G.blazing=r.mod==='blazing';
  showModeBanner('Gauntlet \u00B7 Round '+(i+1)+'/'+GAUNTLET_ROUNDS.length+(r.mod?' \u2014 '+r.label:''));
  if(r.mod==='blazing')toast('Blazing: 15 seconds per move','bad');
  if(r.mod==='attrition')toast('Attrition: first to seize 6 pieces wins','good');
  if(r.mod==='royal')toast('King\u2019s Rush: the first crown wins','good');
}
function gauntletMoveHook(color,move){
  if(!G.gv||G.state.winner)return;
  if(move.captures.length){
    G.gv.caps[color]+=move.captures.length;
    if(G.gv.mod==='attrition'&&G.gv.caps[color]>=6)G.state={...G.state,winner:color};
  }
}
function showModeBanner(t){
  $('#mode-banner').textContent=t;
  show($('#mode-banner'),true);
}

/* ================= replay ================= */

$('#b-replay-code').onclick=()=>copyText(buildCode(G.record,SEED,G.mode));
$('#b-replay').onclick=async()=>{
  sfx.click();
  const t=await askText('Watch a Replay','Paste a duel replay code to relive it on the island.','Replay code\u2026','Watch');
  if(!t)return;
  if(!parseCode(t)){toast('That is not a valid replay code','bad');return;}
  show($('#menu'),false);
  openViewer(GAME,world,t,()=>location.reload());
};

/* ================= wallet & shop ================= */

function refreshWallet(){
  const c=ECO.getWallet().coins;
  $('#wallet-amt').textContent=c;
  $('#shop-coins').textContent=c;
}

let shopTab='Pieces';
const ITEMCAT={Looks:'look',Shapes:'shape',Palettes:'palette',Pieces:'skin',Boards:'board',Thrones:'throne',Clocks:'clock',Triumphs:'victory',Realms:'theme'};
function shopId(tab,id){return tab==='Realms'?'theme:'+id:id;}

function openShop(tab){
  if(tab)shopTab=tab;
  refreshWallet();
  const tabs=[...allCatalog().map(c=>c[0]),'Pass'];
  $('#shop-tabs').innerHTML='';
  for(const name of tabs){
    const b=document.createElement('button');
    b.textContent=name;
    if(name===shopTab)b.classList.add('on');
    b.onclick=()=>{sfx.click();openShop(name);};
    $('#shop-tabs').appendChild(b);
  }
  const grid=$('#shop-grid');
  grid.innerHTML='';
  if(shopTab==='Pass')renderPass(grid);
  else renderCat(grid,shopTab);
  show($('#menu'),false);
  show($('#shop'),true);
}
function descFor(tab){
  if(tab==='Realms')return 'World skin — unlocks in the Worlds picker';
  if(tab==='Looks')return 'Your avatar — headgear, robes & bearing';
  if(tab==='Shapes')return 'Silhouette of every man on the board';
  if(tab==='Palettes')return 'Recolour both armies at once';
  if(tab==='Pieces')return 'Army finish for both colors';
  if(tab==='Boards')return 'Table & board set for the arena';
  if(tab==='Clocks')return 'Timepiece for your corner table';
  if(tab==='Thrones')return 'Your seat upon the island';
  if(tab==='Triumphs')return 'Victory dance for your army';
  return '';
}
function renderCat(grid,tabName){
  const cat=allCatalog().find(c=>c[0]===tabName);
  if(!cat)return;
  const slot=ITEMCAT[tabName];
  for(const[id,item]of Object.entries(cat[1])){
    const sid=shopId(tabName,id);
    const owned=id==='default'||unlocked(sid);
    const equipped=getEquip()[slot]===id;
    const card=document.createElement('div');
    card.className='shop-card';
    const price=item.price===0?'Free':item.price+' coins'+(item.cash?' or $'+item.cash:'');
    card.innerHTML='<h4>'+item.name+'</h4><div class="desc">'+descFor(tabName)+'</div><div class="price">'+price+'</div>';
    const btn=document.createElement('button');
    if(id==='default'||id==='auto'){btn.textContent=equipped?'Equipped':'Standard';btn.disabled=true;btn.classList.add('owned');}
    else if(equipped){btn.textContent='Equipped';btn.classList.add('equipped');btn.disabled=true;}
    else if(owned){
      btn.textContent='Equip';
      btn.onclick=()=>equip(tabName,id);
    }else{
      btn.textContent=item.price+' coins';
      btn.onclick=async()=>{
        const ok=await ECO.purchase(sid,item.price,'coins');
        if(ok){toast(item.name+' acquired','good');openShop();}
        else toast('Not enough coins','bad');
      };
    }
    card.appendChild(btn);
    if(!owned&&item.cash){
      const b2=document.createElement('button');
      b2.textContent='$'+item.cash.toFixed(2);
      b2.onclick=async()=>{
        const ok=await ECO.purchase(sid,item.cash,'cash');
        if(ok){toast(item.name+' acquired','good');openShop();}
      };
      card.appendChild(b2);
    }
    grid.appendChild(card);
  }
}
function equip(tab,id){
  const slot=ITEMCAT[tab];
  setEquip(slot,id);
  sfx.click();
  if(slot==='skin')world.reskin(id,(SKINS[id]||{}).params||{});
  if(slot==='throne')buildActors();
  if(slot==='look')buildActors();
  if(slot==='shape')world.reshape(id);
  if(slot==='palette'){world.army(armyPalette());buildActors();}
  if(slot==='theme')world.setTheme(id);
  if(slot==='board'||slot==='clock')refreshEnvLook();
  toast('Equipped','good');
  openShop();
}
function renderPass(grid){
  const w=ECO.getWallet();
  const {lvl,xp,need}=ECO.passLevel(w);
  const info=document.createElement('div');
  info.className='pass-lvl';
  info.innerHTML='Season level <b>'+lvl+'</b> \u00B7 '+xp+'/'+need+' XP \u00B7 Premium: '+(w.premium?'<b style="color:var(--gold)">active</b>':'no');
  const bar=document.createElement('div');
  bar.className='pass-bar';
  bar.innerHTML='<div style="width:'+Math.min(100,xp/need*100)+'%"></div>';
  grid.appendChild(info);
  grid.appendChild(bar);
  ECO.PASS_TRACK.forEach((tier,i)=>{
    const open=lvl>=tier.lvl;
    const claimed=w.passClaimed.includes(i);
    const canGet=open&&(!tier.premium||w.premium)&&!claimed;
    let label=tier.reward;
    if(tier.reward.startsWith('skin:'))label=(SKINS[tier.reward.slice(5)]||{}).name||label;
    if(tier.reward.startsWith('throne:'))label=(THRONES[tier.reward.slice(7)]||{}).name||label;
    if(tier.reward.startsWith('theme:'))label=((THEMEPACKS[tier.reward.slice(6)]||THEMES[tier.reward.slice(6)]||{}).name)||label;
    const card=document.createElement('div');
    card.className='shop-card';
    card.innerHTML='<h4>Tier '+(i+1)+' \u00B7 Lv '+tier.lvl+'</h4><div class="desc">'+label+(tier.premium?' (premium)':'')+'</div>';
    const b=document.createElement('button');
    b.textContent=claimed?'Claimed':open?'Claim':'Lv '+tier.lvl;
    b.disabled=!canGet;
    if(claimed)b.classList.add('owned');
    b.onclick=()=>{
      const r=ECO.claimPass(i);
      if(r.ok){toast('Reward claimed','good');openShop();}
      else toast(r.why,'bad');
    };
    card.appendChild(b);
    grid.appendChild(card);
  });
}
$('#b-shop').onclick=()=>{sfx.click();openShop();};
$('#btn-shop-hud').onclick=()=>{sfx.click();openShop();};
$('#b-shop-close').onclick=()=>{sfx.click();show($('#shop'),false);if(!G.started)show($('#menu'),true);};
$('#b-topup').onclick=async()=>{
  const t=await askText('Coin Top-up','Sandbox purchase — enter an amount (1000 coins ≈ $4.99).','1000','Buy');
  const n=parseInt(t,10);
  if(!(n>0))return;
  const usd=Math.max(.99,Math.round(n/2000*499)/100);
  const ok=await ECO.PROVIDER.checkout('coins:'+n,usd);
  if(ok){ECO.addCoins(n,'topup');refreshWallet();toast('+'+n+' coins','good');}
};
$('#b-pass-premium').onclick=async()=>{
  const w=ECO.getWallet();
  if(w.premium){toast('Premium pass already active');return;}
  const ok=await ECO.PROVIDER.checkout('pass:premium',4.99);
  if(ok){
    const w2=ECO.getWallet();
    w2.premium=true;
    ECO.saveWallet(w2);
    toast('Premium pass activated','good');
    openShop();
  }
};

/* ================= menu wiring (new) ================= */

$('#b-puzzle').onclick=()=>{sfx.click();startPuzzle();};
$('#b-gauntlet').onclick=()=>{sfx.click();startGauntlet();};

/* ================= accounts & ladder ================= */

function signedIn(){
  return (SRV.ok&&SRV.me)||(Auth.ok&&Auth.me);
}
function currentProfile(){
  if(SRV.ok&&SRV.me)return SRV.profile;
  if(Auth.ok&&Auth.me)return Auth.profile;
  return null;
}
function updateAuthUI(){
  const btn=$('#b-auth');
  const me=signedIn(),p=currentProfile();
  if(me&&p){
    btn.textContent='Sign Out';
    const handle=p.handle||(String(me.id).replace(/^local:/,''));
    MYHANDLE=handle;MYNAME=handle;OPPNAME=null;refreshNames();
    $('#profile-line').innerHTML='@'+handle+' &middot; <b>'+p.elo+'</b> elo &middot; '+p.wins+'W / '+p.losses+'L';
    show($('#profile-line'),true);
  }else{
    btn.textContent='Sign In';
    MYHANDLE=null;OPPNAME=null;refreshNames();
    show($('#profile-line'),false);
  }
}
function applyLoadout(){
  const eq=getEquip();
  const skin=unlocked(eq.skin)?eq.skin:'default';
  world.reskin(skin,(SKINS[skin]||{}).params||{});
  buildActors();
  refreshEnvLook();
}
onAuthChange(updateAuthUI);
onAssetsChange(()=>{refreshWallet();applyLoadout();});

function openAuth(){
  const st=$('#auth-status');
  st.className='status';
  if(!SRV.ok&&Auth.ok&&Auth.me){
    st.textContent='Signed in as @'+String(Auth.me.id).replace(/^local:/,'')+' on this device';
    return;
  }
  st.textContent=SRV.ok?'':'Local mode \u2014 '+(SRV.why||'backend unreachable')+' \u00B7 accounts live in this browser only';
  show($('#menu'),false);
  show($('#auth'),true);
}
async function doSignOut(){
  await authSignOut();
  updateAuthUI();
  toast('Signed out','good');
}
let authBusy=false;
async function authDo(fn){
  if(authBusy)return;
  const h=$('#auth-handle').value.trim(),p=$('#auth-pass').value;
  const st=$('#auth-status');
  authBusy=true;
  st.textContent='Summoning\u2026';
  st.className='status';
  let r;
  try{
    r=await fn(h,p);
  }finally{
    authBusy=false;
  }
  if(r&&r.ok){
    st.textContent='';
    st.className='status';
    $('#auth-pass').value='';
    show($('#auth'),false);show($('#menu'),true);
    updateAuthUI();
    toast('Welcome, '+h,'good');
    sfx.join();
  }else{
    st.textContent=r?r.why:'something went wrong';
    st.className='status err';
  }
}
$('#b-auth').onclick=()=>{sfx.click();if(signedIn())doSignOut();else openAuth();};
$('#b-auth-signup').onclick=()=>{sfx.click();authDo(authSignUp);};
$('#b-auth-off').onclick=()=>{sfx.click();show($('#auth'),false);if(!G.started)show($('#menu'),true);};

async function openLadder(){
  if(!Auth.ok){toast('Ladder offline \u2014 backend unreachable');return;}
  const rows=await authLadder(60);
  const meH=Auth.profile?Auth.profile.handle:null;
  $('#ladder-body').innerHTML=rows.map((r,i)=>
    '<tr'+(r.handle===meH?' style="color:var(--gold)"':'')+'><td>'+(i+1)+'</td><td>'+r.handle+'</td><td>'+r.elo+'</td><td>'+r.wins+'/'+r.losses+'</td></tr>'
  ).join('')||'<tr><td colspan="4">No rated duels yet \u2014 be the first.</td></tr>';
  show($('#menu'),false);
  show($('#ladder'),true);
}
$('#b-ladder').onclick=()=>{sfx.click();openLadder();};
$('#b-rivals').onclick=()=>{sfx.click();rivalsMenu();};
$('#b-boards').onclick=()=>{sfx.click();boardsMenu('corr');};
$('#b-bets').onclick=()=>{sfx.click();betsMenu('open');};
$('#b-ladder-close').onclick=()=>{sfx.click();show($('#ladder'),false);if(!G.started)show($('#menu'),true);};

/* ================= boot ================= */

G.state=GAME.initialState();
renderBoard(true);
refreshMoves();
updateHUD();
refreshWallet();

/* ================= spectating ================= */

const RXC={ooo:0x54d6ff,haha:0xffd75e,gg:0x59c98a,storm:0xb06cff};
let specSeq=0,specRx=0,specPollTimer=null;

/* --- live spectator presence: render watchers as avatars with handle tags --- */
let _wsid=null;
function mySid(){if(_wsid)return _wsid;try{_wsid=sessionStorage.getItem('ad-wsid');}catch(e){}if(!_wsid){_wsid='s'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);try{sessionStorage.setItem('ad-wsid',_wsid);}catch(e){}}return _wsid;}
const SPEC_SEATS=(()=>{const a=[];for(let i=0;i<28;i++){const ang=(i/28)*Math.PI*2+Math.PI/28;if(Math.abs(Math.cos(ang))>0.80)continue;a.push(ang);}return a;})();
let presObjs={},presPoll=null,presBeat=null,presCode=null,presIsSpec=false,presFrameOn=false;
function presSeat(i){const ang=SPEC_SEATS[i%SPEC_SEATS.length];const R=8.0;return{x:Math.sin(ang)*R,z:Math.cos(ang)*R,facing:ang+Math.PI};}
function presRender(rows){
  rows=(rows||[]).slice(0,10);
  const keep=new Set();
  rows.forEach((r,i)=>{keep.add(r.sid);
    if(presObjs[r.sid])return;
    const s=presSeat(i);
    const g=world.makeGroup(s.x,-0.05,s.z);
    const sv=[...String(r.sid)].reduce((h,ch)=>((h*31+ch.charCodeAt(0))>>>0),7);
    const av=makeAvatar('black',s.facing,sv,'default',r.look||null);
    av.group.scale.setScalar(.82);
    g.add(av.group);
    const tag=makeNameTag(r.name||'spectator',r.me?'rgba(120,224,255,.95)':undefined);
    tag.position.set(0,2.35,0);g.add(tag);
    g.userData.upd=av.update;
    presObjs[r.sid]=g;
  });
  for(const sid in presObjs){if(!keep.has(sid)){world.removeObject(presObjs[sid]);delete presObjs[sid];}}
}
function presEnsureFrame(){if(presFrameOn)return;presFrameOn=true;world.onFrame(dt=>{for(const k in presObjs){const u=presObjs[k].userData.upd;if(u)u(dt);}});}
async function presStart(code,isSpec){
  presStop();
  if(!SRV.ok||!code)return;
  presCode=code;presIsSpec=!!isSpec;presEnsureFrame();
  const poll=async()=>{if(G.watchCode!==presCode)return;presRender(await watchRoster(presCode,presIsSpec?mySid():null));};
  if(isSpec)await watchHeartbeat(code,mySid(),MYNAME,avatarLook());
  poll();
  presPoll=setInterval(poll,4000);
  if(isSpec)presBeat=setInterval(()=>{if(G.watchCode===presCode)watchHeartbeat(presCode,mySid(),MYNAME,avatarLook());},20000);
}
function presStop(){
  if(presPoll)clearInterval(presPoll);if(presBeat)clearInterval(presBeat);presPoll=presBeat=null;
  if(presIsSpec&&presCode)watchLeave(presCode,mySid());
  for(const k in presObjs){world.removeObject(presObjs[k]);delete presObjs[k];}
  if(world.followOff)world.followOff();
  presCode=null;presIsSpec=false;
}

async function createWatch(){
  const inv=await createInvite('spectate',{code:'W'+srvNewCode(6),name:MYNAME,theme:world.currentTheme()});
  if(!inv.ok){toast('Spectator pass failed: '+inv.why,'bad');return null;}
  G.watchCode=inv.code;
  for(let i=0;i<G.record.length;i++){
    pushMove(inv.code,i+1,i%2===0?GAME.RED:GAME.BLACK,G.record[i]);
  }
  copyText(location.origin+location.pathname+'?watch='+inv.code);
  presStart(inv.code,false);
  toast('Spectator pass created \u2014 link copied','good');
  show($('#btn-watch'),false);
  return inv.code;
}
$('#btn-watch').onclick=async()=>{
  sfx.click();
  if(!Auth.ok){toast('Spectating needs the backend');return;}
  if(G.mode==='host')await createWatch();
  else if(G.mode==='guest'){G.transport.send({t:'watchreq'});toast('Asked the host for a spectator pass\u2026');}
};
document.querySelectorAll('#spec-reactions .emote').forEach(b=>b.onclick=()=>{
  if(!G.watchCode)return;
  srvReact(G.watchCode,b.dataset.r);
  b.style.transform='scale(1.35)';
  setTimeout(()=>{b.style.transform='';},180);
});

setInterval(async()=>{
  if(!G.watchCode||!G.started||G.mode==='watch')return;
  const rx=await getReactions(G.watchCode,specRx);
  for(const one of rx){
    specRx=one.id;
    world.reactBurst(RXC[one.emoji]||0xffd75e);
    if(crowd)crowd.react('cheer');
  }
},3000);

async function startSpectate(code){
  const row=await getInvite(code);
  if(!row||row.kind!=='spectate'){toast('No spectator pass at that link','bad');return;}
  teardownNet();
  G.mode='watch';G.myColor=null;G.started=true;G.over=false;
  G.watchCode=code;
  G.watchNames={host:row.host_name||row.name||null,guest:null};
  refreshNames();
  world.setTheme(row.theme&&THEMES[row.theme]?row.theme:DEFAULT_THEME);
  G.state=GAME.initialState();
  $('#log').innerHTML='';
  show($('#menu'),false);
  show($('#hud'),true);
  show($('#chat'),false);
  show($('#emote-bar'),false);
  show($('#btn-resign'),false);
  show($('#btn-rematch'),false);
  show($('#btn-wager'),false);
  show($('#spectate-bar'),true);
  $('#turn-text').textContent='Spectating \u2014 '+(row.host_name||'a duel');
  $('#turn-emblem').className='red';
  renderBoard(true);
  toast('You are watching this duel','good');
  clearInterval(specPollTimer);
  specPollTimer=setInterval(specPoll,800);
  world.followOff&&world.followOff();
  if(world.refit)world.refit();
  presStart(code,true);
}
let specBusy=false;
async function specPoll(){
  if(specBusy||G.mode!=='watch'||!G.watchCode)return;
  specBusy=true;
  try{
  const rows=await getMoves(G.watchCode,specSeq);
  for(const r of rows){
    specSeq=r.seq;
    const mv=r.move;
    if(mv.captures&&mv.captures.length)sfx.capture(1);else sfx.move();
    await world.animateMove(mv,sq=>world.removeCaptured(sq),null,{});
    G.state=GAME.applyMove(G.state,mv);
    renderBoard();
    logMove(mv,r.mover,false,r.seq);
    world.showLastMove(mv);
    {const d=mv.path[mv.path.length-1];const v=world.sqToVec(d,.3);world.followTo(v.x,v.z);}
    $('#turn-text').textContent=(G.state.winner?G.dispName[G.state.winner]+' wins!':G.dispName[r.mover==='red'?'black':'red']+' to move');
    if(mv.captures&&mv.captures.length)crowd.react(mv.captures.length>1?'multi':'capture');
  }
  const rx=await getReactions(G.watchCode,specRx);
  for(const one of rx){
    specRx=one.id;
    world.reactBurst(RXC[one.emoji]||0xffd75e);
    crowd.react('cheer');
  }
  if(G.state.winner){
    clearInterval(specPollTimer);
    sfx.win();
  }
  }finally{specBusy=false;}
}

/* ================= backend boot ================= */

srvInit().then(()=>{
  const qs=new URLSearchParams(location.search);
  const dq=qs.get('duel'),wq=qs.get('watch');
  if(dq)joinByCode(dq.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8));
  else if(wq)startSpectate(wq.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,9));
});

/* ================= timepiece ================= */

function refreshEnvLook(){
  const eq=getEquip();
  world.applyBoardSet(unlocked(eq.board)?eq.board:'island');
  world.setEnvironmentClock(unlocked(eq.clock)?eq.clock:'auto');
  world.setClockDigital(lsGet('ad-digital')!=='0');
}
refreshEnvLook();
world.onClockStrike(()=>sfx.bell());

/* ================= retention: daily hub, streaks, reminders ================= */

const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function bar(v,max,w=12){v=Math.max(0,Math.min(max,v));return '▰'.repeat(v)+'▱'.repeat(Math.max(0,max-v));}

function renderHub(){
  const c=RET.career();
  const q=RET.questBoard();
  const wotd=RET.worldOfToday();
  const wotdName=(THEMES[wotd]||{}).name||wotd;
  const pend=RET.inbox();
  const earned=new Set(RET.unlockedByMilestone());
  const sets=RET.setProgress();
  const c1=(n,v)=>'<div class="hub-stat"><b>'+v+'</b><span>'+n+'</span></div>';
  const rows=q.map(x=>'<div class="hub-q'+(x.done?' done':'')+'"><span>'+esc(x.q.label)+'</span><em>'+x.prog+'/'+x.q.goal+' \u00B7 +'+x.q.coins+'\u25C7</em><div class="hub-bar"><i style="width:'+Math.round(x.prog/x.q.goal*100)+'%"></i></div></div>').join('');
  const ms=RET.MILESTONES.map(m=>'<li class="'+(earned.has(m.id)?'ok-l':'')+'">'+(earned.has(m.id)?'\u2713 ':'\u00B7 ')+esc(m.label)+'</li>').join('');
  const st=sets.map(s=>'<div class="hub-q'+(s.done?' done':'')+'"><span>'+esc(s.set.name)+' \u2014 '+esc(s.set.label)+'</span><em>'+s.have+'/'+s.total+(s.done?' \u00B7 jewel!':'')+'</em><div class="hub-bar"><i style="width:'+Math.round(s.have/s.total*100)+'%"></i></div></div>').join('');
  const inboxHtml=pend.length?pend.map(p=>'<div class="hub-q"><span>'+esc(p.title||'Correspondence duel')+'</span><em>'+esc(p.status==='wait'?'your move':'awaiting')+'</em></div>').join(''):'<p class="hint">No correspondence duels yet. <b>Correspondence</b> time control sends one move per day.</p>';
  return ''
    +'<div class="hub-hero"><div><b>Day '+RET.loginStreak()+'</b><span>login streak</span></div>'
    +'<div><b>'+RET.puzzleStreak()+'</b><span>puzzle streak '+bar(RET.puzzleStreak(),7)+'</span></div>'
    +'<div><b>'+ECO.getWallet().coins+'</b><span>coins \u25C7</span></div></div>'
    +'<h4>World of the Day</h4><div class="hub-wotd"><b>'+esc(wotdName)+'</b><button class="btn small" id="hub-wotd">Dwell here</button></div>'
    +'<h4>Today\u2019s Quests</h4>'+rows
    +'<h4>Career</h4><div class="hub-stats">'+c1('won',c.wins)+c1('lost',c.losses)+c1('played',c.played)+c1('best chain',c.bestChain)+c1('best run',c.bestWinStreak)+c1('fastest win',c.fastestWin?c.fastestWin+'m':'\u2014')+c1('captures',c.captures)+c1('comeback',c.biggestComeback||'\u2014')+'</div>'
    +'<h4>Milestone Unlocks</h4><ul class="hub-ms">'+ms+'</ul>'
    +'<h4>Collections</h4>'+st
    +'<h4>Duel Inbox</h4>'+inboxHtml
    +pushSection();
}

const PUSH_LS='ad-push-endpoint';
function pushOn(){try{return !!localStorage.getItem(PUSH_LS);}catch(e){return false;}}
function pushSection(){
  const on=pushOn();
  const avail=CONFIG.PUSH_PUBLIC_KEY&&('serviceWorker' in navigator)&&('PushManager' in window);
  const status=on?'Reminders are on — we nudge you when a duel waits.':'Nudge me the moment a duel is waiting on my move.';
  const btn=on?'<button class="btn small" id="hub-push-off">Turn off</button>'
    :(avail?'<button class="btn small primary" id="hub-push-on">Turn on</button>'
    :'<span class="corr-tag">not configured on this server</span>');
  return '<h4>Reminders</h4><div class="hub-wotd"><span>'+status+'</span>'+btn+'</div>';
}
function urlBase64ToUint8(s){
  const pad=s+'='.repeat((4-s.length%4)%4);
  const b64=pad.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(b64);
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
async function enableReminders(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window)){toast('This browser cannot receive web push','bad');return;}
  if(!CONFIG.PUSH_PUBLIC_KEY){toast('Reminders are not configured on this server yet','bad');return;}
  if(!SRV.me){toast('Sign in first to receive reminders','bad');return;}
  try{
    let perm=(window.Notification&&Notification.permission)||'denied';
    if(perm==='default')perm=await Notification.requestPermission();
    if(perm!=='granted'){toast('Notifications were blocked','bad');return;}
    const reg=await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8(CONFIG.PUSH_PUBLIC_KEY)});
    const j=sub.toJSON();
    const r=await pushRegister(j);
    if(!r.ok){toast('Could not register the reminder ('+(r.why||'')+')','bad');return;}
    try{localStorage.setItem(PUSH_LS,j.endpoint);}catch(e){}
    toast('Reminders on','good');refreshHub();
  }catch(e){toast('Could not enable reminders','bad');}
}
async function disableReminders(){
  let endpoint=null;try{endpoint=localStorage.getItem(PUSH_LS);}catch(e){}
  try{
    const reg=await navigator.serviceWorker.getRegistration();
    const sub=reg&&await reg.pushManager.getSubscription();
    if(sub)await sub.unsubscribe();
    if(endpoint)await pushUnregister(endpoint);
    localStorage.removeItem(PUSH_LS);
  }catch(e){}
  toast('Reminders off','good');refreshHub();
}
function refreshHub(){$('#hub-body').innerHTML=renderHub();bindHub();}
function bindHub(){
  const w=$('#hub-wotd');
  if(w)w.onclick=()=>{sfx.click();const id=RET.worldOfToday();world.setTheme(id);roomTheme=id;lsSet('ad-theme',id);show($('#hub'),false);show($('#menu'),true);toast((THEMES[id].name)+' envelops you','good');};
  const on=$('#hub-push-on');if(on)on.onclick=()=>{sfx.click();enableReminders();};
  const off=$('#hub-push-off');if(off)off.onclick=()=>{sfx.click();disableReminders();};
}
function openHub(){
  $('#hub-body').innerHTML=renderHub();
  show($('#menu'),false);show($('#hub'),true);
  bindHub();
}
$('#b-hub').onclick=()=>{sfx.click();openHub();};
$('#b-hub-close').onclick=()=>{sfx.click();show($('#hub'),false);if(!G.started)show($('#menu'),true);};

(function retentionBoot(){
  try{
    const bonus=ECO.getDailyBonus();
    const lg=RET.touchLogin();
    if(bonus)toast('Daily login bonus  +'+bonus+' coins','good');
    if(lg.isNewDay&&lg.streak>1)toast('Day '+lg.streak+' \u2014 keep the storm coming','good');
    if(lg.jewel)toast('7-day streak! Gilded Throne unlocked in the Marketplace','good');
    const pend=RET.pendingInbox();
    if(pend.length){RET.requestNotify();setTimeout(()=>RET.fireReminder(),1600);}
  }catch(e){}
})();

function toggleInspect(){
  if(world.inspecting)world.exitClockInspect();
  else world.enterClockInspect();
}

function toggleTheme(){
  const themes=['dark','light'];
  const current=localStorage.getItem('ad-theme-mode')||'dark';
  const next=themes[(themes.indexOf(current)+1)%themes.length];
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('ad-theme-mode',next);
  sfx.click();
  toast('Theme switched to '+next,'good');
}

world.onInspectChange(on=>{
  if(on){
    const item=CLOCKS[world.clockStyle()]||{name:'The Skeleton Bell'};
    $('#tp-name').textContent=item.name;
    $('#tp-digital').textContent='Digital: '+(lsGet('ad-digital')!=='0'?'On':'Off');
  }
  show($('#timepiece-bar'),on);
});
$('#btn-clock').onclick=()=>{sfx.click();toggleInspect();};
$('#tp-close').onclick=()=>{sfx.click();world.exitClockInspect();};
$('#tp-reset').onclick=()=>{sfx.click();world.exitClockInspect();};
$('#tp-digital').onclick=()=>{
  const on=lsGet('ad-digital')==='0';
  lsSet('ad-digital',on?'1':'0');
  world.setClockDigital(on);
  $('#tp-digital').textContent='Digital: '+(on?'On':'Off');
  sfx.click();
};
window.addEventListener('keydown',e=>{
  const tag=e.target&&e.target.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA')return;
  if(e.key==='Escape'&&world.inspecting)world.exitClockInspect();
  else if((e.key==='c'||e.key==='C')&&!world.inspecting){
    const openModal=document.querySelector('.overlay:not(.hidden)');
    if(!openModal)toggleInspect();
  }
  else if((e.key==='r'||e.key==='R')&&!world.inspecting&&G.started&&!G.over){
    sfx.click();
    doRematch();
  }
  else if((e.key==='q'||e.key==='Q')&&!world.inspecting&&G.started){
    sfx.click();
    $('#btn-quit').click();
  }
  else if((e.key===' '||e.key==='Spacebar')&&!world.inspecting&&G.started){
    sfx.click();
    $('#btn-resign').click();
  }
  else if((e.key==='1')&&!world.inspecting&&G.started){
    doEmote('wave');
  }
  else if((e.key==='2')&&!world.inspecting&&G.started){
    doEmote('point');
  }
  else if((e.key==='3')&&!world.inspecting&&G.started){
    doEmote('laugh');
  }
  else if((e.key==='4')&&!world.inspecting&&G.started){
    doEmote('bow');
  }
  else if((e.key==='5')&&!world.inspecting&&G.started){
    doEmote('taunt');
  }
  else if((e.key==='t'||e.key==='T')&&!world.inspecting){
    toggleTheme();
  }
});

window.addEventListener('error',e=>{
  console.error('Uncaught error:',e.error);
  toast('Something went wrong — please reload','bad');
});

window.addEventListener('unhandledrejection',e=>{
  console.error('Unhandled rejection:',e.reason);
  toast('A network error occurred — please check your connection','bad');
});

window.addEventListener('offline',()=>{
  if(isOnline()){
    toast('You appear to be offline — some features may be limited','bad');
  }
});

window.addEventListener('online',()=>{
  toast('Back online — reconnecting','good');
  srvReconnect().then(ok=>{
    if(ok)toast('Syncing with server','good');
    else toast('Still offline — play continues locally','bad');
  });
});

window.addEventListener('pagehide',()=>{flushAssets();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){flushAssets();music.suspend();}else music.resume();});

/* start ambient music on the first user gesture (autoplay policy) */
(function unlockMusic(){
  const go=()=>{music.begin();['pointerdown','keydown','touchstart'].forEach(ev=>window.removeEventListener(ev,go));};
  ['pointerdown','keydown','touchstart'].forEach(ev=>window.addEventListener(ev,go,{passive:true}));
})();

window.__aether={G,world,GAME,playMove,refreshMoves,rigs,
  eco:ECO,doEmote,startPuzzle,startGauntlet,gvRound,openShop,showTaunt,buildCode,parseCode,
  endGame,startHotseat,SRV,createWatch,startSpectate,joinByCode,proposeWager,
  refreshEnvLook,toggleInspect,CLOCKS,quantLobby,startQuant,music,sfx,cosmetics:{AVATARS,SHAPES,PALETTES,getEquip,setEquip,unlocked,avatarLook,armyPalette},ret:RET,
  get crowd(){return crowd;},get seed(){return SEED;}};
