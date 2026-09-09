import * as THREE from 'three';

const BRASS=0xc9a04e, STEEL=0xb9c2cc, CARBON=0x14161a, RUBY=0xe01530, AMBER=0xffb45e;

function mat(color,rough=.4,metal=.85,extra){
  return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,...(extra||{})});
}
const PHY=o=>new THREE.MeshPhysicalMaterial(o);

function dialTexture(opts){
  const cv=document.createElement('canvas');cv.width=cv.height=512;
  const g=cv.getContext('2d');
  g.clearRect(0,0,512,512);
  const cx=256,cy=256;
  g.strokeStyle=opts.tick||'rgba(230,220,190,.9)';
  for(let i=0;i<60;i++){
    const a=i/60*Math.PI*2,big=i%5===0;
    g.lineWidth=big?5:2;
    const r0=big?212:222,r1=234;
    g.beginPath();
    g.moveTo(cx+Math.sin(a)*r0,cy-Math.cos(a)*r0);
    g.lineTo(cx+Math.sin(a)*r1,cy-Math.cos(a)*r1);
    g.stroke();
  }
  g.fillStyle=opts.numerals||'rgba(235,225,195,.95)';
  g.font='600 46px Orbitron, Georgia, serif';
  g.textAlign='center';g.textBaseline='middle';
  for(let i=1;i<=12;i++){
    const a=i/12*Math.PI*2;
    g.fillText(String(i),cx+Math.sin(a)*180,cy-Math.cos(a)*180);
  }
  g.setLineDash([2,10]);
  g.strokeStyle=opts.inner||'rgba(210,190,150,.5)';
  g.lineWidth=2;
  g.beginPath();g.arc(cx,cy,148,0,Math.PI*2);g.stroke();
  g.setLineDash([]);
  if(opts.brand){
    g.font='500 22px Orbitron, serif';
    g.fillStyle=opts.brandColor||'rgba(201,160,78,.9)';
    g.fillText(opts.brand,cx,cy+96);
  }
  const t=new THREE.CanvasTexture(cv);
  t.anisotropy=8;
  return t;
}

function hand(len,w,color,tip){
  const grp=new THREE.Group();
  const m=mat(color,.15,.95);
  const b=new THREE.Mesh(new THREE.BoxGeometry(w,len*.62,.012),m);
  b.position.y=len*.31;
  const t2=new THREE.Mesh(new THREE.BoxGeometry(w*1.7,len*.34,.012),m);
  t2.position.y=len*.72;t2.rotation.z=Math.PI/4;
  const tail=new THREE.Mesh(new THREE.BoxGeometry(w*.8,len*.2,.012),m);
  tail.position.y=-len*.1;
  grp.add(b,t2,tail);
  if(tip){
    const c=new THREE.Mesh(new THREE.CircleGeometry(w*2.4,12),
      new THREE.MeshBasicMaterial({color:tip,transparent:true,opacity:.0}));
    c.visible=false;
  }
  return grp;
}

function gear(r,teeth,thick,color){
  const g=new THREE.Group();
  const M=mat(color,.3,.9);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(r*.82,thick*.5,6,28),M);
  g.add(rim);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(r*.2,r*.2,thick*1.3,10),M);
  hub.rotation.x=Math.PI/2;
  g.add(hub);
  const spokes=teeth>=10?4:3;
  for(let i=0;i<spokes;i++){
    const s=new THREE.Mesh(new THREE.BoxGeometry(r*.14,r*.62,thick*.8),M);
    s.position.y=r*.44;
    const holder=new THREE.Group();
    holder.rotation.z=i/spokes*Math.PI*2;
    holder.add(s);
    g.add(holder);
  }
  const tg=new THREE.BoxGeometry(r*.16,thick*.9,r*.3);
  for(let i=0;i<teeth;i++){
    const t=new THREE.Mesh(tg,M);
    const a=i/teeth*Math.PI*2;
    t.position.set(Math.sin(-a)*r,Math.cos(-a)*r,0);
    t.rotation.z=-a;
    g.add(t);
  }
  return g;
}

