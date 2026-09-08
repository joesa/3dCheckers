let ctx=null,master=null,enabled=true;

function ac(){
  if(!ctx){
    const A=window.AudioContext||window.webkitAudioContext;
    if(!A)return null;
    ctx=new A();
    master=ctx.createGain();
    master.gain.value=.22;
    master.connect(ctx.destination);
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

export const sfx={
  setEnabled(b){enabled=b;},
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
};
