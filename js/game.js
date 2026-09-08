export const RED='red', BLACK='black', SIZE=8;

const DIRS={
  red:[[-1,-1],[-1,1]],
  black:[[1,-1],[1,1]],
  king:[[-1,-1],[-1,1],[1,-1],[1,1]],
};

const inB=(r,c)=>r>=0&&r<SIZE&&c>=0&&c<SIZE;
const clone=b=>b.map(row=>row.map(s=>s?{...s}:null));
const dirs=p=>p.king?DIRS.king:DIRS[p.color];
export const isPromo=(color,r)=>(color===RED&&r===0)||(color===BLACK&&r===SIZE-1);
export const sqName=([r,c])=>String.fromCharCode(97+c)+(SIZE-r);
export const movesEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function initialState(){
  const board=Array.from({length:SIZE},()=>Array(SIZE).fill(null));
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    if((r+c)%2!==1)continue;
    if(r<3)board[r][c]={color:BLACK,king:false};
    else if(r>4)board[r][c]={color:RED,king:false};
  }
  return {board,turn:RED,winner:null,moveNo:0};
}

function hasJump(sim,r,c,pw){
  for(const[dr,dc]of dirs(pw)){
    const mr=r+dr,mc=c+dc,lr=r+dr*2,lc=c+dc*2;
    if(!inB(lr,lc))continue;
    const mid=sim[mr][mc];
    if(mid&&mid.color!==pw.color&&!sim[lr][lc])return true;
  }
  return false;
}

function dfsJump(sim,r,c,pw,path,caps,out){
  for(const[dr,dc]of dirs(pw)){
    const mr=r+dr,mc=c+dc,lr=r+dr*2,lc=c+dc*2;
    if(!inB(lr,lc))continue;
    const mid=sim[mr][mc];
    if(!mid||mid.color===pw.color||sim[lr][lc])continue;
    const promoted=!pw.king&&isPromo(pw.color,lr);
    const sim2=clone(sim);
    sim2[mr][mc]=null;
    const np={color:pw.color,king:pw.king};
    sim2[lr][lc]=np;
    const npath=[...path,[lr,lc]],ncaps=[...caps,[mr,mc]];
    if(promoted||!hasJump(sim2,lr,lc,np))out.push({from:path[0],path:npath,captures:ncaps});
    else dfsJump(sim2,lr,lc,np,npath,ncaps,out);
  }
}

export function legalMoves(state,color=state.turn){
  const steps=[],chains=[];
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    const p=state.board[r][c];
    if(!p||p.color!==color)continue;
    for(const[dr,dc]of dirs(p)){
      const mr=r+dr,mc=c+dc;
      if(!inB(mr,mc))continue;
      const mid=state.board[mr][mc];
      if(!mid){steps.push({from:[r,c],path:[[r,c],[mr,mc]],captures:[]});}
      else if(mid.color!==color){
        const lr=r+dr*2,lc=c+dc*2;
        if(inB(lr,lc)&&!state.board[lr][lc]){
          const sim=clone(state.board);
          sim[r][c]=null;
          dfsJump(sim,r,c,p,[[r,c]],[],chains);
        }
      }
    }
  }
  return chains.length?chains:steps;
}

export function applyMove(state,move){
  const b=clone(state.board);
  const p=b[move.from[0]][move.from[1]];
  if(!p)throw new Error('move from empty square');
  b[move.from[0]][move.from[1]]=null;
  for(const[r,c]of move.captures)b[r][c]=null;
  const last=move.path[move.path.length-1];
  const promoted=!p.king&&isPromo(p.color,last[0]);
  b[last[0]][last[1]]={color:p.color,king:p.king||promoted};
  const next={board:b,turn:state.turn===RED?BLACK:RED,winner:null,moveNo:state.moveNo+1};
  if(legalMoves(next,next.turn).length===0)next.winner=state.turn;
  return next;
}

export function countPieces(board,color){
  let n=0;
  for(const row of board)for(const s of row)if(s&&s.color===color)n++;
  return n;
}