function jewel(x,y,z){
  const j=new THREE.Mesh(new THREE.SphereGeometry(.011,8,6),
    new THREE.MeshStandardMaterial({color:RUBY,roughness:.12,metalness:.2,emissive:0x900018,emissiveIntensity:.8}));
  j.position.set(x,y,z);
  return j;
}

function hairspring(){
  const pts=[];
  for(let i=0;i<=70;i++){
    const t=i/70,a=t*Math.PI*6,r=.012+t*.042;
    pts.push(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,0));
  }
  const curve=new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve,80,.0022,4,false),mat(STEEL,.3,.9));
}

function digitalModule(){
  const cv=document.createElement('canvas');
  cv.width=320;cv.height=110;
  const tex=new THREE.CanvasTexture(cv);
  const plate=new THREE.Mesh(new THREE.CylinderGeometry(.345,.345,.075,32,1,true,-.62,1.24),
    PHY({color:0x0c0e14,roughness:.25,metalness:.4,clearcoat:.8,side:THREE.DoubleSide}));
  const screen=new THREE.Mesh(new THREE.CylinderGeometry(.352,.352,.05,32,1,true,-.5,1.0),
    new THREE.MeshStandardMaterial({map:tex,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:1.1,
      transparent:true,roughness:.1,metalness:0,side:THREE.DoubleSide,toneMapped:false}));
  const mod=new THREE.Group();
  mod.add(plate,screen);
  mod.rotation.x=Math.PI/2;
  let last='';
  function draw(on){
    screen.material.emissiveIntensity=on?1.1:.3;
    const g=cv.getContext('2d');
    const d=new Date();
    const hh=String(d.getHours()).padStart(2,'0');
    const mm=String(d.getMinutes()).padStart(2,'0');
    const ss=String(d.getSeconds()).padStart(2,'0');
    const key=hh+mm+ss+(on?'a':'b');
    if(key===last)return;
    last=key;
    g.clearRect(0,0,320,110);
    g.fillStyle='rgba(8,10,16,.96)';
    g.fillRect(0,0,320,110);
    g.strokeStyle='rgba(201,160,78,.5)';
    g.lineWidth=3;
    g.strokeRect(6,6,308,98);
    g.font='600 52px Orbitron, monospace';
    g.textAlign='center';g.textBaseline='middle';
    g.shadowColor=on?'#ffb45e':'transparent';
    g.shadowBlur=on?18:0;
    g.fillStyle=on?'#ffcf8a':'rgba(120,90,40,.55)';
    g.fillText(hh+':'+mm,160,50);
    g.font='500 20px Orbitron, monospace';
    g.fillStyle=on?'rgba(255,180,94,.85)':'rgba(120,90,40,.4)';
    g.fillText(ss,160,92);
    tex.needsUpdate=true;
  }
  draw(true);
  return {mod,draw};
}

