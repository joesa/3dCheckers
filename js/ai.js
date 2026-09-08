import {legalMoves,applyMove,RED,BLACK,SIZE} from './game.js';

export const LEVELS={
  easy:{random:true},
  medium:{depth:3,time:160,noise:40},
  hard:{depth:6,time:450,noise:8},
  master:{depth:9,time:950,noise:0},
};
export const LEVEL_NAMES={easy:'Squire',medium:'Knight',hard:'Warlock',master:'Storm Monarch'};

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
      bestList=scored.filter(x=>x.v>=scored[0].v-1);
      if(tick.n>300000)break;
    }
  }catch(e){}
  return bestList[Math.random()*bestList.length|0].mv;
}
