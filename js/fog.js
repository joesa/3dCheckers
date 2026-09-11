/* Fog of War — hidden-information overlay on standard rules.
   A side only perceives squares within its own scouts: its pieces, the eight
   squares touching them, and the landing square of any capture it could make.
   Moves are still full-information internally; this only decides what a *viewer*
   is allowed to see. Client-authoritative, so it's honest for pass-and-play and
   solo-vs-the-machine; ranked play against humans would need a server that holds
   the hidden state (the same RPC seam used for correspondence). */
import {SIZE,RED} from './game.js';

const NBR=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const CAP=[[-2,-2],[-2,2],[2,-2],[2,2]];
const inB=(r,c)=>r>=0&&r<SIZE&&c>=0&&c<SIZE;

export function visibleSet(board,viewer){
  const v=Array.from({length:SIZE},()=>Array(SIZE).fill(false));
  const mark=(r,c)=>{if(inB(r,c))v[r][c]=true;};
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    const p=board[r][c];
    if(!p||p.color!==viewer)continue;
    mark(r,c);
    for(const[dr,dc]of NBR)mark(r+dr,c+dc);
    // reveal the landing square of a capture this piece threatens
    const dirs=p.king?NBR:(viewer===RED?[[-1,-1],[-1,1]]:[[1,-1],[1,1]]);
    for(const[dr,dc]of dirs){
      const mr=r+dr,mc=c+dc;
      if(!inB(mr,mc))continue;
      const mid=board[mr][mc];
      if(mid&&mid.color!==viewer){const lr=r+dr*2,lc=c+dc*2;const land=board[lr]?.[lc];if(inB(lr,lc)&&!land)mark(lr,lc);}
    }
  }
  return v;
}

// true if the viewer may see whatever is on that square (empty squares are always fine to draw)
export function canSee(v,r,c){return !v||(v[r]&&v[r][c]);}
