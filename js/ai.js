import {legalMoves,applyMove,RED,BLACK,SIZE} from './game.js';

export const LEVELS={
  easy:{random:true},
  medium:{depth:3,time:160,noise:40},
  hard:{depth:6,time:450,noise:8},
  master:{depth:9,time:950,noise:0},
};
export const PERSONAS={
  easy:{name:'Squire Bran',style:'reckless',
    start:'The training boards, then. Try not to embarrass me.',
    cap:'Ha! Was that your plan?',
    loss:'I... let you win. Mostly.',
    win:'Bran bows. Barely.'},
  medium:{name:'Knight Errant Vessa',style:'flurry',
    start:'I ride where the storm points my lance.',
    cap:'Faster than your eye, duelist!',
    loss:'A scratch. The next ride costs you more.',
    win:'The errant rides unbroken.'},
  hard:{name:'Warlock Mordaunt',style:'grinder',
    start:'I have already seen the end. You are still setting it up.',
    cap:'Every piece a year off your life.',
    loss:'Impossible — I counted every future.',
    win:'Ash to your ambitions.'},
  master:{name:'Storm Monarch Kaal',style:'perfect',
    start:'Kneel now and the defeat will be merely total.',
    cap:'The storm takes what it wants.',
    loss:'You... walked through the storm. Remember this face.',
    win:'I am the last thing your strategy ever saw.'},
};
export const LEVEL_NAMES={easy:PERSONAS.easy.name,medium:PERSONAS.medium.name,hard:PERSONAS.hard.name,master:PERSONAS.master.name};

export function taunt(level,evt){
  const p=PERSONAS[level];
  if(!p)return null;
  return p[evt]||null;
}

const MAN=100,KING=190;

function evaluate(state){
  let s=0;
  const turn=state.turn;
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    const p=state.board[r][c];
    if(!p)continue;
    let v=p.king?KING:MAN;
    const adv=p.color===RED?SIZE-1-r:r;
    const centr=(3.5-Math.abs(c-3.5))+(3.5-Math.abs(r-3.5));
    if(p.king){
      v+=centr*1.5;
    }else{
      v+=adv*3.5+centr*.5;
      if(r===(p.color===RED?SIZE-1:0))v+=8;
    }
    s+=p.color===turn?v:-v;
  }
  return s;
}

const ord=ms=>ms.slice().sort((a,b)=>b.captures.length-a.captures.length);

function negamax(s,depth,alpha,beta,deadline,tick){
  const moves=legalMoves(s);
  if(!moves.length)return -100000;
  if(depth<=0)return evaluate(s);
  if(((++tick.n)&127)===0&&Date.now()>deadline)throw 0;
  let best=-1e9;
  for(const mv of ord(moves)){
    const v=-negamax(applyMove(s,mv),depth-1,-beta,-alpha,deadline,tick);
    if(v>best){
      best=v;
      if(v>alpha)alpha=v;
      if(alpha>=beta)break;
    }
  }
  return best;
}

export function chooseMove(state,level){
  const moves=legalMoves(state);
  if(!moves.length)return null;
  const cfg=LEVELS[level]||LEVELS.medium;
  if(cfg.random)return moves[Math.random()*moves.length|0];
  const deadline=Date.now()+cfg.time;
  const tick={n:0};
  let pool=[{mv:moves[0],v:0}];
  let bestList=[{mv:moves[0]}];
  try{
    for(let d=2;d<=cfg.depth;d++){
      let alpha=-1e9;
      const scored=[];
      for(const mv of ord(moves)){
        const v=-negamax(applyMove(state,mv),d-1,-1e9,-alpha,deadline,tick)
          +(cfg.noise?Math.random()*cfg.noise:0);
        scored.push({mv,v});
        if(v>alpha)alpha=v;
      }
      scored.sort((a,b)=>b.v-a.v);
      pool=scored;
      bestList=scored.filter(x=>x.v>=scored[0].v-1);
      if(tick.n>300000)break;
    }
  }catch(e){}
  return stylish(pool,level)||bestList[Math.random()*bestList.length|0].mv;
}

function stylish(pool,level){
  const style=(PERSONAS[level]||{}).style||'perfect';
  if(!pool.length)return null;
  const best=pool[0].v;
  if(style==='perfect')return pool[0].mv;
  const near=pool.filter(x=>x.v>=best-30);
  if(!near.length)return pool[0].mv;
  const picks=near.slice().sort((a,b)=>b.v-a.v);
  if(style==='reckless'){
    const caps=picks.filter(x=>x.mv.captures.length>0);
    const use=caps.length?caps:picks;
    const top=use[0],tie=use.filter(x=>x===top||x.v>=top.v-1);
    return tie[Math.random()*tie.length|0].mv;
  }
  if(style==='grinder'){
    const quiet=picks.filter(x=>x.mv.captures.length===0);
    const use=quiet.length&&picks[0].v-quiet[0].v<20?quiet:picks;
    return use[Math.random()*Math.min(3,use.length)|0].mv;
  }
  return picks[Math.random()*Math.min(3,picks.length)|0].mv;
}
