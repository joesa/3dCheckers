let ctx=null,master=null,enabled=true;
let musicGain=null,musicOn=false,mTimer=null,mStep=0,mNext=0,mUnlocked=false;
const MUSIC_LEVEL=.5;

function ac(){
  if(!ctx){
    const A=window.AudioContext||window.webkitAudioContext;
    if(!A)return null;
    ctx=new A();
    master=ctx.createGain();
    master.gain.value=.22;
    master.connect(ctx.destination);
    musicGain=ctx.createGain();
    musicGain.gain.value=0;
    musicGain.connect(ctx.destination);
  }
  if(ctx.state==='suspended')ctx.resume();
  return ctx;
}

function tone(f,{dur=.15,type='sine',g=.6,slide=0,delay=0}={}){
  const c=ac();if(!c||!enabled)return;
  const t0=c.currentTime+delay;
  const o=c.createOscillator(),gn=c.createGain();
  o.type=type;
  o.frequency.setValueAtTime(f,t0);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t0+dur);
  gn.gain.setValueAtTime(0,t0);
  gn.gain.linearRampToValueAtTime(g,t0+.012);
  gn.gain.exponentialRampToValueAtTime(.001,t0+dur);
  o.connect(gn).connect(master);
  o.start(t0);o.stop(t0+dur+.05);
}

function noise({dur=.2,f=1200,q=1,g=.6,delay=0}={}){
  const c=ac();if(!c||!enabled)return;
  const t0=c.currentTime+delay;
  const len=Math.max(1,Math.floor(c.sampleRate*dur));
  const buf=c.createBuffer(1,len,c.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  const src=c.createBufferSource();src.buffer=buf;
  const bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;
  const gn=c.createGain();
  gn.gain.setValueAtTime(g,t0);
  gn.gain.exponentialRampToValueAtTime(.001,t0+dur);
  src.connect(bp).connect(gn).connect(master);
  src.start(t0);
}

/* ---------------- ambient background music (procedural, asset-free) ---------------- */
const PROG=[
  [110.00,[220.00,261.63,329.63]],  // Am · A2  A3 C4 E4
  [ 87.31,[174.61,220.00,261.63]],  // F  · F2  F3 A3 C4
  [130.81,[196.00,261.63,329.63]],  // C  · C3  G3 C4 E4
  [ 98.00,[196.00,246.94,293.66]],  // G  · G2  G3 B3 D4
];
const STEP=(60/58)/2;               // eighth-note seconds (58 BPM)

function mVoice(freq,t,dur,{type='sine',peak=.05,attack=.4}={}){
  if(!ctx||!musicGain)return;
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);
  o.detune.setValueAtTime(Math.random()*8-4,t);
  g.gain.setValueAtTime(.0001,t);
  g.gain.linearRampToValueAtTime(peak,t+attack);
  g.gain.setValueAtTime(peak,t+Math.max(attack+.05,dur*.55));
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g).connect(musicGain);
  o.start(t);o.stop(t+dur+.1);
}
function mStepTick(step,t){
  const [bass,chord]=PROG[(step/8|0)%PROG.length];
  const beat=step%8, barLen=STEP*8;
  if(beat===0){
    mVoice(bass,t,barLen,{type:'sine',peak:.09,attack:1.1});
    for(const f of chord)mVoice(f,t,barLen,{type:'triangle',peak:.045,attack:barLen*.4});
  }
  if(beat%2===0&&Math.random()<.68){
    const pool=[...chord,...chord.map(f=>f*2)];
    mVoice(pool[Math.random()*pool.length|0],t,STEP*1.7,{type:'sine',peak:.05,attack:.02});
  }
}
function mTick(){
  if(!ctx||!musicOn)return;
  const ahead=ctx.currentTime+.35;
  while(mNext<ahead){mStepTick(mStep,mNext);mStep=(mStep+1)%(8*PROG.length);mNext+=STEP;}
}
function mStart(){
  const c=ac();if(!c||musicOn)return;
  musicOn=true;mStep=0;mNext=c.currentTime+.15;
  mTimer=setInterval(mTick,60);
}
function mStop(){musicOn=false;if(mTimer){clearInterval(mTimer);mTimer=null;}}
function applyMusic(){
  const c=ac();if(!c||!musicGain)return;
  const on=enabled&&mUnlocked;
  musicGain.gain.cancelScheduledValues(c.currentTime);
  musicGain.gain.setTargetAtTime(on?MUSIC_LEVEL:0,c.currentTime,.9);
  on?mStart():mStop();
}

export const music={
  begin(){mUnlocked=true;applyMusic();},   // call on the first user gesture (unlocks autoplay policy)
  setEnabled(b){enabled=b;applyMusic();},
  suspend(){if(mTimer){clearInterval(mTimer);mTimer=null;}musicOn=false;},
  resume(){if(enabled&&mUnlocked&&!musicOn)mStart();},
  get enabled(){return enabled;},
  get playing(){return musicOn&&mUnlocked&&enabled;},
};

export const sfx={
  setEnabled(b){enabled=b;applyMusic();},
  get enabled(){return enabled;},
  click(){tone(520,{dur:.06,type:'triangle',g:.4});},
  select(){tone(660,{dur:.09,type:'triangle',g:.5});tone(880,{dur:.1,type:'triangle',g:.3,delay:.04});},
  move(){tone(300,{dur:.12,type:'sine',g:.5,slide:180});},
  jump(){tone(240,{dur:.22,type:'sine',g:.55,slide:420});noise({dur:.1,f:3000,g:.12});},
  grab(){tone(500,{dur:.08,type:'triangle',g:.35,slide:250});},
  capture(combo=1){
    const m=1+(combo-1)*.28;
    noise({dur:.25,f:700*m,q:.7,g:.8});
    tone(130*m,{dur:.25,type:'square',g:.35,slide:-70});
  },
  crown(){[523,659,784,1047].forEach((f,i)=>tone(f,{dur:.3,type:'triangle',g:.45,delay:i*.09}));},
  win(){[523,659,784,1047,1319].forEach((f,i)=>tone(f,{dur:.5,type:'triangle',g:.5,delay:i*.12}));},
  lose(){[392,330,262,196].forEach((f,i)=>tone(f,{dur:.4,type:'sawtooth',g:.22,delay:i*.16}));},
  error(){tone(180,{dur:.2,type:'square',g:.3,slide:-60});},
  join(){tone(440,{dur:.15,type:'sine',g:.5});tone(660,{dur:.25,type:'sine',g:.5,delay:.12});},
  tick(){tone(980,{dur:.05,type:'sine',g:.25});},
  bell(){tone(1568,{dur:.38,type:'triangle',g:.3});tone(2349,{dur:.26,type:'sine',g:.15});noise({dur:.05,f:5200,g:.08});},
};
