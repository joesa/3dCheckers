// Which account owns the local asset caches right now, and where to mirror them.
// 'guest' keeps the legacy unscoped keys so pre-account progress is never lost.

export const GUEST='guest';
let scope=GUEST,sinks={};

export function currentScope(){return scope;}
export function keyFor(base){return scope===GUEST?base:base+':'+scope;}
export function keyOf(base,who){return who?base+':'+who:base;}

export function bind(uid,newSinks){
  scope=uid||GUEST;
  sinks=newSinks||{};
}

export function reset(){
  scope=GUEST;
  sinks={};
}

export function emit(kind,payload){
  const f=sinks[kind];
  if(f)f(payload);
}
