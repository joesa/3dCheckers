export function buildCode(moves,seed,mode){
  const j=JSON.stringify({v:1,s:seed>>>0,m:mode,M:moves});
  return btoa(unescape(encodeURIComponent(j))).replace(/=+$/,'');
}
export function parseCode(code){
  try{
    const j=JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if(j.v!==1||!Array.isArray(j.M))return null;
    return {moves:j.M,seed:j.s>>>0,mode:j.m||'replay'};
  }catch(e){return null;}
}

export function openViewer(GAME,world,code,onExit){
  const data=parseCode(code);
  if(!data)return false;
  const el=document.getElementById('replay');
  const hud=document.getElementById('hud');
  const chat=document.getElementById('chat');
  const emote=document.getElementById('emote-bar');
  el.classList.remove('hidden');
  hud.classList.add('hidden');
  chat.classList.add('hidden');
  emote.classList.add('hidden');
  const bar=document.getElementById('rp-track');
  const info=document.getElementById('rp-info');
  const btn=document.getElementById('rp-play');
  let st=GAME.initialState();
  let i=0,playing=false,speed=1,done=false;
  world.syncBoard(st.board,false);
  bar.max=data.moves.length;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms/Math.max(.25,speed)));

  const blank=()=>Array.from({length:8},()=>Array(8).fill(null));
  function rebuild(board){world.syncBoard(blank(),false);world.syncBoard(board,false);}

  function paint(){
    bar.value=i;
    info.textContent=i+' / '+data.moves.length+(done?' — finished':'');
    btn.textContent=playing?'❚❚':'▶';
  }
  async function stepOnce(){
    if(i>=data.moves.length){done=true;playing=false;paint();return;}
    const mv=data.moves[i];
    const p=st.board[mv.from[0]][mv.from[1]];
    world.animateMove(mv,sq=>world.removeCaptured(sq),null,{});
    st=GAME.applyMove(st,mv);
    i++;
    world.showLastMove(mv);
    paint();
    await sleep(900);
  }
  async function loop(){
    while(playing&&i<data.moves.length){await stepOnce();}
    playing=false;paint();
  }
  btn.onclick=()=>{
    if(done){
      st=GAME.initialState();i=0;done=false;
      rebuild(st.board);world.showLastMove(null);
    }
    playing=!playing;paint();
    if(playing)loop();
  };
  document.getElementById('rp-step').onclick=()=>{playing=false;stepOnce();};
  document.getElementById('rp-back').onclick=()=>{
    playing=false;
    st=GAME.initialState();
    const upto=Math.max(0,i-1);
    for(let k=0;k<upto;k++)st=GAME.applyMove(st,data.moves[k]);
    i=upto;
    rebuild(st.board);
    done=i>=data.moves.length;
    paint();
  };
  document.getElementById('rp-speed').oninput=e=>{speed=parseFloat(e.target.value)||1;};
  document.getElementById('rp-close').onclick=()=>{
    playing=false;
    el.classList.add('hidden');
    hud.classList.remove('hidden');
    if(onExit)onExit();
  };
  paint();
  return true;
}