export function buildSkeletonBell(opts){
  opts=opts||{};
  const brass=opts.brass||BRASS, dark=opts.dark||STEEL;
  const root=new THREE.Group();
  const shell=new THREE.Group();
  root.add(shell);

  const caseMat=mat(brass,.28,.9);
  const band=new THREE.Mesh(new THREE.CylinderGeometry(.335,.335,.115,48,1,true),caseMat);
  shell.add(band);
  const bezelF=new THREE.Mesh(new THREE.TorusGeometry(.32,.022,10,48),caseMat);
  bezelF.rotation.x=Math.PI/2;bezelF.position.z=.058;
  const bezelB=bezelF.clone();bezelB.position.z=-.058;
  shell.add(bezelF,bezelB);

  const glassMat=PHY({color:opts.glassTint||0xeaf2ff,transmission:.92,thickness:.06,roughness:.03,
    ior:1.52,transparent:true,opacity:1,metalness:0,envMapIntensity:1.6,clearcoat:1,clearcoatRoughness:.05});
  const crysF=new THREE.Mesh(new THREE.CylinderGeometry(.318,.318,.012,48),glassMat);
  crysF.rotation.x=Math.PI/2;crysF.position.z=.062;
  const crysB=crysF.clone();crysB.position.z=-.062;
  shell.add(crysF,crysB);

  const plateM=new THREE.Mesh(new THREE.CylinderGeometry(.285,.285,.018,48),
    new THREE.MeshPhysicalMaterial({color:CARBON,roughness:.5,metalness:.35,clearcoat:.4}));
  plateM.rotation.x=Math.PI/2;
  shell.add(plateM);

  const dialRing=new THREE.Mesh(new THREE.CircleGeometry(.3,.64),
    new THREE.MeshBasicMaterial({map:dialTexture({brand:'SKELETON BELL',numerals:'rgba(226,214,180,.95)',tick:'rgba(201,160,78,.85)',inner:'rgba(185,194,204,.4)'}),
      transparent:true,depthWrite:false}));
  dialRing.position.z=.055;
  shell.add(dialRing);

  const gears=new THREE.Group();
  shell.add(gears);
  const gBarrel=gear(.105,16,.014,brass);gBarrel.position.set(-.11,.05,.028);
  const gCenter=gear(.075,12,.013,dark);gCenter.position.set(.02,-.01,.03);
  const gFourth=gear(.052,10,.012,brass);gFourth.position.set(.125,.075,.028);
  const gEscape=gear(.038,8,.011,dark);gEscape.position.set(.1,-.12,.03);
  const gBack1=gear(.09,14,.013,dark);gBack1.position.set(.06,.09,-.028);
  const gBack2=gear(.06,10,.012,brass);gBack2.position.set(-.08,-.08,-.028);
  gears.add(gBarrel,gCenter,gFourth,gEscape,gBack1,gBack2);

  const balance=new THREE.Group();
  const brim=new THREE.Mesh(new THREE.TorusGeometry(.072,.0075,8,32),mat(dark,.25,.95));
  balance.add(brim);
  for(let i=0;i<2;i++){
    const sp=new THREE.Mesh(new THREE.BoxGeometry(.006,.144,.006),mat(dark,.25,.95));
    sp.rotation.z=i*Math.PI/2;
    balance.add(sp);
  }
  const spring=hairspring();spring.position.z=.012;
  balance.add(spring);
  balance.position.set(-.13,-.11,.034);
  shell.add(balance);

  const pallet=new THREE.Group();
  const arm=new THREE.Mesh(new THREE.BoxGeometry(.008,.075,.008),mat(dark,.3,.9));
  arm.position.y=.03;
  pallet.add(arm);
  pallet.position.set(.045,-.135,.032);
  shell.add(pallet);

  [ [0,.3,0],[.26,0,0],[-.26,0,0],[0,-.3,0],[.19,.19,.035],[-.19,.19,.035],[.19,-.19,.035],[-.19,-.19,.035] ]
    .forEach(([x,y,z])=>shell.add(jewel(x,y,z)));

  const hands=new THREE.Group();
  hands.position.z=.068;
  shell.add(hands);
  const hHour=hand(.155,.026,dark);
  const hMin=hand(.225,.02,dark);
  const hSec=new THREE.Group();
  const secBar=new THREE.Mesh(new THREE.BoxGeometry(.007,.26,.008),mat(0xd8dde3,.15,.95));
  secBar.position.y=.09;
  const secTail=new THREE.Mesh(new THREE.BoxGeometry(.01,.06,.008),mat(0xd8dde3,.15,.95));
  secTail.position.y=-.035;
  hSec.add(secBar,secTail);
  const hAlarm=hand(.12,.014,opts.alarmHand||0x3a56c4);
  hands.add(hAlarm,hHour,hMin,hSec);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.016,.016,.02,12),mat(brass,.2,.95));
  cap.rotation.x=Math.PI/2;cap.position.z=.078;
  shell.add(cap);

  const bellMat=mat(opts.bells||brass,.22,.92);
  const bells=[];
  for(const sx of[-1,1]){
    const bell=new THREE.Mesh(new THREE.SphereGeometry(.095,20,14,0,Math.PI*2,0,Math.PI/2),bellMat);
    bell.position.set(sx*.155,.315,0);
    bell.rotation.z=sx*.42;
    shell.add(bell);
    bells.push(bell);
    const stalk=new THREE.Mesh(new THREE.CylinderGeometry(.02,.026,.08,10),caseMat);
    stalk.position.set(sx*.115,.25,0);
    stalk.rotation.z=-sx*.35;
    shell.add(stalk);
  }
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.1,.014,8,24,Math.PI),caseMat);
  handle.position.y=.335;
  shell.add(handle);

  const hammer=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.19,8),mat(dark,.3,.9));
  shaft.rotation.z=Math.PI/2;
  hammer.add(shaft);
  for(const sx of[-1,1]){
    const h=new THREE.Mesh(new THREE.SphereGeometry(.022,10,8),mat(0x2a2e36,.5,.4));
    h.position.x=sx*.105;
    hammer.add(h);
  }
  hammer.position.set(0,.29,0);
  shell.add(hammer);

  const legMat=caseMat;
  for(const[lx,lz]of[[-.19,.1],[.19,.1],[-.19,-.1],[.19,-.1]]){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.014,.02,.2,8),legMat);
    leg.position.set(lx*1.25,-.335,lz*1.4);
    leg.rotation.x=-lz*1.6;leg.rotation.z=lx*1.3;
    shell.add(leg);
    const foot=new THREE.Mesh(new THREE.SphereGeometry(.024,8,6),legMat);
    foot.position.set(lx*1.55,-.425,lz*1.75);
    shell.add(foot);
  }

  const crown=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.045,14),caseMat);
  crown.rotation.x=Math.PI/2;crown.position.z=-.085;
  shell.add(crown);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.06,8),mat(dark,.3,.9));
  stem.rotation.x=Math.PI/2;stem.position.z=-.06;
  shell.add(stem);
  const lever=new THREE.Mesh(new THREE.BoxGeometry(.014,.06,.012),mat(0x8a4a30,.4,.6));
  lever.position.set(.14,-.2,-.07);
  shell.add(lever);

  const backlight=new THREE.Mesh(new THREE.RingGeometry(.16,.27,32),
    new THREE.MeshBasicMaterial({color:AMBER,transparent:true,opacity:.16,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  backlight.position.z=-.045;
  shell.add(backlight);

  const dig=digitalModule();
  dig.mod.position.set(0,-.235,.0);
  shell.add(dig.mod);

  let t=Math.random()*10,strike=0,ring=0,digital=true;
  const iface={
    group:root,
    onStrike:null,
    setDigital(on){
      digital=on;
      dig.mod.visible=true;
      dig.draw(on);
      iface._digOff=!on;
    },
    ring(){ring=1.9;},
    get striking(){return ring>0;},
    reset(){},
    update(dt){
      t+=dt;
      const d=new Date();
      const s=d.getSeconds()+d.getMilliseconds()/1000;
      const m=d.getMinutes()+s/60;
      const h=(d.getHours()%12)+m/60;
      hHour.rotation.z=-h/12*Math.PI*2;
      hMin.rotation.z=-m/60*Math.PI*2;
      hSec.rotation.z=-s/60*Math.PI*2;
      let al=0;
      try{
        const raw=localStorage.getItem('ad-alarm');
        if(raw){const[ah,am]=raw.split(':').map(Number);al=(ah%12)+am/60;}
        else al=7;
      }catch(e){al=7;}
      hAlarm.rotation.z=-al/12*Math.PI*2;

      gBarrel.rotation.z+=dt*.15;
      gCenter.rotation.z-=dt*.55;
      gFourth.rotation.z+=dt*1.9;
      gEscape.rotation.z-=dt*5.2;
      gBack1.rotation.z-=dt*.35;
      gBack2.rotation.z+=dt*1.1;
      balance.rotation.z=Math.sin(t*Math.PI*2*2.5)*.85;
      pallet.rotation.z=Math.sin(t*Math.PI*2*2.5+1.2)*.22;

      if(ring>0){
        ring-=dt;
        const prev=strike;
        strike+=dt*15;
        if((strike|0)!==(prev|0)&&iface.onStrike)iface.onStrike();
        hammer.position.x=Math.sin(strike*Math.PI)*.05;
        hammer.rotation.z=Math.sin(strike*Math.PI)*.3;
        for(const b of bells)b.position.y=.315+Math.sin(strike*Math.PI+b.position.x)*.006;
        shell.rotation.x=Math.sin(strike*Math.PI)*.012;
      }else{
        hammer.position.x=0;hammer.rotation.z=0;
        shell.rotation.x=0;
        for(const b of bells)b.position.y=.315;
      }
      backlight.material.opacity=.14+.05*Math.sin(t*1.6);
      dig.draw(digital);
    },
  };
  return iface;
}

function simpleHands(lenH,lenM,holder,z){
  const hands=new THREE.Group();
  hands.position.z=z;
  const h=hand(lenH,.024,0x22262e);
  const m=hand(lenM,.018,0x22262e);
  holder.add(hands);
  return{hands,h,m};
}

function buildWallRound(opts){
  const root=new THREE.Group();
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.42,.035,12,40),mat(opts.rim||BRASS,.3,.85));
  root.add(rim);
  const back=new THREE.Mesh(new THREE.CylinderGeometry(.42,.4,.05,40),mat(opts.back||0x241c12,.7,.3));
  back.rotation.x=Math.PI/2;back.position.z=-.03;
  root.add(back);
  const face=new THREE.Mesh(new THREE.CircleGeometry(.395,48),
    new THREE.MeshBasicMaterial({map:dialTexture(opts.dial||{}),transparent:true}));
  face.position.z=.005;
  root.add(face);
  const glass=PHY({color:0xffffff,transparent:true,opacity:.12,roughness:.06,metalness:0,clearcoat:1});
  glass.side=THREE.DoubleSide;
  const gm=new THREE.Mesh(new THREE.CircleGeometry(.4,48),glass);
  gm.position.z=.02;
  root.add(gm);
  const{hands,h,m}=simpleHands(.2,.3,root,.028);
  const cap=new THREE.Mesh(new THREE.SphereGeometry(.022,10,8),mat(opts.rim||BRASS,.25,.9));
  cap.position.z=.036;
  root.add(cap);
  let tickA=0;
  return{group:root,setDigital(){},update(dt){
    tickA+=dt;
    const d=new Date();
    const s=d.getSeconds()+d.getMilliseconds()/1000;
    h.rotation.z=-(((d.getHours()%12)+d.getMinutes()/60))/12*Math.PI*2;
    m.rotation.z=-((d.getMinutes()+s/60)/60)*Math.PI*2;
  }};
}

