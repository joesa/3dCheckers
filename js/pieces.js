import * as THREE from 'three';

export const TEAM_COLORS={
  red:{body:0xe8593f,dark:0x7c2418,glow:0xff7a3c},
  black:{body:0x5ab7e8,dark:0x164a70,glow:0x54d6ff},
};
const ARMY_DEFAULT={
  red:{...TEAM_COLORS.red},
  black:{...TEAM_COLORS.black},
};

const geoCache={},matCache={};
const geo=(k,f)=>geoCache[k]||(geoCache[k]=f());
const mat=(k,f)=>matCache[k]||(matCache[k]=f());

let skinParams=null,skinKey='default',envRef=null,shapeId='disc';
export function setSkin(key,params){skinKey=key;skinParams=params||{};}
export function setEnv(t){envRef=t;}
export function setShape(id){shapeId=BUILDERS[id]?id:'disc';}
export function getShape(){return shapeId;}

/* Army palette: recolour both armies at once (silhouette & team-slot stay, hues change).
   Everything downstream (pieces, avatars, bursts, markers) reads TEAM_COLORS live. */
export function setArmy(pal){
  for(const side of['red','black']){
    const src=(pal&&pal[side])||ARMY_DEFAULT[side];
    TEAM_COLORS[side].body=src.body;TEAM_COLORS[side].dark=src.dark;TEAM_COLORS[side].glow=src.glow;
  }
  for(const k in matCache)delete matCache[k];
}

function applySkin(base,o){
  if(!o)return base;
  const m={...base};
  if(o.roughness!==undefined)m.roughness=o.roughness;
  if(o.metalness!==undefined)m.metalness=o.metalness;
  if(o.transparent)m.transparent=true;
  if(o.opacity!==undefined)m.opacity=o.opacity;
  return m;
}

function teamMats(color){
  const C=TEAM_COLORS[color];
  const sp=skinParams||{};
  const eb=sp.emissiveBoost||1;
  if(sp.transmissive){
    return {
      body:mat(color+'-body-'+skinKey,()=>new THREE.MeshPhysicalMaterial({color:C.body,
        transmission:.86,thickness:.32,roughness:.05,ior:1.5,metalness:0,transparent:true,
        clearcoat:1,clearcoatRoughness:.06,envMap:envRef,envMapIntensity:1.6,
        emissive:C.glow,emissiveIntensity:.05})),
      dark:mat(color+'-dark-'+skinKey,()=>new THREE.MeshPhysicalMaterial({color:C.dark,
        transmission:.55,thickness:.3,roughness:.09,ior:1.5,metalness:.05,transparent:true,
        envMap:envRef,envMapIntensity:1.4})),
    };
  }
  return {
    body:mat(color+'-body-'+skinKey,()=>new THREE.MeshStandardMaterial({...applySkin({color:C.body,roughness:.42,metalness:.28},sp.body),emissive:C.glow,emissiveIntensity:Math.min(1,.14*(1+(sp.glow||0)*3)*eb)})),
    dark:mat(color+'-dark-'+skinKey,()=>new THREE.MeshStandardMaterial(applySkin({color:C.dark,roughness:.55,metalness:.2},sp.dark))),
  };
}

const goldMat=()=>mat('gold',()=>new THREE.MeshStandardMaterial({color:0xffd75e,roughness:.22,metalness:.85,emissive:0xff9d2e,emissiveIntensity:.4}));

function add(g,geometry,material,x,y,z,rx){
  const m=new THREE.Mesh(geometry,material);
  m.position.set(x||0,y||0,z||0);
  if(rx)m.rotation.x=rx;
  m.castShadow=true;m.receiveShadow=false;
  g.add(m);return m;
}
const cyl=(rt,rb,h,s)=>new THREE.CylinderGeometry(rt,rb,h,s);
const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);

function roundedRect(w,h,r){
  const s=new THREE.Shape();const x=-w/2,y=-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
function starShape(pts,outer,inner){
  const s=new THREE.Shape();
  for(let i=0;i<pts*2;i++){
    const r=i%2?inner:outer,a=i/(pts*2)*Math.PI*2-Math.PI/2;
    const px=Math.cos(a)*r,py=Math.sin(a)*r;
    i?s.lineTo(px,py):s.moveTo(px,py);
  }
  s.closePath();return s;
}
function extrude(shape,depth,bev=.03){
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:bev,bevelThickness:bev,bevelSegments:2,steps:1});
  g.rotateX(-Math.PI/2);g.center();g.computeVertexNormals();return g;
}

