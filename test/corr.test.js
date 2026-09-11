import { describe, it, expect } from 'vitest';
import { initialState, legalMoves, applyMove, countPieces, RED, BLACK } from '../js/game.js';
import { corrState, sideColor } from '../js/corr.js';

function logFromMoves(moves) {
  return moves.map((m, i) => ({ seq: i + 1, color: i % 2 === 0 ? 'red' : 'black', move: m }));
}

describe('corr sideColor', () => {
  it('host is red, guest is black', () => {
    expect(sideColor('host')).toBe(RED);
    expect(sideColor('guest')).toBe(BLACK);
  });
});

describe('corrState replay', () => {
  it('rebuilding from a logged move list reproduces the live engine position', () => {
    let st = initialState();
    const played = [];
    for (let i = 0; i < 6 && !st.winner; i++) {
      const mv = legalMoves(st)[0];
      played.push(mv);
      st = applyMove(st, mv);
    }
    const game = { me_side: 'host', status: 'active', my_turn: false, moves: logFromMoves(played) };
    const rebuilt = corrState(game).state;
    expect(rebuilt.board).toEqual(st.board);
    expect(rebuilt.turn).toBe(st.turn);
    expect(rebuilt.moveNo).toBe(played.length);
  });

  it('maps my_side to the right colour and honours whose turn it is', () => {
    const game = { me_side: 'guest', status: 'active', my_turn: true, moves: [] };
    const s = corrState(game);
    expect(s.myColor).toBe(BLACK);
    expect(s.oppColor).toBe(RED);
    expect(s.myTurn).toBe(true);
    expect(s.over).toBe(false);
  });

  it('reports a finished game as over, winner derived from winner_uid', () => {
    const HOST = 'host-uid', GUEST = 'guest-uid';
    const game = { me_side: 'host', status: 'done', result: 'loss', my_turn: false,
      winner_uid: HOST, host_uid: HOST, guest_uid: GUEST, moves: [] };
    const s = corrState(game);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(RED);       // host (red) beat the resigning guest
    expect(s.myTurn).toBe(false);
  });

  it('a real game ending in a winner is reconstructed as over', () => {
    // bounded seeded self-play from the actual opening (forced captures guarantee material loss)
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let st = initialState();
    const played = [];
    while (!st.winner && played.length < 2000) {
      const opts = legalMoves(st);
      if (!opts.length) break;
      const mv = opts[Math.floor(rnd() * opts.length) % opts.length];
      played.push(mv);
      st = applyMove(st, mv);
    }
    expect(st.winner).toBeTruthy();
    const game = { me_side: 'host', status: 'done', my_turn: false, moves: logFromMoves(played) };
    const s = corrState(game);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(st.winner);
    expect(s.state.board).toEqual(st.board);
  });

  it('survives a corrupt/truncated log by stopping at the last legal move', () => {
    const st = initialState();
    const mv = legalMoves(st)[0];
    const game = { me_side: 'host', status: 'active', my_turn: true,
      moves: [{ seq: 1, color: 'red', move: mv }, { seq: 2, color: 'black', move: { from: [99, 99], path: [[99, 99]], captures: [] } }] };
    const s = corrState(game);
    expect(s.state.board).toEqual(applyMove(st, mv).board); // only move 1 applied
    expect(s.state.turn).toBe(BLACK);
  });
});
