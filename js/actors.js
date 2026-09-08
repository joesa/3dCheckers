import * as THREE from 'three';
import {TEAM_COLORS} from './pieces.js';

const UP=new THREE.Vector3(0,1,0);
const _v=new THREE.Vector3();

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

const SKINS=[0xf2c9a0,0xe0ac69,0xc68642,0x8d5524,0xffdbac,0x6b4226,0x3d2817,0xd9a066];
const HAIRS=[0x14141a,0x4a2c11,0x9c6b30,0xc9c9d2,0x6b1f1f,0x2e2e57,0x0e0e12,0x7a4a2a];
const BONE=0xd8cbb2;

const shift=(c,dh,ds,dl)=>{
  const hsl={h:0,s:0,l:0};
  new THREE.Color(c).getHSL(hsl);
  return new THREE.Color().setHSL((hsl.h+dh+1)%1,
    THREE.MathUtils.clamp(hsl.s+ds,0,1),
    THREE.MathUtils.clamp(hsl.l+dl,0,1));
};

export function makeAvatar(color,facing=0,seed=Math.random()*1e9|0){
  const rng=mulberry32(seed);
  const C=TEAM_COLORS[color];
  const group=new THREE.Group();
  const rigG=new THREE.Group();
  rigG.rotation.y=facing;
  group.add(rigG);

  const robeMat=new THREE.MeshStandardMaterial({color:shift(C.dark,(rng()-.5)*.1,(rng()-.5)*.2,(rng()-.5)*.12),roughness:.55,metalness:.15});
  const trimMat=new THREE.MeshStandardMaterial({color:C.body,roughness:.35,metalness:.4,emissive:C.glow,emissiveIntensity:.45});
  const woodMat=new THREE.MeshStandardMaterial({color:shift(0x5b4330,(rng()-.5)*.04,0,(rng()-.5)*.1),roughness:.78});
  const skinCol=SKINS[rng()*SKINS.length|0];
  const hairCol=HAIRS[rng()*HAIRS.length|0];

  /* throne */
  const chair=new THREE.Group();
  const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
  const seat=new THREE.Mesh(box(1.25,.14,1.15),woodMat);seat.position.set(0,.38,0);
  const back=new THREE.Mesh(box(1.25,1.5,.13),woodMat);back.position.set(0,.98,-.56);back.rotation.x=-.1;
  const cushion=new THREE.Mesh(box(1.05,.1,.92),trimMat);cushion.position.set(0,.49,.02);
  const backCush=new THREE.Mesh(box(1,.95,.08),trimMat);backCush.position.set(0,.92,-.49);
  const armL=new THREE.Mesh(box(.13,.11,.95),woodMat);armL.position.set(-.62,.78,-.02);
  const armR=new THREE.Mesh(box(.13,.11,.95),woodMat);armR.position.set(.62,.78,-.02);
  const postL=new THREE.Mesh(box(.1,.4,.1),woodMat);postL.position.set(-.62,.56,.35);
  const postR=new THREE.Mesh(box(.1,.4,.1),woodMat);postR.position.set(.62,.56,.35);
  const finial=new THREE.Mesh(new THREE.SphereGeometry(.1,12,10),trimMat);finial.position.set(0,1.74,-.58);
  chair.add(seat,back,cushion,backCush,armL,armR,postL,postR,finial);
  for(let i=0;i<4;i++){
    const leg=new THREE.Mesh(box(.11,.38,.11),woodMat);
    leg.position.set(i%2?.52:-.52,.19,i<2?.48:-.48);
    chair.add(leg);
  }
  chair.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  rigG.add(chair);

  /* body */
  const robH=1.55+rng()*.4;
  const robR=.6+rng()*.22;
  const lift=.42;
  const robe=new THREE.Mesh(new THREE.ConeGeometry(robR,robH,16),robeMat);
  robe.position.y=lift+robH/2-.02;robe.castShadow=true;
  const collar=new THREE.Mesh(new THREE.TorusGeometry(robR*.42,.065,10,20),trimMat);
  collar.rotation.x=Math.PI/2;collar.position.y=lift+robH-.26;
  rigG.add(robe,collar);

  const head=new THREE.Group();
  const face=new THREE.Mesh(new THREE.SphereGeometry(.24,18,14),new THREE.MeshStandardMaterial({color:skinCol,roughness:.85}));
  face.castShadow=true;
  const eyeMat=new THREE.MeshBasicMaterial({color:C.glow});
  const eL=new THREE.Mesh(new THREE.SphereGeometry(.042,8,8),eyeMat);eL.position.set(-.085,.03,.215);
  const eR=eL.clone();eR.position.x=.085;
  head.add(face,eL,eR);
  const hairMat=new THREE.MeshStandardMaterial({color:hairCol,roughness:.9});
  const design=rng()*6|0;
  if(design===0){
    const hood=new THREE.Mesh(new THREE.SphereGeometry(.3,16,12),robeMat);
    hood.scale.set(1,.95,1);hood.position.set(0,.05,-.07);hood.castShadow=true;
    head.add(hood);
  }else if(design===1){
    const brim=new THREE.Mesh(new THREE.TorusGeometry(.32,.05,8,22),robeMat);
    brim.rotation.x=Math.PI/2;brim.position.y=.19;
    const hat=new THREE.Mesh(new THREE.ConeGeometry(.24,.6,14),robeMat);
    hat.position.y=.48;hat.castShadow=true;
    const band=new THREE.Mesh(new THREE.TorusGeometry(.19,.035,8,18),trimMat);
    band.rotation.x=Math.PI/2;band.position.y=.24;
    head.add(brim,hat,band);
  }else if(design===2){
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.252,16,12,0,Math.PI*2,0,Math.PI/2),hairMat);
    cap.scale.set(1,.85,1);cap.position.y=.04;
    const bun=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),hairMat);
    bun.position.set(0,.28,-.05);
    head.add(cap,bun);
  }else if(design===3){
    const hornG=new THREE.ConeGeometry(.055,.3,8);
    const hL=new THREE.Mesh(hornG,new THREE.MeshStandardMaterial({color:BONE,roughness:.6}));
    hL.position.set(-.18,.22,0);hL.rotation.z=.9;
    const hR=hL.clone();hR.position.x=.18;hR.rotation.z=-.9;
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.25,16,12,0,Math.PI*2,0,Math.PI/2),hairMat);
    cap.position.y=.05;
    head.add(cap,hL,hR);
  }else if(design===4){
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.3,.035,8,24),
      new THREE.MeshStandardMaterial({color:C.glow,emissive:C.glow,emissiveIntensity:1.6,roughness:.3}));
    halo.rotation.x=Math.PI/2;halo.position.y=.42;
    const beard=new THREE.Mesh(new THREE.ConeGeometry(.14,.34,10),hairMat);
    beard.position.set(0,-.18,.14);beard.rotation.x=.25;
    head.add(halo,beard);
  }else{
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.256,16,12,0,Math.PI*2,0,Math.PI/2),hairMat);
    cap.scale.set(1.04,.62,1.04);cap.position.y=.09;
    const brim=new THREE.Mesh(new THREE.BoxGeometry(.34,.03,.22),hairMat);
    brim.position.set(0,.13,.2);
    head.add(cap,brim);
  }
  head.position.y=lift+robH+.1;
  rigG.add(head);

  const shoulderY=Math.min(1.5,lift+robH-.42);
  function makeArm(sx){
    const a={};
    a.shoulder=new THREE.Object3D();
    a.shoulder.position.set(sx,shoulderY,.08);
    rigG.add(a.shoulder);
    a.sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.07,.16,1,8),robeMat);
    a.sleeve.position.y=.5;
    a.shoulder.add(a.sleeve);
    a.hand=new THREE.Group();
    const palm=new THREE.Mesh(new THREE.SphereGeometry(.16,12,10),trimMat);
    palm.castShadow=true;
    a.hand.add(palm);
    a.fingers=[];
    const fingerGeo=new THREE.ConeGeometry(.05,.17,6);
    for(let i=0;i<3;i++){
      const f=new THREE.Mesh(fingerGeo,trimMat);
      f.position.set((i-1)*.1,-.16,.05);
      f.rotation.x=Math.PI;
      a.hand.add(f);
      a.fingers.push(f);
    }
    rigG.add(a.hand);
    a.rest=new THREE.Vector3(sx*.75,shoulderY-.5,.6);
    a.target=a.rest.clone();
    a.cur=a.rest.clone();
    a.grip=0;
    return a;
  }
  const hand=makeArm(.58),offArm=makeArm(-.58);

  const focus=new THREE.Vector3(0,1.4,4);
  const focusTarget=new THREE.Vector3(0,1.4,4);
  const scratch=new THREE.Vector3();
  let t=rng()*10;

  function toLocal(v){
    rigG.updateWorldMatrix(true,false);
    scratch.set(v.x,v.y,v.z);
    return rigG.worldToLocal(scratch);
  }

  function update(dt){
    t+=dt;
    robe.scale.y=1+Math.sin(t*1.8)*.02;
    focus.lerp(focusTarget,1-Math.pow(.01,dt));
    head.lookAt(focus);
    for(const a of[hand,offArm]){
      a.cur.lerp(a.target,1-Math.pow(.0004,dt));
      a.hand.position.set(a.cur.x,a.cur.y-a.grip*.09,a.cur.z);
      _v.copy(a.cur).sub(a.shoulder.position);
      const len=Math.max(.01,_v.length());
      a.sleeve.scale.y=len;
      a.sleeve.quaternion.setFromUnitVectors(UP,_v.normalize());
      a.grip=Math.max(0,a.grip-dt*2.2);
      a.hand.scale.setScalar(1+a.grip*.3);
      a.hand.rotation.x=.2+a.grip*.9;
      for(const f of a.fingers){
        f.rotation.x=Math.PI+a.grip*.65;
        f.position.z=.05-a.grip*.055;
      }
    }
  }

  const rig={
    reach(v){hand.target.copy(toLocal(v));},
    follow(v){hand.target.copy(toLocal(v));},
    grab(){hand.grip=1;},
    release(){hand.grip=.7;hand.target.copy(hand.rest);},
    rest(){hand.target.copy(hand.rest);},
    focusOn(v){focusTarget.copy(v);},
    handWorld(){return hand.hand.getWorldPosition(new THREE.Vector3());},
  };
  return {group,update,rig};
}