/* -------- silhouette builders: return the group's crown height (topY) -------- */
const BUILDERS={
  disc(M,G){
    add(G,geo('disc:base',()=>cyl(.42,.46,.09,28)),M.dark,0,.045);
    add(G,geo('disc:body',()=>cyl(.26,.4,.28,28)),M.body,0,.23);
    add(G,geo('disc:collar',()=>cyl(.34,.27,.08,28)),M.body,0,.405);
    add(G,geo('disc:head',()=>cyl(.31,.31,.09,28)),M.body,0,.49);
    add(G,geo('disc:rim',()=>new THREE.TorusGeometry(.31,.028,10,28)),M.dark,0,.535,0,Math.PI/2);
    return .55;
  },
  square(M,G){
    add(G,geo('sq:base',()=>box(.9,.09,.9)),M.dark,0,.045);
    add(G,geo('sq:body',()=>box(.72,.26,.72)),M.body,0,.22);
    add(G,geo('sq:collar',()=>box(.8,.08,.8)),M.body,0,.39);
    add(G,geo('sq:head',()=>box(.6,.1,.6)),M.body,0,.48);
    add(G,geo('sq:rim',()=>new THREE.TorusGeometry(.3,.026,8,4)),M.dark,0,.53,0,Math.PI/2);
    return .55;
  },
  roundel(M,G){
    add(G,geo('rd:base',()=>extrude(roundedRect(.86,.86,.2),.09,.02)),M.dark,0,.05);
    add(G,geo('rd:body',()=>extrude(roundedRect(.66,.66,.16),.24,.03)),M.body,0,.22);
    add(G,geo('rd:head',()=>extrude(roundedRect(.56,.56,.14),.1,.02)),M.body,0,.4);
    add(G,geo('rd:rim',()=>extrude(roundedRect(.5,.5,.12),.02,.01)),M.dark,0,.47);
    return .5;
  },
  octagon(M,G){
    add(G,geo('oc:base',()=>cyl(.44,.47,.09,8)),M.dark,0,.045);
    add(G,geo('oc:body',()=>cyl(.3,.42,.26,8)),M.body,0,.22);
    add(G,geo('oc:collar',()=>cyl(.36,.3,.08,8)),M.body,0,.39);
    add(G,geo('oc:head',()=>cyl(.33,.33,.1,8)),M.body,0,.48);
    return .55;
  },
  hex(M,G){
    add(G,geo('hx:base',()=>cyl(.45,.48,.09,6)),M.dark,0,.045);
    add(G,geo('hx:body',()=>cyl(.28,.42,.28,6)),M.body,0,.23);
    add(G,geo('hx:collar',()=>cyl(.36,.28,.08,6)),M.body,0,.41);
    add(G,geo('hx:head',()=>cyl(.32,.32,.1,6)),M.body,0,.5);
    return .57;
  },
  star(M,G){
    add(G,geo('st:base',()=>cyl(.4,.44,.07,28)),M.dark,0,.035);
    add(G,geo('st:body',()=>extrude(starShape(8,.46,.2),.24,.02)),M.body,0,.2);
    add(G,geo('st:gem',()=>new THREE.OctahedronGeometry(.09,0)),M.body,0,.4);
    return .5;
  },
  cog(M,G){
    add(G,geo('cg:base',()=>cyl(.4,.44,.09,20)),M.dark,0,.045);
    add(G,geo('cg:body',()=>cyl(.34,.36,.24,20)),M.body,0,.22);
    const tooth=geo('cg:tooth',()=>box(.13,.22,.16));
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2;const m=add(G,tooth,M.body,Math.cos(a)*.4,.22,Math.sin(a)*.4);m.rotation.y=-a;}
    add(G,geo('cg:hub',()=>cyl(.14,.14,.1,16)),M.dark,0,.4);
    return .48;
  },
  obelisk(M,G){
    add(G,geo('ob:base',()=>box(.6,.08,.6)),M.dark,0,.04);
    add(G,geo('ob:shaft',()=>cyl(.12,.3,.46,4)),M.body,0,.31);
    add(G,geo('ob:cap',()=>new THREE.ConeGeometry(.16,.16,4)),M.body,0,.62);
    return .74;
  },
  crystal(M,G){
    add(G,geo('cr:base',()=>cyl(.34,.4,.07,8)),M.dark,0,.035);
    add(G,geo('cr:low',()=>new THREE.OctahedronGeometry(.28,0)),M.body,0,.3);
    add(G,geo('cr:up',()=>new THREE.OctahedronGeometry(.14,0)),M.dark,0,.56);
    return .72;
  },
  totem(M,G){
    add(G,geo('tt:base',()=>cyl(.4,.44,.09,8)),M.dark,0,.045);
    add(G,geo('tt:a',()=>box(.5,.18,.5)),M.body,0,.19);
    add(G,geo('tt:b',()=>box(.42,.16,.42)),M.dark,0,.36);
    add(G,geo('tt:c',()=>box(.34,.16,.34)),M.body,0,.52);
    add(G,geo('tt:fin',()=>new THREE.OctahedronGeometry(.11,0)),M.dark,0,.66);
    return .76;
  },
  bloom(M,G){
    add(G,geo('bl:base',()=>cyl(.4,.44,.08,24)),M.dark,0,.04);
    add(G,geo('bl:cup',()=>new THREE.SphereGeometry(.28,18,12,0,Math.PI*2,0,Math.PI/2)),M.body,0,.12);
    const petal=geo('bl:petal',()=>new THREE.ConeGeometry(.11,.4,7));
    for(let i=0;i<6;i++){const a=i/6*Math.PI*2;const m=add(G,petal,M.body,Math.cos(a)*.24,.28,Math.sin(a)*.24);m.rotation.z=Math.cos(a)*.5;m.rotation.x=Math.sin(a)*.5;}
    add(G,geo('bl:pistil',()=>new THREE.OctahedronGeometry(.09,0)),M.dark,0,.44);
    return .58;
  },
  helix(M,G){
    add(G,geo('hx2:base',()=>cyl(.34,.4,.08,8)),M.dark,0,.04);
    const rod=geo('hx2:rod',()=>cyl(.05,.05,.56,8));
    const l=add(G,rod,M.body,-.11,.36,0),r=add(G,rod,M.body,.11,.36,0);
    l.rotation.z=.28;r.rotation.z=-.28;
    add(G,geo('hx2:nub',()=>new THREE.SphereGeometry(.12,14,12)),M.dark,0,.66);
    return .8;
  },
  monolith(M,G){
    add(G,geo('mo:base',()=>box(.52,.07,.34)),M.dark,0,.035);
    const slab=add(G,geo('mo:slab',()=>box(.4,.7,.09)),M.body,0,.44);
    slab.rotation.z=.04;slab.rotation.y=.2;
    const shard=add(G,geo('mo:shard',()=>new THREE.TetrahedronGeometry(.09,0)),M.dark,.3,.5,.12);
    shard.userData.orbit=true;
    return .82;
  },
  court(M,G){
    add(G,geo('co:base',()=>cyl(.42,.46,.08,24)),M.dark,0,.04);
    add(G,geo('co:stem',()=>cyl(.12,.3,.24,20)),M.body,0,.2);
    add(G,geo('co:collar',()=>cyl(.26,.14,.08,20)),M.body,0,.36);
    add(G,geo('co:head',()=>new THREE.SphereGeometry(.18,18,14)),M.body,0,.5);
    return .66;
  },
};