function buildMantel(opts){
  const root=new THREE.Group();
  const wood=mat(opts.wood||0x6b4a2c,.6,.15);
  const body=new THREE.Mesh(new THREE.BoxGeometry(.78,.62,.24),wood);
  body.position.y=.31;
  root.add(body);
  const arch=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.26,24,1,false,0,Math.PI),wood);
  arch.rotation.x=Math.PI/2;arch.rotation.z=0;
  arch.position.set(0,.62,0);
  root.add(arch);
  for(const lx of[-.3,.3]){
    const foot=new THREE.Mesh(new THREE.BoxGeometry(.12,.1,.3),wood);
    foot.position.set(lx,.05,0);
    root.add(foot);
  }
  const inner=new THREE.Mesh(new THREE.CircleGeometry(.24,40),
    new THREE.MeshBasicMaterial({map:dialTexture(opts.dial||{}),transparent:true}));
  inner.position.set(0,.46,.125);
  root.add(inner);
  const ringM=new THREE.Mesh(new THREE.TorusGeometry(.25,.016,10,32),mat(opts.trim||BRASS,.3,.9));
  ringM.position.set(0,.46,.128);
  root.add(ringM);
  const{h,m}=simpleHandsOn(root,.46,.13,.19,.14);
  let emberGlow=null;
  if(opts.ember){
    emberGlow=new THREE.PointLight(0xff7a2a,.9,1.6);
    emberGlow.position.set(0,.2,.3);
    root.add(emberGlow);
  }
  return{group:root,setDigital(){},update(){
    const d=new Date();
    h.rotation.z=-(((d.getHours()%12)+d.getMinutes()/60))/12*Math.PI*2;
    m.rotation.z=-((d.getMinutes()+d.getSeconds()/60)/60)*Math.PI*2;
    if(emberGlow)emberGlow.intensity=.7+.3*Math.abs(Math.sin(performance.now()*.002));
  }};
}
function simpleHandsOn(root,cy,lh,lm,z){
  const h=hand(lh,.02,0x2a2e36);
  const m=hand(lm,.015,0x2a2e36);
  h.position.set(0,cy,z);
  m.position.set(0,cy,z+.004);
  root.add(h,m);
  return{h,m};
}

