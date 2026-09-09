import * as THREE from 'three';

export const TEAM_COLORS={
  red:{body:0xe8593f,dark:0x7c2418,glow:0xff7a3c},
  black:{body:0x5ab7e8,dark:0x164a70,glow:0x54d6ff},
};

const geoCache={},matCache={};
const geo=(k,f)=>geoCache[k]||(geoCache[k]=f());
const mat=(k,f)=>matCache[k]||(matCache[k]=f());

let skinParams=null,skinKey='default',envRef=null;
export function setSkin(key,params){skinKey=key;skinParams=params||{};}
export function setEnv(t){envRef=t;}

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

export function makePiece(color){
  const M=teamMats(color);
  const g=new THREE.Group();
  const base=new THREE.Mesh(geo('base',()=>new THREE.CylinderGeometry(.42,.46,.09,28)),M.dark);
  base.position.y=.045;
  const body=new THREE.Mesh(geo('body',()=>new THREE.CylinderGeometry(.26,.4,.28,28)),M.body);
  body.position.y=.23;
  const collar=new THREE.Mesh(geo('collar',()=>new THREE.CylinderGeometry(.34,.27,.08,28)),M.body);
  collar.position.y=.405;
  const head=new THREE.Mesh(geo('head',()=>new THREE.CylinderGeometry(.31,.31,.09,28)),M.body);
  head.position.y=.49;
  const rim=new THREE.Mesh(geo('rim',()=>new THREE.TorusGeometry(.31,.028,10,28)),M.dark);
  rim.rotation.x=Math.PI/2;rim.position.y=.535;
  for(const m of[base,body,collar,head,rim]){m.castShadow=true;m.receiveShadow=false;g.add(m);}
  g.userData={color,king:false};
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
  c.position.y=.6;
  g.add(c);
  g.userData.king=true;
  return c;
}
