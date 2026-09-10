import { describe, it, expect } from 'vitest';
import {
  initialState, legalMoves, applyMove, countPieces, isPromo, sqName,
  RED, BLACK, SIZE,
} from '../js/game.js';

describe('initialState', () => {
  it('deals 12 pieces to each side', () => {
    const state = initialState();
    expect(countPieces(state.board, RED)).toBe(12);
    expect(countPieces(state.board, BLACK)).toBe(12);
  });

  it('gives Red the first move', () => {
    expect(initialState().turn).toBe(RED);
  });
});

describe('isPromo', () => {
  it('promotes Red on row 0 and Black on the last row', () => {
    expect(isPromo(RED, 0)).toBe(true);
    expect(isPromo(BLACK, SIZE - 1)).toBe(true);
  });

  it('does not promote short of the far row', () => {
    expect(isPromo(RED, 1)).toBe(false);
  });
});

describe('sqName', () => {
  it('maps board coordinates to algebraic squares', () => {
    expect(sqName([0, 0])).toBe('a8');
    expect(sqName([7, 7])).toBe('h1');
  });
});

describe('legalMoves', () => {
  it('offers moves to both colours from the opening position', () => {
    const state = initialState();
    expect(legalMoves(state, RED).length).toBeGreaterThan(0);
    expect(legalMoves(state, BLACK).length).toBeGreaterThan(0);
  });

  it('forces the jump when one is available', () => {
    const state = initialState();
    state.board[5][2] = { color: RED, king: false };
    state.board[4][3] = { color: BLACK, king: false };
    state.board[3][4] = null;

    const moves = legalMoves(state, RED);
    expect(moves.some(m => m.captures.length > 0)).toBe(true);
    expect(moves.some(m => m.captures.length === 0)).toBe(false);
  });
});

describe('applyMove', () => {
  it('passes the turn and advances the move counter', () => {
    const state = initialState();
    const next = applyMove(state, legalMoves(state, RED)[0]);
    expect(next.turn).toBe(BLACK);
    expect(next.moveNo).toBe(1);
    expect(next.winner).toBeNull();
  });
});

describe('countPieces', () => {
  it('counts men and kings per colour', () => {
    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    board[0][1] = { color: RED, king: false };
    board[0][3] = { color: RED, king: true };
    board[1][2] = { color: BLACK, king: false };

    expect(countPieces(board, RED)).toBe(2);
    expect(countPieces(board, BLACK)).toBe(1);
  });
});