function buildHourglass(opts){
  const root=new THREE.Group();
  const wood=mat(opts.wood||0x4c3822,.65,.1);
  for(const yy of[0,.9]){
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.045,24),wood);
    cap.position.y=yy+.02;
    root.add(cap);
  }
  for(const sx of[-.24,.24]){
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.9,8),mat(opts.trim||BRASS,.3,.9));
    post.position.set(sx,.45,0);
    root.add(post);
  }
  const glassMat=PHY({color:0xdfe8ee,transparent:true,opacity:.28,roughness:.05,metalness:0,clearcoat:1,side:THREE.DoubleSide});
  const top=new THREE.Mesh(new THREE.ConeGeometry(.24,.42,24,1,true),glassMat);
  top.position.y=.72;top.rotation.x=Math.PI;
  const bot=new THREE.Mesh(new THREE.ConeGeometry(.24,.42,24,1,true),glassMat);
  bot.position.y=.23;
  root.add(top,bot);
  const sandMat=mat(opts.sand||0xe0b060,.9,0);
  const sandT=new THREE.Mesh(new THREE.ConeGeometry(.2,.4,24),sandMat);
  sandT.position.y=.66;sandT.rotation.x=Math.PI;
  const sandB=new THREE.Mesh(new THREE.ConeGeometry(.2,.36,24),sandMat);
  sandB.position.y=.18;
  root.add(sandT,sandB);
  let cyc=0;
  return{group:root,setDigital(){},update(dt){
    cyc=(cyc+dt/60)%1;
    sandT.scale.set(1-cyc*.55,.15+cyc*.85,1-cyc*.55);
    sandT.position.y=.5+.19*(1-cyc);
    sandB.scale.set(.55+cyc*.45,.4+cyc*.9,.55+cyc*.45);
    if(cyc<.02){sandT.scale.set(.99,.99,.99);sandB.scale.set(.05,.05,.05);}
  }};
}

