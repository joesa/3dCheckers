import { describe, it, expect } from 'vitest';
import { SIZE, RED, BLACK } from '../js/game.js';
import { visibleSet } from '../js/fog.js';

function empty(){return Array.from({length:SIZE},()=>Array(SIZE).fill(null));}
function put(b,r,c,color,king=false){b[r][c]={color,king};return b;}

describe('fog visibleSet', () => {
  it('reveals a piece, its own square and the eight touching squares', () => {
    const b = empty(); put(b,5,2,RED);
    const v = visibleSet(b,RED);
    expect(v[5][2]).toBe(true);            // own piece
    expect(v[4][1]).toBe(true);            // diagonal scout
    expect(v[4][2]).toBe(true);            // orthogonal scout
    expect(v[6][3]).toBe(true);            // diagonal scout
    expect(v[2][5]).toBe(false);           // far away
  });

  it('hides enemy pieces beyond the vision ring', () => {
    const b = empty(); put(b,5,2,RED); put(b,1,3,BLACK);
    const v = visibleSet(b,RED);
    expect(v[1][3]).toBe(false);           // distant enemy unseen
  });

  it('reveals the landing square of a capture a visible piece threatens', () => {
    const b = empty();
    put(b,5,2,RED);        // mover
    put(b,4,3,BLACK);      // adjacent, captured
    // landing [3][4] is 2-away, outside the 8-ring; it must still be visible
    const v = visibleSet(b,RED);
    expect(v[4][3]).toBe(true);            // the victim (adjacent)
    expect(v[3][4]).toBe(true);            // capture landing revealed
  });

  it('only reveals what the viewer side can sense', () => {
    const b = empty(); put(b,5,2,RED); put(b,5,4,BLACK);
    expect(visibleSet(b,BLACK)[5][2]).toBe(false); // red is far from black's scouts
    expect(visibleSet(b,BLACK)[5][4]).toBe(true);
    expect(visibleSet(b,RED)[5][2]).toBe(true);
  });

  it('initial position hides the far enemy camp from each side', () => {
    const board = Array.from({length:SIZE},()=>Array(SIZE).fill(null));
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      if((r+c)%2!==1)continue;
      if(r<3)board[r][c]={color:BLACK,king:false};
      else if(r>4)board[r][c]={color:RED,king:false};
    }
    const v = visibleSet(board,RED);
    expect(v[7][0]).toBe(true);            // red's own back row
    expect(v[0][1]).toBe(false);           // black's far back rank is shrouded
    expect(v[0][3]).toBe(false);
  });
});