const angDiff=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

export function makeCrowd(seed=Math.random()*1e9|0){
  const rng=mulberry32(seed);
  const group=new THREE.Group();
  const people=[];
  const pillars=[Math.PI/4,3*Math.PI/4,-3*Math.PI/4,-Math.PI/4];
  const clusters=[
    [Math.PI/2,.66,7,6.7,7.5],
    [-Math.PI/2,.66,7,6.7,7.5],
    [0,.52,4,6.5,7.4],
    [Math.PI,.52,4,6.5,7.4],
  ];
  let placed=0;
  for(const[ca,hw,n,r0,r1]of clusters){
    let done=0,tries=0;
    while(done<n&&placed<22&&tries++<n*6){
      const a=ca+(rng()*2-1)*hw;
      if(pillars.some(p=>angDiff(a,p)<.3))continue;
      const r=r0+rng()*(r1-r0);
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
    const skinCol=SKINS[rng()*SKINS.length|0];
    const hairCol=HAIRS[rng()*HAIRS.length|0];
    const cloth=new THREE.Color().setHSL(rng(),.3+rng()*.45,.26+rng()*.32);
    const top=new THREE.Color().setHSL(rng(),.3+rng()*.45,.34+rng()*.3);
    const clothMat=new THREE.MeshStandardMaterial({color:cloth,roughness:.85});
    const topMat=new THREE.MeshStandardMaterial({color:top,roughness:.85});
    const skinMat=new THREE.MeshStandardMaterial({color:skinCol,roughness:.85});
    const hairMat=new THREE.MeshStandardMaterial({color:hairCol,roughness:.9});

    const fig=new THREE.Group();
    const type=rng()*4|0;
    const headR=.14+rng()*.06;
    const armPivots=[];
    let bodyTop;
    if(type===0){
      const h=.75+rng()*.28,rr=.24+rng()*.1;
      const dress=new THREE.Mesh(new THREE.ConeGeometry(rr,h,12),clothMat);
      dress.position.y=h/2;
      bodyTop=h;
      fig.add(dress);
    }else if(type===1){
      const h=.78+rng()*.24;
      const body=new THREE.Mesh(new THREE.CylinderGeometry(.14,.17,h,10),topMat);
      body.position.y=h/2;
      const skirt=new THREE.Mesh(new THREE.CylinderGeometry(.17,.21,.3,10),clothMat);
      skirt.position.y=.15;
      bodyTop=h;
      fig.add(body,skirt);
    }else if(type===2){
      const h=.6+rng()*.16,rr=.3+rng()*.08;
      const stocky=new THREE.Mesh(new THREE.ConeGeometry(rr,h,12),topMat);
      stocky.position.y=h/2;
      bodyTop=h;
      fig.add(stocky);
    }else{
      const skirt=new THREE.Mesh(new THREE.ConeGeometry(.27,.34,12),clothMat);
      skirt.position.y=.17;
      const tunic=new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,.5,10),topMat);
      tunic.position.y=.55;
      bodyTop=.82;
      fig.add(skirt,tunic);
    }
    const hd=new THREE.Mesh(new THREE.SphereGeometry(headR,12,10),skinMat);
    hd.position.y=bodyTop+headR*.8;
    fig.add(hd);
    if(rng()<.82){
      const cap=new THREE.Mesh(new THREE.SphereGeometry(headR*1.06,12,10,0,Math.PI*2,0,Math.PI/2),hairMat);
      cap.scale.set(1,.7,1);
      cap.position.y=bodyTop+headR*1.05;
      fig.add(cap);
    }
    if(rng()<.22){
      const hat=new THREE.Mesh(new THREE.ConeGeometry(headR*1.3,.24,10),clothMat);
      hat.position.y=bodyTop+headR*2.1;
      fig.add(hat);
    }
    if(rng()<.25){
      const scarf=new THREE.Mesh(new THREE.TorusGeometry(headR*.9,.045,6,14),
        new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(rng(),.7,.55),roughness:.8}));
      scarf.rotation.x=Math.PI/2;
      scarf.position.y=bodyTop+headR*.15;
      fig.add(scarf);
    }
    const armGeo=new THREE.BoxGeometry(.07,.3,.07);
    armGeo.translate(0,-.15,0);
    const armL=new THREE.Object3D();armL.position.set(-.2,bodyTop*.92,0);
    const armR=new THREE.Object3D();armR.position.set(.2,bodyTop*.92,0);
    armL.add(new THREE.Mesh(armGeo,topMat));
    armR.add(new THREE.Mesh(armGeo,topMat));
    fig.add(armL,armR);
    fig.scale.setScalar(.8+rng()*.45);
    fig.position.set(x,-.05,z);
    fig.lookAt(0,.5,0);
    group.add(fig);
    people.push({fig,armL,armR,baseY:-.05,y:0,vy:0,armT:0,cheer:0,ph:rng()*6.28,spd:.6+rng()*.8,hopT:rng()});
      done++;placed++;
    }
  }

  function impulse(p,strength){
    p.vy=1.6+strength*2.2+Math.random()*.8;
    p.armT=Math.min(1.4,.6+strength);
  }
  function react(type){
    for(const p of people){
      if(type==='capture'&&Math.random()<.45)impulse(p,.55);
      else if(type==='multi'&&Math.random()<.85)impulse(p,1.1);
      else if(type==='crown')impulse(p,.8);
    }
  }
  function celebrate(){
    for(const p of people){p.cheer=3;p.armT=1.4;}
  }
  let clockT=0;
  function update(dt){
    clockT+=dt;
    for(const p of people){
      if(p.cheer>0){
        p.cheer-=dt;
        p.hopT-=dt;
        if(p.hopT<=0){p.vy=2.6;p.hopT=.34+Math.random()*.2;p.armT=1.4;}
      }
      if(p.vy!==0||p.y>0){
        p.y+=p.vy*dt;
        p.vy-=11*dt;
        if(p.y<=0){p.y=0;p.vy=0;}
      }
      p.fig.position.y=p.baseY+p.y+Math.sin(clockT*p.spd+p.ph)*.03;
      p.armT=Math.max(0,p.armT-dt*1.3);
      const raise=.28-p.armT*2.6;
      p.armL.rotation.x=raise;
      p.armR.rotation.x=raise;
      p.armL.rotation.z=.08+p.armT*.5;
      p.armR.rotation.z=-.08-p.armT*.5;
    }
  }
  return {group,react,celebrate,update};
}
