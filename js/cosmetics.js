import {owns} from './economy.js';

export const SKINS={
  default:{name:'Terra Sigil',price:0,params:{}},
  slate:{name:'Slate & Bone',price:200,params:{body:{roughness:.85,metalness:.05},dark:{roughness:.95},glow:.05}},
  obsidian:{name:'Obsidian & Gold',price:600,params:{body:{roughness:.18,metalness:.85},dark:{roughness:.3,metalness:.7},glow:.22}},
  coral:{name:'Living Coral',price:450,params:{body:{roughness:.65,metalness:0,emissiveBoost:1.4},dark:{roughness:.8},glow:.3}},
  clockwork:{name:'Clockwork Brass',price:550,params:{body:{roughness:.3,metalness:.95},dark:{roughness:.45,metalness:.9},glow:.15}},
  crystal:{name:'Prism Glass',price:1400,cash:9.99,params:{transmissive:true}},
  astral:{name:'Astral Glass',price:900,cash:9.99,params:{body:{roughness:.05,metalness:.2,transparent:true,opacity:.82,emissiveBoost:2.2},dark:{roughness:.2,metalness:.4},glow:.6}},
};
export const THRONES={
  default:{name:'Carved Oak',price:0},
  stone:{name:'Mournstone',price:250},
  iron:{name:'Storm Iron',price:500},
  gilded:{name:'Gilded Throne',price:800,cash:7.99},
};
export const VICTORIES={
  default:{name:'Storm Salute',price:0},
  corona:{name:'Corona Ascendant',price:350},
  eclipse:{name:'Eclipse Walk',price:700,cash:4.99},
};
export const THEMEPACKS={
  voidgarden:{name:'Void Garden',price:400},
  saltflats:{name:'The Salt Flats',price:400},
  bloodmoon:{name:'Bloodmoon Rise',price:500},
  lantern:{name:'Lantern Vale',price:500},
  worldtree:{name:'The World Tree',price:600},
  maelstrom:{name:'Eye of the Maelstrom',price:900,cash:5.99},
};
export const BOARDS={
  island:{name:'Skyhold Classic',price:0},
  noir:{name:'Noir & Gold',price:400},
  marble:{name:'Carrara Marble',price:800},
  glass:{name:'Mirrorglass Table',price:1600,cash:12.99},
};
export const CLOCKS={
  auto:{name:'World Default',price:0},
  bell:{name:'The Skeleton Bell',price:0},
  wallround:{name:'Parlour Round',price:0},
  mantel:{name:'Hearthside Mantel',price:0},
  sundial:{name:'Stone Sundial',price:300},
  hourglass:{name:'Amber Hourglass',price:350},
  tower:{name:'Belfry Tower',price:500},
  flip:{name:'Flip Card ’62',price:600},
  orbital:{name:'Orrery Chronomat',price:1100,cash:7.99},
};

const FREE_IDS=new Set();
for(const cat of[SKINS,THRONES,VICTORIES,THEMEPACKS,BOARDS,CLOCKS]){
  for(const[id,it]of Object.entries(cat))if((it.price||0)===0)FREE_IDS.add(id);
}

export function getEquip(){
  try{
    const e=JSON.parse(localStorage.getItem('ad-equip')||'null');
    if(e)return {skin:'default',throne:'default',victory:'default',board:'island',clock:'auto',...e};
  }catch(e){}
  return {skin:'default',throne:'default',victory:'default',board:'island',clock:'auto'};
}
export function setEquip(slot,id){
  const e=getEquip();
  e[slot]=id;
  try{localStorage.setItem('ad-equip',JSON.stringify(e));}catch(err){}
}
export function unlocked(itemId){
  if(itemId==='default'||FREE_IDS.has(itemId))return true;
  return owns(itemId);
}
export function catalogFor(cat){
  return {Pieces:SKINS,Boards:BOARDS,Thrones:THRONES,Clocks:CLOCKS,Triumphs:VICTORIES,Realms:THEMEPACKS}[cat]||null;
}
export function pieceSkinParams(){
  return (SKINS[getEquip().skin]||SKINS.default).params||{};
}
export function allCatalog(){
  return [
    ['Pieces',SKINS],
    ['Boards',BOARDS],
    ['Thrones',THRONES],
    ['Clocks',CLOCKS],
    ['Triumphs',VICTORIES],
    ['Realms',THEMEPACKS],
  ];
}
