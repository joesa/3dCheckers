/* Correspondence client-side reconstruction.
   The server stores only the append-only move log; the engine is deterministic,
   so replaying every logged move over the opening position rebuilds the exact
   board the opponent left. Keeping this pure (no network, no DOM) lets it be
   unit-tested against the same engine that produced the moves. */
import {initialState, applyMove, RED, BLACK} from './game.js';

export function sideColor(side){return side==='host'?RED:BLACK;}

export function corrState(game){
  let st=initialState();
  const moves=(game&&game.moves)||[];
  for(const m of moves){
    try{st=applyMove(st,m.move);}
    catch(e){break;}
  }
  const myColor=sideColor(game&&game.me_side);
  const oppColor=myColor===RED?BLACK:RED;
  let winner=st.winner||null;
  if(!winner&&game&&game.winner_uid&&game.host_uid)
    winner=game.winner_uid===game.host_uid?RED:BLACK;
  const over=!!winner||game.status==='done';
  return {
    state:st,
    myColor,
    oppColor,
    winner,
    over,
    myTurn:!!(game&&game.my_turn)&&!winner&&game.status==='active',
    oppName:(game&&game.opp_name)||'rival',
    status:(game&&game.status)||'active',
  };
}
