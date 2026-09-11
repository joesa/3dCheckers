export const CONTROLS={
  none:{name:'No Clock',base:0,inc:0},
  bullet:{name:'Bullet 1+0',base:60,inc:0},
  blitz:{name:'Blitz 5+3',base:300,inc:3},
  rapid:{name:'Rapid 10+5',base:600,inc:5},
  classic:{name:'Classic 30+0',base:1800,inc:0},
  correspondence:{name:'Correspondence (1/day)',base:0,inc:0,corr:true},
};

export class Clocks{
  constructor(ctrlId){
    const c=CONTROLS[ctrlId]||CONTROLS.none;
    this.id=CONTROLS[ctrlId]?ctrlId:'none';
    this.name=c.name;
    this.on=c.base>0;
    this.inc=c.inc;
    this.t={red:c.base,black:c.base};
    this.side=null;
    this.flagged=null;
    this.paused=true;
    this._lastBeep=-1;
  }
  reset(){this.t={red:this.t.red,black:this.t.black};}
  init(){const c=CONTROLS[this.id];this.t={red:c.base,black:c.base};this.flagged=null;this.paused=false;}
  commit(mover){if(this.on&&!this.flagged&&mover)this.t[mover]+=this.inc;}
  tick(dt){
    if(!this.on||this.paused||!this.side||this.flagged)return null;
    this.t[this.side]-=dt;
    if(this.t[this.side]<=0){this.t[this.side]=0;this.flagged=this.side;return this.side;}
    return null;
  }
  beepSecond(now10){
    if(this._lastBeep===now10)return false;
    this._lastBeep=now10;return true;
  }
  fmt(side){
    let s=Math.max(0,this.t[side]);
    if(s>=20)return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
    return s<10?s.toFixed(1):Math.ceil(s)+'';
  }
}
