let tweens=[];

export function addTween(dur,onUpdate,onDone=null,ease=easeInOutQuad){
  const t={t:0,dur,onUpdate,onDone,ease};
  tweens.push(t);
  return t;
}

export function cancelTween(t){
  const i=tweens.indexOf(t);
  if(i>=0)tweens.splice(i,1);
}

export function after(dur,fn){return addTween(dur,()=>{},fn,()=>0);}

export function stepTweens(dt){
  const list=tweens.slice();
  for(const t of list){
    const i=tweens.indexOf(t);
    if(i<0)continue;
    t.t+=dt;
    let p=Math.min(t.t/t.dur,1);
    t.onUpdate(t.ease(p));
    if(p>=1){
      tweens.splice(tweens.indexOf(t),1);
      if(t.onDone)t.onDone();
    }
  }
}

export const easeInOutQuad=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
export const easeOutQuad=t=>1-(1-t)*(1-t);
export const easeInQuad=t=>t*t;
export const easeOutBack=t=>{const c=1.70158,c3=c+1;return 1+c3*Math.pow(t-1,3)+c*Math.pow(t-1,2);};
export const easeOutElastic=t=>{
  if(t===0||t===1)return t;
  const c=(2*Math.PI)/3;
  return Math.pow(2,-10*t)*Math.sin((t*10-.75)*c)+1;
};
