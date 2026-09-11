import {owns} from './economy.js';
import {keyFor,emit} from './scope.js';

const EKEY='ad-equip';
const EQUIP_DEFAULTS={skin:'default',throne:'default',victory:'default',board:'island',clock:'auto',look:'wanderer',shape:'disc',palette:'emberfrost'};

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
/* avatar looks: free base looks, then points, then points+cash premium.
   design maps to makeAvatar headgear (0 hood · 1 wizard-hat · 2 cap+bun ·
   3 horns · 4 halo · 5 flat-cap); finish/glow tweak the robe+trim; skin/hair
   index into the actor palettes (omitted = seeded per player). */
export const AVATARS={
  wanderer:{name:'Wandering Adept',price:0,design:5},
  hooded:{name:'Greyhood',price:0,design:0},
  ascetic:{name:'Ash Ascetic',price:250,design:2,finish:{roughness:.95,metalness:.02}},
  archmage:{name:'Archmage',price:500,design:1,glow:1.7},
  wilding:{name:'Horned Wilding',price:700,cash:3.99,design:3,skin:3,hair:0,finish:{roughness:.72,metalness:.32}},
  celestial:{name:'Celestial',price:900,cash:5.99,design:4,skin:0,hair:3,glow:2.4,finish:{roughness:.4,metalness:.18,emissive:.22}},
};
/* piece silhouettes — ids match the geometry builders in pieces.js */
export const SHAPES={
  disc:{name:'War-disc',price:0},
  square:{name:'Chequer Block',price:0},
  roundel:{name:'Roundel',price:0},
  octagon:{name:'Ochard Octagon',price:250},
  hex:{name:'Hexpriest',price:300},
  obelisk:{name:'Obelisk',price:350},
  cog:{name:'Ratchet Cog',price:400},
  star:{name:'Star Sigil',price:500,cash:2.99},
  crystal:{name:'Shardkin',price:550,cash:2.99},
  totem:{name:'Totem',price:600},
  bloom:{name:'Bloom',price:650,cash:3.99},
  helix:{name:'Helix',price:800,cash:4.99},
  monolith:{name:'Void Monolith',price:900,cash:5.99},
  court:{name:'The Court',price:1200,cash:7.99},
};
/* army palettes — recolour both sides at once (params → pieces.setArmy) */
export const PALETTES={
  emberfrost:{name:'Ember & Frost',price:0,
    params:{red:{body:0xe8593f,dark:0x7c2418,glow:0xff7a3c},black:{body:0x5ab7e8,dark:0x164a70,glow:0x54d6ff}}},
  goldvoid:{name:'Gilt & Void',price:250,
    params:{red:{body:0xffd257,dark:0x8a6a12,glow:0xffb020},black:{body:0x7a5ac0,dark:0x241040,glow:0x9a6ae0}}},
  coralteal:{name:'Coral & Tide',price:300,
    params:{red:{body:0xff6f61,dark:0x7c2f2a,glow:0xff9a86},black:{body:0x2ec4b6,dark:0x0d5c57,glow:0x5fe0d0}}},
  boneember:{name:'Bone & Cinder',price:500,
    params:{red:{body:0xece3cf,dark:0x6b5f45,glow:0xfff0c8},black:{body:0xff5a1f,dark:0x5c1e08,glow:0xff8a3c}}},
  chromerust:{name:'Chrome & Rust',price:700,cash:3.99,
    params:{red:{body:0xdfe6ee,dark:0x5a6470,glow:0xcfe0ff},black:{body:0xb5623a,dark:0x4a2414,glow:0xff7a4a}}},
  inkgold:{name:'Ink & Leaf',price:900,cash:4.99,
    params:{red:{body:0x2a2f3a,dark:0x0c0e14,glow:0x7a8aac},black:{body:0xf2c14e,dark:0x7a5410,glow:0xffdf80}}},
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
  fungalkelp:{name:'Fungal Kelpwood',price:500},
  tidetable:{name:'The Tide Table',price:450},
  abysslantern:{name:'Abyss Lantern',price:600,cash:4.99},
  thermalvent:{name:'Thermal Vent',price:500},
  theanvil:{name:'The Anvil',price:550},
  cinderchoir:{name:'Cinder Choir',price:600,cash:4.99},
  obsidianmirror:{name:'Obsidian Mirrorglass',price:650,cash:5.99},
  frozenbell:{name:'The Frozen Bell',price:400},
  borealvault:{name:'Boreal Vault',price:550,cash:3.99},
  glacierthroat:{name:'Glacier Throat',price:500},
  eventhorizon:{name:'Event Horizon',price:900,cash:7.99},
  derelict:{name:'Derelict',price:500},
  colosseum:{name:'Sunken Colosseum',price:450},
  grandstair:{name:'The Grand Stair',price:550,cash:3.99},
  inkgold:{name:'Ink & Gold',price:600,cash:4.99},
  ossuary:{name:'Ossuary Court',price:550},
  underriver:{name:'The Under-River',price:500},
  candlecrypt:{name:'Candle Crypt',price:650,cash:4.99},
  hourglassroom:{name:'The Hourglass Room',price:700,cash:5.99},
  mirrorstorm:{name:'Mirror Maelstrom',price:800,cash:6.99},
  clockgarden:{name:'The Clockwork Garden',price:600},
  amberdune:{name:'Amber Dune Sea',price:450},
  stormkeep:{name:'Stormkeep Ramparts',price:500},
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
for(const cat of[SKINS,AVATARS,SHAPES,PALETTES,THRONES,VICTORIES,THEMEPACKS,BOARDS,CLOCKS]){
  for(const[id,it]of Object.entries(cat))if((it.price||0)===0)FREE_IDS.add(id);
}

export function getEquip(){
  try{
    const e=JSON.parse(localStorage.getItem(keyFor(EKEY))||'null');
    if(e)return {...EQUIP_DEFAULTS,...e};
  }catch(e){}
  return {...EQUIP_DEFAULTS};
}
export function setEquip(slot,id){
  const e=getEquip();
  e[slot]=id;
  try{localStorage.setItem(keyFor(EKEY),JSON.stringify(e));}catch(err){}
  emit('equip',e);
}
/* server -> cache, without bouncing a write back to the server.
   Server rows only carry synced slots (skin/throne/...); local-only slots
   (look/shape/palette/theme) are preserved from the cached loadout. */
export function hydrateEquip(e){
  const merged={...EQUIP_DEFAULTS,...getEquip(),...(e||{})};
  try{localStorage.setItem(keyFor(EKEY),JSON.stringify(merged));}catch(err){}
}
export const freshEquip=()=>({...EQUIP_DEFAULTS});
export function pieceSkinParams(){
  return (SKINS[getEquip().skin]||SKINS.default).params||{};
}
export function avatarLook(){
  return AVATARS[getEquip().look]||AVATARS.wanderer;
}
export function armyPalette(){
  return (PALETTES[getEquip().palette]||PALETTES.emberfrost).params||null;
}
export function unlocked(itemId){
  if(itemId==='default'||FREE_IDS.has(itemId))return true;
  return owns(itemId);
}
export function catalogFor(cat){
  return {Looks:AVATARS,Shapes:SHAPES,Palettes:PALETTES,Pieces:SKINS,Boards:BOARDS,Thrones:THRONES,Clocks:CLOCKS,Triumphs:VICTORIES,Realms:THEMEPACKS}[cat]||null;
}
export function allCatalog(){
  return [
    ['Looks',AVATARS],
    ['Shapes',SHAPES],
    ['Palettes',PALETTES],
    ['Pieces',SKINS],
    ['Boards',BOARDS],
    ['Thrones',THRONES],
    ['Clocks',CLOCKS],
    ['Triumphs',VICTORIES],
    ['Realms',THEMEPACKS],
  ];
}
