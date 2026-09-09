import {dayKey} from './puzzles.js';

export const GAUNTLET_ROUNDS=[
  {lv:'easy',mod:null,label:'The Squire mocks you'},
  {lv:'medium',mod:'blazing',label:'Blazing — 15s per move'},
  {lv:'medium',mod:'attrition',label:'Attrition — first to seize 6 pieces'},
  {lv:'hard',mod:'royal',label:"King's Rush — first crown wins"},
  {lv:'master',mod:null,label:'The Storm Monarch awaits'},
];

export function gauntletState(){
  try{
    const raw=JSON.parse(localStorage.getItem('ad-gauntlet')||'null');
    if(raw&&raw.date)return raw;
  }catch(e){}
  return {date:dayKey(),cleared:0,streak:0};
}
export function saveGauntlet(s){try{localStorage.setItem('ad-gauntlet',JSON.stringify(s));}catch(e){}}

export function rollDaily(dateStr){
  let s=gauntletState();
  const y=dayKey(new Date(Date.parse(dateStr)+864e5));
  if(s.date!==dateStr){
    if(s.cleared>=GAUNTLET_ROUNDS.length)s={date:dateStr,cleared:0,streak:s.streak+1};
    else s={date:dateStr,cleared:0,streak:0};
  }
  if(![0,1,2,3,4].includes(s.cleared))s.cleared=0;
  return s;
}

export function roundReward(roundIdx){return 30+roundIdx*20;}
export function clearReward(){return 150;}
