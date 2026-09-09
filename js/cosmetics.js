import {owns} from './economy.js';

export const SKINS={
  default:{name:'Terra Sigil',price:0,params:{}},
  slate:{name:'Slate & Bone',price:200,params:{body:{roughness:.85,metalness:.05},dark:{roughness:.95},glow:.05}},
  obsidian:{name:'Obsidian & Gold',price:600,params:{body:{roughness:.18,metalness:.85},dark:{roughness:.3,metalness:.7},glow:.22}},
  coral:{name:'Living Coral',price:450,params:{body:{roughness:.65,metalness:0,emissiveBoost:1.4},dark:{roughness:.8},glow:.3}},
  clockwork:{name:'Clockwork Brass',price:550,params:{body:{roughness:.3,metalness:.95},dark:{roughness:.45,metalness:.9},glow:.15}},
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
};

export function getEquip(){
  try{
    const e=JSON.parse(localStorage.getItem('ad-equip')||'null');
    if(e)return {skin:'default',throne:'default',victory:'default',...e};
  }catch(e){}
  return {skin:'default',throne:'default',victory:'default'};
}
export function setEquip(slot,id){
  const e=getEquip();
  e[slot]=id;
  try{localStorage.setItem('ad-equip',JSON.stringify(e));}catch(err){}
}
export function unlocked(itemId){
  if(itemId==='default')return true;
  return owns(itemId);
}
export function pieceSkinParams(){
  return (SKINS[getEquip().skin]||SKINS.default).params||{};
}
export function allCatalog(){
  return [
    ['Pieces',SKINS],
    ['Thrones',THRONES],
    ['Triumphs',VICTORIES],
    ['Realms',THEMEPACKS],
  ];
}
