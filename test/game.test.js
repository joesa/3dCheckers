import { initialState, legalMoves, applyMove, countPieces, isPromo, sqName } from '../js/game.js';
import { RED, BLACK, SIZE } from '../js/game.js';

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function runTests() {
  console.log('Running Aether Draughts tests...\n');

  // Test 1: initialState
  const state = initialState();
  assert(countPieces(state.board, RED) === 12, 'Red pieces should be 12');
  assert(countPieces(state.board, BLACK) === 12, 'Black pieces should be 12');
  assert(state.turn === RED, 'Red should move first');
  console.log('✓ initialState tests passed');

  // Test 2: isPromo
  assert(isPromo(RED, 0) === true, 'Red at row 0 should be promotion');
  assert(isPromo(BLACK, SIZE - 1) === true, 'Black at last row should be promotion');
  assert(isPromo(RED, 1) === false, 'Red at row 1 should not be promotion');
  console.log('✓ isPromo tests passed');

  // Test 3: sqName
  assert(sqName([0, 0]) === 'a8', 'sqName [0,0] should be a8');
  assert(sqName([7, 7]) === 'h1', 'sqName [7,7] should be h1');
  console.log('✓ sqName tests passed');

  // Test 4: legalMoves initial position
  const redMoves = legalMoves(state, RED);
  assert(redMoves.length > 0, 'Red should have moves on first turn');
  const blackMoves = legalMoves(state, BLACK);
  assert(blackMoves.length > 0, 'Black should have moves on first turn');
  console.log('✓ legalMoves initial position tests passed');

  // Test 5: applyMove
  const move = redMoves[0];
  const nextState = applyMove(state, move);
  assert(nextState.turn === BLACK, 'Turn should switch to Black');
  assert(nextState.moveNo === 1, 'Move number should be 1');
  assert(nextState.winner === null, 'No winner yet');
  console.log('✓ applyMove tests passed');

  // Test 6: forced jumps
  const jumpState = initialState();
  jumpState.board[5][2] = { color: RED, king: false };
  jumpState.board[4][3] = { color: BLACK, king: false };
  jumpState.board[3][4] = null;
  const jumpMoves = legalMoves(jumpState, RED);
  const hasJump = jumpMoves.some(m => m.captures.length > 0);
  const hasStep = jumpMoves.some(m => m.captures.length === 0);
  assert(hasJump === true, 'Should have jump moves');
  assert(hasStep === false, 'Should not have step moves when jump available');
  console.log('✓ forced jumps tests passed');

  // Test 7: countPieces
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  board[0][1] = { color: RED, king: false };
  board[0][3] = { color: RED, king: true };
  board[1][2] = { color: BLACK, king: false };
  assert(countPieces(board, RED) === 2, 'Should count 2 red pieces');
  assert(countPieces(board, BLACK) === 1, 'Should count 1 black piece');
  console.log('✓ countPieces tests passed');

  console.log('\n✅ All tests passed!');
}

runTests();
