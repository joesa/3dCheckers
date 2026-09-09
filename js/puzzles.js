import {RED,BLACK,SIZE,legalMoves,applyMove} from './game.js';

export function dayKey(d=new Date()){
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
}
function hash32(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
function mulberry32(a){
  return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}

function emptyBoard(){return Array.from({length:SIZE},()=>Array(SIZE).fill(null));}

export function bestCaptureCount(state){
  const ms=legalMoves(state);
  let n=0;
  for(const m of ms)n=Math.max(n,m.captures.length);
  return n;
}

export function generatePuzzle(dateStr){
  for(let attempt=0;attempt<4000;attempt++){
    const rng=mulberry32((hash32(dateStr)^(Math.imul(attempt+1,2654435761)))>>>0);
    const board=emptyBoard();
    const dark=[];
    for(let r=1;r<SIZE-1;r++)for(let c=0;c<SIZE;c++)if((r+c)%2===1)dark.push([r,c]);
    const redN=3+Math.floor(rng()*3);
    const blkN=3+Math.floor(rng()*4);
    const cells=dark.slice();
    for(let i=cells.length-1;i>0;i--){const j=rng()*(i+1)|0;[cells[i],cells[j]]=[cells[j],cells[i]];}
    let ok=true;
    for(let i=0;i<redN&&cells.length;i++){const[r,c]=cells.pop();board[r][c]={color:RED,king:rng()<.3};}
    for(let i=0;i<blkN&&cells.length;i++){const[r,c]=cells.pop();board[r][c]={color:BLACK,king:rng()<.15};}
    if(!ok)continue;
    const state={board,turn:RED,winner:null,moveNo:0};
    const moves=legalMoves(state);
    if(!moves.length||!moves[0].captures.length)continue;
    let max=0,solCount=0,sol=null;
    for(const m of moves){
      if(m.captures.length>max){max=m.captures.length;solCount=1;sol=m;}
      else if(m.captures.length===max)solCount++;
    }
    if(max<3||solCount!==1)continue;
    const after=applyMove(state,sol);
    if(after.winner)continue;
    return {state,solution:sol,target:max,date:dateStr};
  }
  return null;
}

export function puzzleEval(move){return move.captures.length;}