export function makePiece(color){
  const M=teamMats(color);
  const g=new THREE.Group();
  const build=BUILDERS[shapeId]||BUILDERS.disc;
  g.userData={color,king:false,shape:shapeId,topY:build(M,g)};
  return g;
}

export function addCrown(g){
  const gold=goldMat();
  const c=new THREE.Group();
  const ring=new THREE.Mesh(geo('crownRing',()=>new THREE.TorusGeometry(.15,.035,10,24)),gold);
  ring.rotation.x=Math.PI/2;
  c.add(ring);
  const spikeG=geo('crownSpike',()=>new THREE.ConeGeometry(.05,.15,6));
  for(let i=0;i<5;i++){
    const a=i/5*Math.PI*2;
    const s=new THREE.Mesh(spikeG,gold);
    s.position.set(Math.cos(a)*.15,.09,Math.sin(a)*.15);
    c.add(s);
  }
  const gem=new THREE.Mesh(geo('crownGem',()=>new THREE.OctahedronGeometry(.05,0)),
    mat('crownGemM',()=>new THREE.MeshStandardMaterial({color:0xff5f6d,emissive:0xff2040,emissiveIntensity:1,roughness:.1,metalness:.3})));
  gem.position.y=.12;
  c.add(gem);
  c.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  c.position.y=(g.userData&&g.userData.topY||.55)+.02;
  g.add(c);
  g.userData.king=true;
  return c;
}
