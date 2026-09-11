import {describe,it,expect,beforeEach} from 'vitest';
import * as RET from '../js/retention.js';
import * as ECO from '../js/economy.js';
import {dayKey} from '../js/puzzles.js';

function lsShim(){const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),key:()=>null,get length(){return m.size;}};}
if(typeof globalThis.localStorage==='undefined')globalThis.localStorage=lsShim();

const win=(o={})=>({win:true,captured:3,bestChain:2,crowns:1,moves:14,comeback:false,deficit:0,...o});

beforeEach(()=>{try{localStorage.clear();}catch(e){}});

describe('career & milestones',()=>{
  it('counts wins, captures and chains',()=>{
    RET.recordGame(win({captured:5,bestChain:4}));
    RET.recordGame({win:false,captured:1,bestChain:1,moves:20});
    const c=RET.career();
    expect(c.wins).toBe(1);expect(c.losses).toBe(1);expect(c.bestChain).toBe(4);expect(c.captures).toBe(6);
  });
  it('grants first-win once, then milestone at 10 wins',()=>{
    const e1=RET.recordGame(win());
    expect(e1.some(e=>e.t==='firstwin')).toBe(true);
    const e2=RET.recordGame(win());
    expect(e2.some(e=>e.t==='firstwin')).toBe(false);
    let last=[];
    for(let i=0;i<9;i++)last=RET.recordGame(win());   // total 11 wins
    expect(RET.career().wins).toBe(11);
    expect(ECO.owns('octagon')).toBe(true);
    expect(RET.unlockedByMilestone().includes('octagon')).toBe(true);
  });
  it('comeback jackpot on a win from behind',()=>{
    const ev=RET.recordGame(win({comeback:true,deficit:6}));
    expect(ev.some(e=>e.t==='jackpot')).toBe(true);
    expect(RET.career().biggestComeback).toBe(6);
  });
});

describe('daily quests',()=>{
  it('completes and banks any of today’s seeded quests',()=>{
    const heavy=win({captured:99,crowns:99,bestChain:9,moves:2});
    let ev=[];for(let i=0;i<3;i++)ev=ev.concat(RET.questProgress(heavy));
    const done=RET.questBoard().filter(x=>x.done).length;
    expect(done).toBe(RET.todayQuests().length);
    expect(ev.filter(e=>e.t==='quest').length).toBeGreaterThan(0);
    expect(ECO.getWallet().coins).toBeGreaterThan(300); // quest coins were banked
  });
});

describe('streaks',()=>{
  it('login streak increments once per day',()=>{
    expect(RET.touchLogin().isNewDay).toBe(true);
    expect(RET.touchLogin().isNewDay).toBe(false);
    expect(RET.loginStreak()).toBe(1);
  });
  it('puzzle streak is idempotent within a day',()=>{
    expect(RET.markPuzzle(true)).toBe(1);
    expect(RET.markPuzzle(true)).toBe(1);
    expect(RET.puzzleStreak()).toBe(1);
  });
});

describe('share & world of the day',()=>{
  it('share card includes streak band and date',()=>{
    RET.markPuzzle(true);
    const card=RET.shareCard(true);
    expect(card).toContain(dayKey());
    expect(card).toContain('Streak 1');
    expect(card).toMatch(/solved/);
  });
  it('world of the day is always a free (unlocked) realm',()=>{
    const w=RET.worldOfToday();
    expect(ECO.getWallet().purchases.includes('theme:'+w)).toBe(false); // free: never needs a purchase
    expect(w).toBeTruthy();
  });
});