function buildSundial(opts){
  const root=new THREE.Group();
  const stone=mat(opts.stone||0x9aa08c,.85,.05);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.42,.5,.12,10),stone);
  base.position.y=.06;
  root.add(base);
  const plate=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.035,48),stone);
  plate.position.y=.14;
  root.add(plate);
  const face=new THREE.Mesh(new THREE.CircleGeometry(.38,48),
    new THREE.MeshBasicMaterial({map:dialTexture(Object.assign({numerals:'rgba(40,45,35,.85)',tick:'rgba(40,45,35,.6)',inner:'rgba(0,0,0,0)'},opts.dial||{})),transparent:true}));
  face.rotation.x=-Math.PI/2;
  face.position.y=.162;
  root.add(face);
  const gnomon=new THREE.Mesh(new THREE.BoxGeometry(.02,.34,.02),mat(opts.trim||0x5b6350,.4,.7));
  gnomon.position.set(0,.3,0);
  gnomon.rotation.x=-.9;
  root.add(gnomon);
  return{group:root,setDigital(){},update(){
    const d=new Date();
    const h=(d.getHours()%12)+d.getMinutes()/60;
    gnomon.rotation.z=Math.PI*(h/12-.5)*-.8;
  }};
}

function buildTower(opts){
  const root=new THREE.Group();
  const stone=mat(opts.stone||0x6e6577,.85,.05);
  const shaft=new THREE.Mesh(new THREE.BoxGeometry(.5,1.5,.5),stone);
  shaft.position.y=.75;
  root.add(shaft);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(.44,.42,4),mat(opts.roof||0x3a3f4d,.6,.3));
  roof.position.y=1.72;roof.rotation.y=Math.PI/4;
  root.add(roof);
  const spire=new THREE.Mesh(new THREE.CylinderGeometry(.006,.02,.24,6),mat(BRASS,.3,.9));
  spire.position.y=2.0;
  root.add(spire);
  const dials=[];
  for(const ry of[0,Math.PI]){
    const face=new THREE.Mesh(new THREE.CircleGeometry(.21,32),
      new THREE.MeshBasicMaterial({map:dialTexture(opts.dial||{}),transparent:true}));
    face.position.set(0,1.28,.252);
    face.position.applyAxisAngle(new THREE.Vector3(0,1,0),ry);
    root.add(face);
    const h=hand(.1,.015,0x1c1f26);
    const m=hand(.155,.01,0x1c1f26);
    const hg=new THREE.Group();
    hg.add(h,m);
    hg.position.copy(face.position.clone().multiplyScalar(1.008));
    hg.rotation.y=ry;
    root.add(hg);
    dials.push({h,m,hg});
  }
  return{group:root,setDigital(){},update(){
    const d=new Date();
    for(const{h,m}of dials){
      h.rotation.z=-(((d.getHours()%12)+d.getMinutes()/60))/12*Math.PI*2;
      m.rotation.z=-((d.getMinutes()+d.getSeconds()/60)/60)*Math.PI*2;
    }
  }};
}

