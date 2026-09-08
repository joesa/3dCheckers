import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {addTween,stepTweens,easeOutBack,easeInOutQuad} from './tween.js';
import {makePiece,addCrown,TEAM_COLORS} from './pieces.js';
import {THEMES,DEFAULT_THEME} from './themes.js';

const TOP_Y=.05;
const sq3=([r,c],y=TOP_Y)=>new THREE.Vector3(c-3.5,y,r-3.5);
const sqKey=s=>s[0]+','+s[1];

function radialTexture(inner='rgba(255,255,255,1)',outer='rgba(255,255,255,0)'){
  const cv=document.createElement('canvas');cv.width=cv.height=256;
  const g=cv.getContext('2d');
  const gr=g.createRadialGradient(128,128,3,128,128,128);
  gr.addColorStop(0,inner);gr.addColorStop(.35,inner);gr.addColorStop(1,outer);
  g.fillStyle=gr;g.fillRect(0,0,256,256);
  const t=new THREE.CanvasTexture(cv);
  return t;
}

export function createWorld(canvas,initialTheme){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;

  const scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x1c1430,.012);

  const camera=new THREE.PerspectiveCamera(46,1,.1,700);
  camera.position.set(0,9.7,14);

  const controls=new OrbitControls(camera,canvas);
  controls.target.set(0,0,0);
  controls.enableDamping=true;
  controls.dampingFactor=.06;
  controls.enablePan=false;
  controls.minDistance=6.5;
  controls.maxDistance=34;
  controls.maxPolarAngle=1.38;
  controls.autoRotateSpeed=.45;

  /* ---------------- sky ---------------- */
  const sky=new THREE.Mesh(
    new THREE.SphereGeometry(420,32,16),
    new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,
      uniforms:{
        uGround:{value:new THREE.Color(0x090518)},
        uLow:{value:new THREE.Color(0xb85c3c)},
        uMid:{value:new THREE.Color(0x3f2568)},
        uHigh:{value:new THREE.Color(0x0c0824)},
      },
      vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader:`varying vec3 vW;uniform vec3 uGround,uLow,uMid,uHigh;
      void main(){
        vec3 d=normalize(vW);
        float h=clamp(d.y*.5+.5,0.,1.);
        vec3 col=mix(uGround,uLow,smoothstep(.41,.5,h));
        col=mix(col,uMid,smoothstep(.5,.72,h));
        col=mix(col,uHigh,smoothstep(.72,.96,h));
        gl_FragColor=vec4(col,1.);
      }`,
    }));
  scene.add(sky);

  const glowTex=radialTexture();

  /* stars */
  const starGeo=new THREE.BufferGeometry();
  {
    const N=1500,pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const th=Math.random()*Math.PI*2,ph=Math.acos(Math.random()*.95);
      const r=220+Math.random()*160;
      pos[i*3]=Math.sin(ph)*Math.cos(th)*r;
      pos[i*3+1]=Math.abs(Math.cos(ph))*r*.8+14;
      pos[i*3+2]=Math.sin(ph)*Math.sin(th)*r;
    }
    starGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  }
  const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({map:glowTex,color:0xcfd8ff,size:2.4,sizeAttenuation:false,transparent:true,opacity:.9,depthWrite:false,fog:false}));
  scene.add(stars);

  const moonTex=radialTexture('rgba(255,248,225,1)','rgba(255,240,200,0)');
  const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:moonTex,transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
  moon.position.set(-70,62,-150);moon.scale.setScalar(46);
  scene.add(moon);
  const moonCore=new THREE.Mesh(new THREE.SphereGeometry(7,20,20),new THREE.MeshBasicMaterial({color:0xfff3d0,fog:false}));
  moonCore.position.copy(moon.position);
  scene.add(moonCore);

  /* lights */
  const hemi=new THREE.HemisphereLight(0x7fa3ff,0x241b3a,.6);
  scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xcfe0ff,1.6);
  sun.position.set(9,15,7);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-13;sun.shadow.camera.right=13;
  sun.shadow.camera.top=13;sun.shadow.camera.bottom=-13;
  sun.shadow.camera.near=2;sun.shadow.camera.far=50;
  sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;
  scene.add(sun);
  const rim=new THREE.DirectionalLight(0xff9a5c,.55);
  rim.position.set(-9,4,-11);
  scene.add(rim);

  /* ---------------- floating island ---------------- */
  const rockMat=new THREE.MeshStandardMaterial({color:0x4a4166,roughness:.95,metalness:0,flatShading:true});
  const spire=new THREE.Mesh(new THREE.CylinderGeometry(8.4,1.3,9.5,42,6),rockMat);
  spire.position.y=-4.85;
  {
    const p=spire.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const rad=Math.hypot(x,z);
      if(rad>.2){
        const n=Math.sin(x*1.9)*.5+Math.cos(z*2.3)*.5+Math.sin((x+z)*.8)*.4;
        const s=1+n*.07*(1-(y+4.75)/9.5);
        p.setX(i,x*s);p.setZ(i,z*s);
      }
    }
    spire.geometry.computeVertexNormals();
  }
  spire.receiveShadow=true;
  scene.add(spire);

  const grassMat=new THREE.MeshStandardMaterial({color:0x3f5a45,roughness:.9});
  const grass=new THREE.Mesh(new THREE.CylinderGeometry(9.3,8.1,1.3,48),grassMat);
  grass.position.y=-.7;grass.receiveShadow=true;
  scene.add(grass);

  const platMat=new THREE.MeshStandardMaterial({color:0x4a4460,roughness:.8,metalness:.1});
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(5.9,6.2,.75,8),platMat);
  platform.rotation.y=Math.PI/8;
  platform.position.y=-.32;platform.receiveShadow=true;
  scene.add(platform);

  /* glow ring under board */
  const glowRing=new THREE.Mesh(new THREE.TorusGeometry(6.05,.05,8,72),new THREE.MeshBasicMaterial({color:0x54d6ff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,fog:false,depthWrite:false}));
  glowRing.rotation.x=-Math.PI/2;glowRing.position.y=-.01;
  scene.add(glowRing);

  /* frame */
  const frameMat=new THREE.MeshStandardMaterial({color:0x6b5a3a,roughness:.4,metalness:.65,emissive:0x2a1c08,emissiveIntensity:.4});
  for(const[fx,fz,fw,fd]of[[0,-4.25,8.9,.45],[0,4.25,8.9,.45],[-4.25,0,.45,8.9],[4.25,0,.45,8.9]]){
    const b=new THREE.Mesh(new THREE.BoxGeometry(fw,.26,fd),frameMat);
    b.position.set(fx,.06,fz);b.castShadow=true;b.receiveShadow=true;
    scene.add(b);
  }

  /* tiles */
  const tileMeshes=[];
  const lightTile=new THREE.MeshStandardMaterial({color:0xdcc79c,roughness:.7});
  const darkTile=new THREE.MeshStandardMaterial({color:0x453c72,roughness:.55,metalness:.15,emissive:0x171033,emissiveIntensity:.35});
  const tileGeo=new THREE.BoxGeometry(1,.14,1);
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const m=new THREE.Mesh(tileGeo,(r+c)%2===1?darkTile:lightTile);
    m.position.set(c-3.5,-.02,r-3.5);
    m.receiveShadow=true;
    m.userData.sq=[r,c];
    scene.add(m);
    tileMeshes[r*8+c]=m;
  }

  /* glowing grid lines so squares read clearly */
  function buildGrid(lineCss,borderCss){
    const cv=document.createElement('canvas');cv.width=cv.height=1024;
    const g=cv.getContext('2d');
    g.clearRect(0,0,1024,1024);
    g.strokeStyle=lineCss;g.lineWidth=5;
    g.shadowColor=lineCss;g.shadowBlur=10;
    for(let i=0;i<=8;i++){
      const p=i*128;
      g.beginPath();g.moveTo(p,0);g.lineTo(p,1024);g.stroke();
      g.beginPath();g.moveTo(0,p);g.lineTo(1024,p);g.stroke();
    }
    g.strokeStyle=borderCss;g.lineWidth=10;
    g.strokeRect(5,5,1014,1014);
    const t=new THREE.CanvasTexture(cv);
    t.anisotropy=8;
    return t;
  }
  const gridPlane=new THREE.Mesh(new THREE.PlaneGeometry(8.04,8.04),new THREE.MeshBasicMaterial({map:buildGrid('rgba(96,190,220,.42)','rgba(224,186,104,.7)'),transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  gridPlane.rotation.x=-Math.PI/2;gridPlane.position.y=TOP_Y+.012;
  scene.add(gridPlane);

  /* hover outline + last-move markers */
  function outlineTexture(color){
    const cv=document.createElement('canvas');cv.width=cv.height=128;
    const g=cv.getContext('2d');
    g.strokeStyle=color;g.lineWidth=9;
    g.shadowColor=color;g.shadowBlur=10;
    g.strokeRect(8,8,112,112);
    return new THREE.CanvasTexture(cv);
  }
  const hoverMark=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:outlineTexture('rgba(255,255,255,.9)'),transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  hoverMark.rotation.x=-Math.PI/2;hoverMark.position.y=TOP_Y+.018;hoverMark.visible=false;
  scene.add(hoverMark);
  const lmFrom=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:outlineTexture('rgba(140,160,255,.8)'),transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  lmFrom.rotation.x=-Math.PI/2;lmFrom.position.y=TOP_Y+.014;lmFrom.visible=false;scene.add(lmFrom);
  const lmTo=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:outlineTexture('rgba(255,215,94,.95)'),transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  lmTo.rotation.x=-Math.PI/2;lmTo.position.y=TOP_Y+.016;lmTo.visible=false;scene.add(lmTo);

  /* dedicated board light for readability */
  const boardLight=new THREE.SpotLight(0xfff2d8,2.2,30,.6,.65,1);
  boardLight.position.set(0,11,1.5);
  boardLight.target.position.set(0,0,0);
  scene.add(boardLight,boardLight.target);

  /* corner pillars + crystals */
  const crystals=[];
  const pillarMat=new THREE.MeshStandardMaterial({color:0x57506e,roughness:.85,flatShading:true});
  [[-5.6,-5.6],[-5.6,5.6],[5.6,-5.6],[5.6,5.6]].forEach(([x,z],i)=>{
    const p=new THREE.Mesh(new THREE.CylinderGeometry(.22,.34,2.3,12),pillarMat);
    p.position.set(x,1.05,z);p.castShadow=true;
    scene.add(p);
    const col=i%2?0xff5fd0:0x54d6ff;
    const cr=new THREE.Mesh(new THREE.OctahedronGeometry(.42,0),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:.9,roughness:.15,metalness:.4,transparent:true,opacity:.92}));
    cr.position.set(x,2.75,z);
    scene.add(cr);
    const pl=new THREE.PointLight(col,1.4,9,1.8);
    pl.position.set(x,2.8,z);
    scene.add(pl);
    crystals.push({cr,pl,phase:i*1.7});
  });

  /* trees */
  const treesGroup=new THREE.Group();
  scene.add(treesGroup);
  const trunkMat=new THREE.MeshStandardMaterial({color:0x4a3527,roughness:.9});
  const leafMat=new THREE.MeshStandardMaterial({color:0x2e5d52,roughness:.85,flatShading:true});
  const leafMat2=new THREE.MeshStandardMaterial({color:0x3a6d5f,roughness:.85,flatShading:true});
  [[3.1,8.4],[6.9,4.2],[-8.3,3.2],[-4.9,7.6],[-8.2,-4.4],[7.8,-3.4]].forEach(([x,z],i)=>{
    const t=new THREE.Group();
    const s=.8+((i*37)%10)/14;
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(.09,.16,1.1*s,9),trunkMat);
    tr.position.y=.55*s;tr.castShadow=true;
    t.add(tr);
    for(let k=0;k<3;k++){
      const cone=new THREE.Mesh(new THREE.ConeGeometry((.62-.15*k)*s,(.85-.12*k)*s,11),k%2?leafMat:leafMat2);
      cone.position.y=(1.15+.5*k)*s;
      cone.rotation.y=i+k;
      cone.castShadow=true;
      t.add(cone);
    }
    t.position.set(x,-.02,z);
    treesGroup.add(t);
  });

  /* glowing mushrooms */
  const shrubGroup=new THREE.Group();
  scene.add(shrubGroup);
  const mushMat=new THREE.MeshStandardMaterial({color:0xff5fd0,emissive:0xff2fb0,emissiveIntensity:1.2,roughness:.4});
  for(let i=0;i<9;i++){
    const a=Math.random()*Math.PI*2,rr=6.6+Math.random()*2;
    const x=Math.cos(a)*rr,z=Math.sin(a)*rr;
    if(Math.abs(x)<4.7&&Math.abs(z)<4.7)continue;
    const st=new THREE.Mesh(new THREE.CylinderGeometry(.03,.05,.22,8),new THREE.MeshStandardMaterial({color:0xd8cfc0,roughness:.8}));
    st.position.set(x,.09,z);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.1,14,10,0,Math.PI*2,0,Math.PI/2),mushMat);
    cap.position.set(x,.2,z);
    shrubGroup.add(st,cap);
  }

  /* waterfall */
  const fallMat=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
    uniforms:{uTime:{value:0},uTint:{value:new THREE.Color(0x8ec6e8)}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float uTime;uniform vec3 uTint;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      float x=abs(vUv.x-.5)*2.;
      float s=fract(vUv.y*2.5-uTime*.9);
      float n=hash(vec2(floor(vUv.x*16.),floor((vUv.y*2.5-uTime*.9)*10.)));
      float a=smoothstep(1.,.2,x)*(.3+.45*s+.28*n);
      a*=smoothstep(0.,.12,vUv.y)*.5+ .5;
      gl_FragColor=vec4(uTint*(.72+.55*s),a*.85);
    }`,
  });
  const wx=2.6,wz=8.55;
  const fall1=new THREE.Mesh(new THREE.PlaneGeometry(2.3,10),fallMat);
  fall1.position.set(wx,-4.9,wz);
  const fall2=fall1.clone();
  fall2.rotation.y=Math.PI/2.4;
  scene.add(fall1,fall2);
  const spring=new THREE.Mesh(new THREE.CircleGeometry(.9,24),new THREE.MeshBasicMaterial({color:0x9fe6ff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,fog:false,depthWrite:false}));
  spring.rotation.x=-Math.PI/2;spring.position.set(wx,.06,wz-.5);
  scene.add(spring);

  const splashN=110;
  const splashPos=new Float32Array(splashN*3),splashVel=new Float32Array(splashN*3),splashLife=new Float32Array(splashN);
  const respawnSplash=i=>{
    splashPos[i*3]=wx+(Math.random()-.5)*1.6;
    splashPos[i*3+1]=-9.6+Math.random()*.4;
    splashPos[i*3+2]=wz+(Math.random()-.5)*1.6;
    splashVel[i*3]=(Math.random()-.5)*1.6;
    splashVel[i*3+1]=1.6+Math.random()*2.4;
    splashVel[i*3+2]=(Math.random()-.5)*1.6;
    splashLife[i]=.5+Math.random()*.9;
  };
  for(let i=0;i<splashN;i++)respawnSplash(i);
  const splashGeo=new THREE.BufferGeometry();
  splashGeo.setAttribute('position',new THREE.Float32BufferAttribute(splashPos,3));
  const splash=new THREE.Points(splashGeo,new THREE.PointsMaterial({map:glowTex,color:0xbfe9ff,size:.28,transparent:true,opacity:.75,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
  scene.add(splash);

  /* clouds */
  const cloudTex=radialTexture('rgba(210,190,255,.8)','rgba(210,190,255,0)');
  const clouds=[];
  for(let i=0;i<11;i++){
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTex,transparent:true,opacity:.32+Math.random()*.25,depthWrite:false,fog:false}));
    const a=Math.random()*Math.PI*2,rr=9+Math.random()*16;
    s.position.set(Math.cos(a)*rr,-8-Math.random()*7,Math.sin(a)*rr);
    s.scale.set(9+Math.random()*14,4+Math.random()*5,1);
    s.userData.spd=.2+Math.random()*.5;
    clouds.push(s);
    scene.add(s);
  }

  /* floating rocks */
  const rocks=[];
  const rockM=new THREE.MeshStandardMaterial({color:0x565070,roughness:.9,flatShading:true});
  for(let i=0;i<9;i++){
    const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.3+Math.random()*.55,0),rockM);
    const o={m,a:Math.random()*Math.PI*2,r:11+Math.random()*7,y:1+Math.random()*6,spd:.05+Math.random()*.12,bob:.4+Math.random()*.8,ph:Math.random()*6};
    rocks.push(o);
    scene.add(m);
  }

  /* ambient particle FX (theme driven) */
  let fx=null;
  function makeFX(cfg){
    if(fx){scene.remove(fx.pts);fx.pts.geometry.dispose();fx.pts.material.dispose();fx=null;}
    if(!cfg)return;
    const N=cfg.count;
    const pos=new Float32Array(N*3),ph=new Float32Array(N),sp=new Float32Array(N);
    for(let i=0;i<N;i++){
      const a=Math.random()*Math.PI*2,r=6.4+Math.random()*6.8;
      pos[i*3]=Math.cos(a)*r;
      pos[i*3+1]=Math.random()*14-1;
      pos[i*3+2]=Math.sin(a)*r;
      ph[i]=Math.random()*6.28;
      sp[i]=.6+Math.random()*.8;
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    fx={
      type:cfg.mode,speed:cfg.speed||1,ph,sp,
      pts:new THREE.Points(g,new THREE.PointsMaterial({
        map:glowTex,color:cfg.color,size:cfg.size||.22,transparent:true,
        opacity:cfg.opacity===undefined?.9:cfg.opacity,depthWrite:false,fog:false,
        blending:cfg.blend==='normal'?THREE.NormalBlending:THREE.AdditiveBlending,
      })),
    };
    scene.add(fx.pts);
  }
  function updFX(dt,time){
    if(!fx)return;
    const p=fx.pts.geometry.attributes.position.array;
    const t=fx.type,spd=fx.speed;
    for(let i=0;i<p.length/3;i++){
      const i3=i*3;
      if(t==='fall'||t==='rain'){
        p[i3+1]-=spd*fx.sp[i]*dt*(t==='rain'?1.6:1);
        p[i3]+=Math.sin(time*2+fx.ph[i])*(t==='rain'?.2:1.4)*dt;
        p[i3+2]+=Math.cos(time*1.6+fx.ph[i])*1.1*dt;
        if(p[i3+1]<-1.5){
          p[i3+1]=13;
          const a=Math.random()*Math.PI*2,r=6.4+Math.random()*6.8;
          p[i3]=Math.cos(a)*r;p[i3+2]=Math.sin(a)*r;
        }
      }else if(t==='rise'){
        p[i3+1]+=spd*fx.sp[i]*dt;
        p[i3]+=Math.sin(time*1.3+fx.ph[i])*.9*dt;
        p[i3+2]+=Math.cos(time*1.1+fx.ph[i])*.9*dt;
        if(p[i3+1]>13.5){
          p[i3+1]=-1.2;
          const a=Math.random()*Math.PI*2,r=6.4+Math.random()*6.8;
          p[i3]=Math.cos(a)*r;p[i3+2]=Math.sin(a)*r;
        }
      }else{
        p[i3]+=Math.sin(time*fx.sp[i]*.6+fx.ph[i])*.9*dt;
        p[i3+1]+=Math.cos(time*fx.sp[i]*.8+fx.ph[i])*.6*dt;
        p[i3+2]+=Math.cos(time*fx.sp[i]*.5+fx.ph[i])*.9*dt;
      }
    }
    fx.pts.geometry.attributes.position.needsUpdate=true;
  }

  /* ---------------- pieces ---------------- */
  const piecesGroup=new THREE.Group();
  scene.add(piecesGroup);
  const pieces=new Map();
  let selection=null;

  const selectRing=new THREE.Mesh(new THREE.RingGeometry(.4,.54,32),new THREE.MeshBasicMaterial({color:0xffd76a,transparent:true,opacity:.9,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  selectRing.rotation.x=-Math.PI/2;selectRing.visible=false;
  scene.add(selectRing);

  const markerGeo=new THREE.RingGeometry(.2,.34,26);
  const markers=[];
  function getMarker(i){
    if(!markers[i]){
      const m=new THREE.Mesh(markerGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
      m.rotation.x=-Math.PI/2;m.visible=false;
      scene.add(m);
      markers[i]=m;
    }
    return markers[i];
  }
  function clearMarkers(){for(const m of markers)m.visible=false;}

  function showSelect(sq){
    selection=sq;
    if(!sq){selectRing.visible=false;return;}
    selectRing.visible=true;
    selectRing.position.copy(sq3(sq,TOP_Y+.02));
  }

  function showTargets(moves){
    clearMarkers();
    moves.forEach((mv,i)=>{
      const m=getMarker(i);
      const to=mv.path[mv.path.length-1];
      m.visible=true;
      m.position.copy(sq3(to,TOP_Y+.015));
      const cap=mv.captures.length>0;
      m.material.color.setHex(cap?0xff5f6d:0x6ef2b0);
      m.userData.cap=cap;
      m.userData.ph=i*.7;
    });
  }

  function killPieceMesh(mesh){
    piecesGroup.remove(mesh);
  }

  function syncBoard(board,stagger=false){
    const need=new Map();
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      const p=board[r][c];
      if(p)need.set(r+','+c,{sq:[r,c],p});
    }
    for(const[k,mesh]of pieces){
      const[r,c]=k.split(',').map(Number);
      const p=board[r][c];
      if(!p||p.color!==mesh.userData.color){pieces.delete(k);killPieceMesh(mesh);}
    }
    let d=0;
    for(const[k,{sq,p}]of need){
      if(!pieces.has(k)){
        const g=makePiece(p.color);
        g.userData.sq=[...sq];
        g.position.copy(sq3(sq));
        if(p.king)addCrown(g);
        piecesGroup.add(g);
        pieces.set(k,g);
        if(stagger){
          g.scale.setScalar(.001);
          const delay=(d++)*.04;
          addTween(.45+delay,tt=>{
            const u=Math.min(1,Math.max(0,(tt-delay)/.45));
            g.scale.setScalar(Math.max(.001,easeOutBack(u)));
          },null,easeInOutQuad);
        }
      }else{
        const mesh=pieces.get(k);
        mesh.position.copy(sq3(sq));
        mesh.userData.sq=[...sq];
        if(p.king&&!mesh.userData.king){addCrown(mesh);burst(sq3(sq,.5),0xffd75e,18,.8);}
      }
    }
  }

  function removeCaptured(sq){
    const k=sqKey(sq),mesh=pieces.get(k);
    if(!mesh)return;
    pieces.delete(k);
    const C=TEAM_COLORS[mesh.userData.color];
    burst(sq3(sq,.35),C.glow,22,1.1);
    addTween(.4,t=>{
      mesh.scale.setScalar(1-t);
      mesh.rotation.y+=t*.4;
      mesh.position.y=TOP_Y+t*.6;
    },()=>killPieceMesh(mesh),easeInOutQuad);
  }

  function animateMove(move,onCapture,onProgress,opts){
    const carry=opts&&opts.carry;
    const liftStep=carry?.52:.14;
    const liftJump=carry?1.3:1.15;
    return new Promise(resolve=>{
      const k=sqKey(move.from),mesh=pieces.get(k);
      if(!mesh){resolve();return;}
      pieces.delete(k);
      let i=1;
      const stepNext=()=>{
        if(i>=move.path.length){
          mesh.userData.sq=[...move.path[i-1]];
          pieces.set(sqKey(move.path[i-1]),mesh);
          resolve();
          return;
        }
        const prev=move.path[i-1],to=move.path[i];
        const jump=Math.abs(to[0]-prev[0])===2;
        const a=mesh.position.clone(),b=sq3(to);
        addTween(jump?.34:.3,t=>{
          mesh.position.lerpVectors(a,b,t);
          mesh.position.y=TOP_Y+Math.sin(Math.PI*t)*(jump?liftJump:liftStep);
          if(onProgress)onProgress(mesh.position);
        },()=>{
          if(jump&&onCapture){
            const mid=[(prev[0]+to[0])/2,(prev[1]+to[1])/2];
            if(move.captures.some(cr=>cr[0]===mid[0]&&cr[1]===mid[1]))onCapture(mid);
          }
          i++;stepNext();
        },easeInOutQuad);
      };
      stepNext();
    });
  }

  /* ---------------- particles ---------------- */
  const bursts=[];
  function burst(pos,color=0xffffff,n=16,spread=1){
    const geo=new THREE.BufferGeometry();
    const posArr=new Float32Array(n*3),vel=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      posArr[i*3]=pos.x;posArr[i*3+1]=pos.y;posArr[i*3+2]=pos.z;
      const a=Math.random()*Math.PI*2,e=Math.random()*Math.PI-Math.PI/2;
      const sp=(1.5+Math.random()*3)*spread;
      vel[i*3]=Math.cos(a)*Math.cos(e)*sp;
      vel[i*3+1]=Math.abs(Math.sin(e))*sp*1.3+1;
      vel[i*3+2]=Math.sin(a)*Math.cos(e)*sp;
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(posArr,3));
    const mat=new THREE.PointsMaterial({map:glowTex,color,size:.22,transparent:true,opacity:1,depthWrite:false,fog:false,blending:THREE.AdditiveBlending});
    const pts=new THREE.Points(geo,mat);
    scene.add(pts);
    bursts.push({pts,vel,life:.9,max:.9});
  }

  /* ---------------- picking ---------------- */
  const raycaster=new THREE.Raycaster();
  const ptr=new THREE.Vector2();
  let pickCb=null,hoverCb=null,idle=0;

  function pick(ev){
    const rect=canvas.getBoundingClientRect();
    ptr.x=((ev.clientX-rect.left)/rect.width)*2-1;
    ptr.y=-((ev.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(ptr,camera);
    const objs=[...tileMeshes.filter(Boolean),...piecesGroup.children];
    const hits=raycaster.intersectObjects(objs,true);
    for(const h of hits){
      let o=h.object;
      while(o&&!o.userData.sq)o=o.parent;
      if(o)return o.userData.sq;
    }
    return null;
  }

  canvas.addEventListener('pointermove',ev=>{
    const sq=pick(ev);
    if(hoverCb)hoverCb(sq);
    if(sq){hoverMark.visible=true;hoverMark.position.set(sq[1]-3.5,TOP_Y+.018,sq[0]-3.5);}
    else hoverMark.visible=false;
  });
  let downPos=null;
  canvas.addEventListener('pointerdown',ev=>{downPos=[ev.clientX,ev.clientY];});
  canvas.addEventListener('pointerup',ev=>{
    if(!downPos)return;
    const dx=ev.clientX-downPos[0],dy=ev.clientY-downPos[1];
    downPos=null;
    if(dx*dx+dy*dy>36)return;
    const sq=pick(ev);
    if(sq&&pickCb)pickCb(sq);
  });
  for(const evt of['pointerdown','wheel','touchstart'])
    canvas.addEventListener(evt,()=>{idle=0;controls.autoRotate=false;},{passive:true});

  /* ---------------- resize & reframing ---------------- */
  let lastFit=0;
  function fitView(){
    const tanV=Math.tan(camera.fov*Math.PI/360);
    const fitV=5.4/tanV;
    const fitH=6.4/(tanV*Math.max(camera.aspect,.35));
    const fit=Math.max(fitV,fitH);
    if(lastFit>0){
      const d=THREE.MathUtils.clamp(
        camera.position.distanceTo(controls.target)*fit/lastFit,
        controls.minDistance,controls.maxDistance);
      const dir=camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir,d);
      controls.update();
    }
    lastFit=fit;
  }
  function resize(){
    const w=canvas.clientWidth||window.innerWidth;
    const h=canvas.clientHeight||window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
    fitView();
  }
  window.addEventListener('resize',resize);
  window.addEventListener('orientationchange',resize);
  document.addEventListener('fullscreenchange',()=>requestAnimationFrame(resize));
  if(window.visualViewport)window.visualViewport.addEventListener('resize',resize);
  resize();

  /* ---------------- themes ---------------- */
  let curTheme=DEFAULT_THEME;
  let sunBase=1.5,lightning=false,flashT=0;
  function applyTheme(id){
    const T=THEMES[id]||THEMES[DEFAULT_THEME];
    curTheme=THEMES[id]?id:DEFAULT_THEME;
    const u=sky.material.uniforms;
    u.uGround.value.set(T.sky[0]);u.uLow.value.set(T.sky[1]);
    u.uMid.value.set(T.sky[2]);u.uHigh.value.set(T.sky[3]);
    scene.fog.color.setHex(T.fog);scene.fog.density=T.fogD;
    hemi.color.setHex(T.hemi[0]);hemi.groundColor.setHex(T.hemi[1]);hemi.intensity=T.hemi[2];
    sun.color.setHex(T.sun[0]);sun.intensity=T.sun[1];sunBase=T.sun[1];
    rim.color.setHex(T.rim[0]);rim.intensity=T.rim[1];
    boardLight.color.setHex(T.board[0]);boardLight.intensity=T.board[1];
    rockMat.color.setHex(T.rock);grassMat.color.setHex(T.grass);platMat.color.setHex(T.plat);
    frameMat.color.setHex(T.frame);frameMat.emissive.setHex(T.frame).multiplyScalar(.28);
    lightTile.color.setHex(T.tileL);darkTile.color.setHex(T.tileD);
    darkTile.emissive.setHex(T.tileD).multiplyScalar(.35);
    glowRing.material.color.setHex(T.ring);
    gridPlane.material.map.dispose();
    gridPlane.material.map=buildGrid(T.grid,T.border);
    gridPlane.material.needsUpdate=true;
    crystals.forEach((c,i)=>{
      const col=T.crystals[i%2];
      c.cr.material.color.setHex(col);c.cr.material.emissive.setHex(col);
      c.pl.color.setHex(col);
    });
    fallMat.uniforms.uTint.value.setHex(T.water);
    splash.material.color.setHex(T.water);
    spring.material.color.setHex(T.water);
    leafMat.color.setHex(T.leaf);
    leafMat2.color.setHex(T.leaf).offsetHSL(0,.04,.06);
    treesGroup.visible=T.trees!==false;
    shrubGroup.visible=!!T.mush;
    if(T.mush){mushMat.color.setHex(T.mush);mushMat.emissive.setHex(T.mush);}
    for(const cl of clouds){
      cl.material.color.setHex(T.cloud[0]);
      cl.material.opacity=T.cloud[1];
      cl.visible=T.cloud[1]>.02;
    }
    stars.material.color.setHex(T.star[0]);
    stars.material.opacity=Math.min(1,T.star[1]);
    moon.material.color.setHex(T.moon);
    moonCore.material.color.setHex(T.moon);
    makeFX(T.fx);
    lightning=!!T.lightning;
    return curTheme;
  }
  applyTheme(initialTheme||DEFAULT_THEME);

  /* ---------------- loop ---------------- */
  const clock=new THREE.Clock();
  const frameCbs=[];
  let time=0,shakeAmt=0;

  function loop(){
    requestAnimationFrame(loop);
    const dt=Math.min(clock.getDelta(),.1);
    time+=dt;idle+=dt;
    if(idle>22)controls.autoRotate=true;

    stepTweens(dt);
    controls.update();

    stars.rotation.y+=dt*.004;
    fallMat.uniforms.uTime.value=time;
    glowRing.material.opacity=.6+.3*Math.sin(time*2.2);
    spring.material.opacity=.6+.25*Math.sin(time*3.1);
    selectRing.scale.setScalar(1+.08*Math.sin(time*5));

    for(const c of crystals){
      const s=1+.12*Math.sin(time*2+c.phase);
      c.cr.scale.setScalar(s);
      c.cr.rotation.y+=dt*.8;
      c.cr.position.y=2.75+Math.sin(time*1.4+c.phase)*.09;
      c.pl.intensity=1.2+.6*Math.sin(time*2+c.phase);
    }
    for(const o of rocks){
      o.a+=dt*o.spd;
      o.m.position.set(Math.cos(o.a)*o.r,o.y+Math.sin(time*o.bob+o.ph)*.5,Math.sin(o.a)*o.r);
      o.m.rotation.x+=dt*.3;o.m.rotation.y+=dt*.4;
    }
    for(const cl of clouds){
      cl.position.x+=dt*cl.userData.spd;
      if(cl.position.x>32)cl.position.x=-32;
    }
    updFX(dt,time);
    {
      const p=splashGeo.attributes.position.array;
      for(let i=0;i<splashN;i++){
        splashLife[i]-=dt;
        if(splashLife[i]<=0){respawnSplash(i);continue;}
        splashVel[i*3+1]-=6*dt;
        p[i*3]+=splashVel[i*3]*dt;
        p[i*3+1]+=splashVel[i*3+1]*dt;
        p[i*3+2]+=splashVel[i*3+2]*dt;
      }
      splashGeo.attributes.position.needsUpdate=true;
    }
    for(let i=bursts.length-1;i>=0;i--){
      const b=bursts[i];
      b.life-=dt;
      if(b.life<=0){scene.remove(b.pts);b.pts.geometry.dispose();b.pts.material.dispose();bursts.splice(i,1);continue;}
      const p=b.pts.geometry.attributes.position.array;
      for(let j=0;j<p.length/3;j++){
        b.vel[j*3+1]-=7*dt;
        p[j*3]+=b.vel[j*3]*dt;
        p[j*3+1]+=b.vel[j*3+1]*dt;
        p[j*3+2]+=b.vel[j*3+2]*dt;
      }
      b.pts.geometry.attributes.position.needsUpdate=true;
      b.pts.material.opacity=b.life/b.max;
    }
    markers.forEach(m=>{
      if(m.visible)m.scale.setScalar(1+.15*Math.sin(time*4+(m.userData.ph||0)));
    });

    if(lightning){
      if(flashT>0){
        flashT-=dt;
        sun.intensity=sunBase+4.5*Math.max(0,flashT)*Math.random();
      }else{
        sun.intensity=sunBase;
        if(Math.random()<dt*.32)flashT=.24+Math.random()*.12;
      }
    }else if(sun.intensity!==sunBase)sun.intensity=sunBase;

    for(const cb of frameCbs)cb(dt);
    let sh=null;
    if(shakeAmt>.001){
      sh=new THREE.Vector3((Math.random()-.5),(Math.random()-.5),(Math.random()-.5)).multiplyScalar(shakeAmt*.4);
      camera.position.add(sh);
      shakeAmt=Math.max(0,shakeAmt-dt*1.4);
    }
    renderer.render(scene,camera);
    if(sh)camera.position.sub(sh);
  }
  loop();

  return {
    onPick(cb){pickCb=cb;},
    onHover(cb){hoverCb=cb;},
    onFrame(cb){frameCbs.push(cb);},
    addObject(o){scene.add(o);},
    get cam(){return{camera,controls,scene};},
    setTheme(id){return applyTheme(id);},
    currentTheme(){return curTheme;},
    removeObject(o){scene.remove(o);},
    makeGroup(x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);return g;},
    sqToVec(sq,y){return sq3(sq,y===undefined?TOP_Y:y);},
    burstVec(v,color,n){burst(v,color,n||18,1);},
    shake(m){shakeAmt=Math.max(shakeAmt,m);},
    showLastMove(mv){
      if(!mv){lmFrom.visible=lmTo.visible=false;return;}
      lmFrom.visible=true;lmTo.visible=true;
      lmFrom.position.copy(sq3(mv.from,TOP_Y+.014));
      lmTo.position.copy(sq3(mv.path[mv.path.length-1],TOP_Y+.016));
    },
    syncBoard,
    animateMove,
    removeCaptured,
    showSelect,
    showTargets,
    clearMarkers,
    burst(sq,color,n){burst(sq3(sq,.5),color,n,1);},
    sqToScreen(sq){
      const v=sq3(sq).project(camera);
      return [(v.x*.5+.5)*window.innerWidth,(1-(v.y*.5+.5))*window.innerHeight];
    },
    pickAt(x,y){return pick({clientX:x,clientY:y});},
    celebrate(color){
      const C=TEAM_COLORS[color];
      for(let i=0;i<3;i++)
        setTimeout(()=>burst(new THREE.Vector3((Math.random()-.5)*4,1.5,(Math.random()-.5)*4),C.glow,36,1.4),i*260);
    },
  };
}
