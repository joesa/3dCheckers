import * as GAME from './game.js';
import {createWorld} from './world.js';
import {makeAvatar,makeCrowd} from './actors.js';
import {chooseMove,LEVEL_NAMES} from './ai.js';
import {TabsTransport,RTCRoom} from './net.js';
import {THEMES,THEME_IDS,DEFAULT_THEME} from './themes.js';
import {sfx} from './audio.js';

const $=s=>document.querySelector(s);
const show=(el,on)=>el.classList.toggle('hidden',!on);
const TEAM_NAME={red:'Ember',black:'Frost'};

const ADJ=['Swift','Smoky','Crimson','Frosty','Rogue','Gilded','Misty','Thunder','Quiet','Lucky'];
const NOUN=['Comet','Willow','Raven','Ember','Glacier','Nomad','Pixie','Heron','Vagabond','Star'];
const MYNAME=ADJ[Math.random()*ADJ.length|0]+' '+NOUN[Math.random()*NOUN.length|0];

function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}

const world=createWorld($('#gl'),lsGet('ad-theme')||DEFAULT_THEME);

/* avatars + crowd — seeded so both duelists see the same designs */
let SEED=Math.random()*1e9|0;
const rigs={red:null,black:null};
const anchors={red:null,black:null};
let crowd=null;
function buildActors(){
  for(const[team,facing,zpos]of[['red',Math.PI,5.3],['black',0,-5.3]]){
    if(anchors[team])world.removeObject(anchors[team]);
    const anchor=world.makeGroup(0,.05,zpos);
    const a=makeAvatar(team,facing,(SEED+(team==='red'?1:2))>>>0);
    anchor.add(a.group);
    anchors[team]=anchor;
    rigs[team]={rig:a.rig,update:a.update};
  }
  if(crowd)world.removeObject(crowd.group);
  crowd=makeCrowd(SEED);
  world.addObject(crowd.group);
}
buildActors();
world.onFrame(dt=>{
  if(rigs.red)rigs.red.update(dt);
  if(rigs.black)rigs.black.update(dt);
  if(crowd)crowd.update(dt);
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const G={
  mode:null, transport:null, myColor:null,
  state:null, moves:[], selected:null,
  busy:false, over:false, started:false,
  peerSeen:false, turnEnd:null, lastTick:0,
  rtcWasHost:false, aiLevel:'medium', aiTimer:0,
};
const isOnline=()=>G.mode==='host'||G.mode==='guest';
let roomTheme=DEFAULT_THEME;

/* ================= rendering ================= */

function renderBoard(stagger=false){
  world.syncBoard(G.state.board,stagger);
}

function updateHUD(){
  const t=G.state.turn;
  $('#turn-emblem').className=t;
  $('#turn-emblem').style.color=t==='red'?'var(--ember)':'var(--frost)';
  let label=TEAM_NAME[t]+' to move';
  if(G.mode==='ai')label+=t===GAME.BLACK?' — machine':' — you';
  else if(G.myColor)label+= (t===G.myColor?' — you':' — opponent');
  $('#turn-text').textContent=G.over?'Game over':label;
  show($('#timer-wrap'),isOnline()&&!G.over);
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

function logMove(move,color,promoted,moveNo){
  const li=document.createElement('li');
  li.className=color;
  const n=move.captures.length;
  li.innerHTML=`<span class="n">${moveNo}.</span> <i>${TEAM_NAME[color]}</i> ${GAME.sqName(move.from)}→${GAME.sqName(move.path[move.path.length-1])}${n?' ×'+n:''}${promoted?' ♛':''}`;
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
  G.state=state;
  refreshMoves();
  clearSelection();
  renderBoard();
  G.over=!!state.winner;
  if(G.over)endGame(state.winner,false);
  else{show($('#result'),false);G.turnEnd=isOnline()?performance.now()+45000:null;}
  updateHUD();
  maybeAI();
}

async function playMove(move){
  if(G.busy||G.over)return;
  if(G.mode==='guest'){
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
  refreshMoves();
  logMove(move,color,promoted,nextState.moveNo);
  world.showLastMove(move);
  if(promoted){sfx.crown();world.burst(move.path[move.path.length-1],0xffd75e,26);crowd.react('crown');}
  if(G.mode!=='hotseat'&&isOnline())G.transport.send({t:'state',state:G.state});
  renderBoard();
  updateHUD();
  G.busy=false;
  if(G.state.winner)endGame(G.state.winner,false);
  else G.turnEnd=isOnline()?performance.now()+45000:null;
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
  const winName=TEAM_NAME[winnerColor];
  $('#result-emblem').style.color=winnerColor==='red'?'var(--ember)':'var(--frost)';
  let title,sub;
  if(!me){title=`${winName.toUpperCase()} TRIUMPHS`;sub='Pass the crown to the next duelist.';sfx.win();}
  else if(winnerColor===me){title='VICTORY';sub=resigned?'Your opponent surrendered the skies.':'Total dominance, '+MYNAME+'.';sfx.win();}
  else{title='DEFEAT';sub=resigned?'You surrendered.':'Regroup and reclaim the storm.';sfx.lose();}
  $('#result-title').textContent=title;
  $('#result-sub').textContent=sub;
  const btn=$('#b-rematch2');
  btn.textContent=(me&&G.mode==='guest')?'Ask for Rematch':'Rematch';
  show($('#result'),true);
  world.celebrate(winnerColor);
  crowd.celebrate();
}

function resetMatch(){
  G.state=GAME.initialState();
  G.over=false;G.busy=false;
  $('#log').innerHTML='';
  world.showLastMove(null);
  show($('#result'),false);
  renderBoard(true);
  refreshMoves();
  G.turnEnd=isOnline()?performance.now()+45000:null;
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
    case 'hello':
      if(G.mode==='host'&&!G.peerSeen){
        G.peerSeen=true;
        G.transport.send({t:'hello'});
        G.transport.send({t:'seed',seed:SEED});
        G.transport.send({t:'start',state:G.state,theme:roomTheme});
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
    case 'peer-gone':
      toast('Opponent disconnected','bad');
      break;
  }
}

function enterMatch(){
  G.started=true;
  show($('#menu'),false);
  show($('#hud'),true);
  show($('#chat'),isOnline());
  show($('#result'),false);
  show($('#timer-wrap'),isOnline());
}

function sendChat(text){
  if(!text.trim())return;
  if(G.mode==='hotseat'){appendChat('sys',MYNAME,'(chat needs an online duel)');return;}
  G.transport.send({t:'chat',name:MYNAME,text:text.trim()});
  appendChat('me',MYNAME,text.trim());
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
    <div class="row" style="margin-top:14px">
      <button class="btn primary" id="rtc-create">Create Invite</button>
      <button class="btn" id="rtc-haveinvite">I Have an Invite</button>
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
    status('Generating invite (gathering network paths)…');
    room=new RTCRoom(onMessage);
    G.rtcWasHost=true;
    room.onOpen=()=>{
      G.mode='host';G.myColor=GAME.RED;
      G.state=GAME.initialState();
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
    }catch(e){status('Bad answer code: '+e.message,true);}
  };
  $('#rtc-accept').onclick=async()=>{
    teardownNet();
    try{
      room=new RTCRoom(onMessage);
      G.rtcWasHost=false;
      G.transport=room;
      room.onOpen=()=>{G.mode='guest';G.myColor=GAME.BLACK;G.transport.send({t:'hello'});};
      const ans=await room.acceptOffer($('#rtc-in').value);
      $('#rtc-out').value=ans;
      show($('#rtc-join'),true);
      show($('#rtc-host'),false);
      status('Paste the answer back to the host — the duel begins when they connect.');
    }catch(e){status('Bad invite code: '+e.message,true);}
  };
  $('#rtc-copy-answer').onclick=()=>copyText($('#rtc-out').value);
}

function teardownNet(){
  clearTimeout(G.aiTimer);
  if(G.transport){try{G.transport.close();}catch(e){}}
  G.transport=null;G.mode=null;G.myColor=null;G.peerSeen=false;
}

/* ================= hotseat ================= */

function startHotseat(){
  teardownNet();
  G.mode='hotseat';G.myColor=null;
  G.state=GAME.initialState();
  G.started=true;
  enterMatch();
  renderBoard(true);
  refreshMoves();
  updateHUD();
}

/* ================= AI duel ================= */

function maybeAI(){
  if(G.mode!=='ai'||!G.started||G.over||G.busy||!G.state)return;
  if(G.state.turn!==GAME.BLACK)return;
  clearTimeout(G.aiTimer);
  G.aiTimer=setTimeout(()=>{
    if(G.mode!=='ai'||G.over||G.busy||G.state.turn!==GAME.BLACK)return;
    const mv=chooseMove(G.state,G.aiLevel);
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
    <div class="status">Squire is forgiving. Storm Monarch is not.</div>`);
  $('#lobby').querySelectorAll('.lv').forEach(b=>b.onclick=()=>{sfx.click();startAI(b.dataset.lv);});
}

function startAI(level){
  teardownNet();
  G.mode='ai';G.myColor=GAME.RED;G.aiLevel=level;
  G.state=GAME.initialState();
  G.over=false;G.busy=false;
  $('#log').innerHTML='';
  world.showLastMove(null);
  enterMatch();
  renderBoard(true);
  refreshMoves();
  updateHUD();
  toast(`Duel vs ${LEVEL_NAMES[level]} — you are Ember`,'good');
}

/* ================= UI wiring ================= */

$('#b-hotseat').onclick=()=>{sfx.click();startHotseat();};
$('#b-ai').onclick=()=>{sfx.click();aiLobby();};
$('#b-online').onclick=()=>{sfx.click();rtcLobby();};
$('#b-local').onclick=()=>{sfx.click();localLobby();};
$('#b-howto').onclick=()=>{sfx.click();show($('#menu'),false);show($('#howto'),true);};
$('#b-howto-close').onclick=()=>{sfx.click();show($('#howto'),false);show($('#menu'),true);};
$('#btn-quit').onclick=()=>location.reload();
$('#btn-sound').onclick=e=>{
  const on=!sfx.enabled;
  sfx.setEnabled(on);
  e.target.textContent=on?'♪':'✕';
  e.target.style.opacity=on?1:.5;
};
$('#btn-resign').onclick=()=>{
  if(!G.started||G.over)return;
  sfx.click();
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
    const b=document.createElement('button');
    b.className='th-btn'+(id===cur?' on':'');
    const sw=document.createElement('div');
    sw.className='th-sw';
    sw.style.background=`linear-gradient(90deg,${t.sky[1]},${t.sky[2]},${t.sky[3]})`;
    b.appendChild(sw);
    b.appendChild(document.createTextNode(t.name));
    b.onclick=()=>{
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

/* ================= turn timer ================= */

world.onFrame(()=>{
  if(!G.started||G.over||!isOnline()||!G.turnEnd)return;
  const left=G.turnEnd-performance.now();
  const bar=$('#timer-bar');
  bar.style.width=Math.max(0,left/45000*100)+'%';
  bar.classList.toggle('low',left<10000);
  const secs=Math.ceil(left/1000);
  if(secs<=5&&secs>0&&secs!==G.lastTick){G.lastTick=secs;sfx.tick();}
  if(left<=0&&G.mode==='host'&&!G.busy){
    G.lastTick=0;
    const opts=GAME.legalMoves(G.state);
    if(opts.length){
      toast('Turn timer — auto-moving','bad');
      playMove(opts[Math.random()*opts.length|0]);
    }
  }
});

/* boot */
G.state=GAME.initialState();
renderBoard(true);
refreshMoves();
updateHUD();
window.__aether={G,world,GAME,playMove,refreshMoves,rigs,get crowd(){return crowd;},get seed(){return SEED;}};