function buildFlip(opts){
  const root=new THREE.Group();
  const body=mat(opts.body||0x191b20,.45,.5);
  const shell=new THREE.Mesh(new THREE.BoxGeometry(.86,.3,.16),body);
  shell.position.y=.15;
  root.add(shell);
  for(const lx of[-.3,.3]){
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.2),body);
    leg.position.set(lx,.02,0);
    root.add(leg);
  }
  const cv=document.createElement('canvas');
  cv.width=512;cv.height=180;
  const tex=new THREE.CanvasTexture(cv);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(.78,.26),
    new THREE.MeshStandardMaterial({map:tex,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:.95,toneMapped:false,roughness:.2}));
  screen.position.set(0,.17,.081);
  root.add(screen);
  let last='';
  function draw(){
    const g=cv.getContext('2d');
    const d=new Date();
    const key=String(d.getHours())+String(d.getMinutes());
    if(key===last)return;
    last=key;
    g.fillStyle='#0a0b0e';
    g.fillRect(0,0,512,180);
    const cards=[
      String(Math.floor(d.getHours()/10)),String(d.getHours()%10),'',
      String(Math.floor(d.getMinutes()/10)),String(d.getMinutes()%10),
    ];
    g.textAlign='center';g.textBaseline='middle';
    cards.forEach((ch,i)=>{
      const x=52+i*102;
      if(ch===''){
        g.fillStyle='#ffb45e';
        g.beginPath();g.arc(x,70,9,0,Math.PI*2);g.fill();
        g.beginPath();g.arc(x,120,9,0,Math.PI*2);g.fill();
        return;
      }
      g.fillStyle='#1c1f26';
      g.fillRect(x-42,18,84,150);
      g.fillStyle='rgba(255,255,255,.06)';
      g.fillRect(x-42,92,84,3);
      g.font='700 92px Orbitron, monospace';
      g.fillStyle='#f2ead2';
      g.fillText(ch,x,92);
    });
    tex.needsUpdate=true;
  }
  draw();
  return{group:root,setDigital(){},update(){draw();}};
}

function buildOrbital(opts){
  const root=new THREE.Group();
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(.12,1),
    new THREE.MeshStandardMaterial({color:0x120e22,roughness:.3,metalness:.6,emissive:0x4a2ea0,emissiveIntensity:.7}));
  core.position.y=.5;
  root.add(core);
  const rings=[];
  for(const[i,tilt]of[0,1,2].entries()){
    const r=new THREE.Mesh(new THREE.TorusGeometry(.3+i*.09,.008,8,60),
      new THREE.MeshStandardMaterial({color:0x9fb6ff,emissive:opts.hue||0x6a4cff,emissiveIntensity:1.4,roughness:.3,metalness:.7}));
    r.position.y=.5;
    r.rotation.x=tilt*1.1;
    root.add(r);
    rings.push(r);
  }
  const ped=new THREE.Mesh(new THREE.CylinderGeometry(.1,.16,.5,12),mat(0x1a1426,.4,.6));
  ped.position.y=.25;
  root.add(ped);
  const cv=document.createElement('canvas');
  cv.width=256;cv.height=96;
  const tex=new THREE.CanvasTexture(cv);
  const label=new THREE.Mesh(new THREE.PlaneGeometry(.42,.16),
    new THREE.MeshBasicMaterial({map:tex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
  label.position.y=.06;
  root.add(label);
  let last='';
  function draw(){
    const d=new Date();
    const key=d.getHours()+':'+d.getMinutes();
    if(key===last)return;
    last=key;
    const g=cv.getContext('2d');
    g.clearRect(0,0,256,96);
    g.font='600 44px Orbitron, monospace';
    g.textAlign='center';g.textBaseline='middle';
    g.shadowColor='#7a5cff';
    g.shadowBlur=16;
    g.fillStyle='#cfc0ff';
    g.fillText(key,128,48);
    tex.needsUpdate=true;
  }
  draw();
  return{group:root,setDigital(on){label.visible=on!==false;},update(dt){
    rings[0].rotation.z+=dt*.4;
    rings[1].rotation.x+=dt*.3;
    rings[2].rotation.y+=dt*.5;
    core.rotation.y+=dt*.8;
    draw();
  }};
}

const BUILDERS={
  bell:buildSkeletonBell,
  wallround:buildWallRound,
  mantel:buildMantel,
  hourglass:buildHourglass,
  sundial:buildSundial,
  tower:buildTower,
  flip:buildFlip,
  orbital:buildOrbital,
};

export const THEME_CLOCKS={
  duskhold:'bell',emberfall:'mantel',frostspire:'wallround',verdance:'sundial',
  umbra:'wallround',amberwaste:'hourglass','coral-deep':'wallround',stormmoot:'tower',
  sakura:'mantel',voidgarden:'orbital',foundry:'wallround',lantern:'flip',
  bloodmoon:'tower',hollow:'hourglass',saltflats:'wallround',
};

export function makeClock(styleId,themeOpts){
  const b=BUILDERS[styleId]||buildWallRound;
  return b(themeOpts||{});
}
