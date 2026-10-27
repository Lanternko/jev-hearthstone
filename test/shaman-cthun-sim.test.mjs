import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,handCard,gameModel} from '../src/sim.mjs';
import {textOf} from '../src/mechanics.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';

// decks/shaman-cthun (2026-10-27): Mug'Zee's C'Thun shaman, the deck the zoo met four times on the
// ladder. Eyemaul and Tiny Pal's swings, Wailing Vapor, Warden Maiev, Skywall Sentinel's Herald,
// Unstable Prototype, Watfin's Discover and Totemic Call.
const DB=cardDb(),LIST=loadList('shaman-cthun');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const H=(id,entityId)=>handCard(C(id,entityId),true);
const table=({hand=[],deck=[],oppDeck=[],mana=10,seed=7}={})=>{
  const s=newGame({lists:[LIST,LIST],seed});
  return {...s,mana,crystals:mana,hand,deck,them:{...s.them,hand:[],deck:oppDeck}};
};
const step=(s,m)=>apply(s,m).s;
const play=(s,id,targetId)=>step(s,{kind:'play',id,...(targetId!=null?{targetId}:{})});
const filler=(n,at=80)=>Array.from({length:n},(_,i)=>C('RLK_532',at+i));
const minions=bs=>bs.filter(b=>b.type==='MINION');
const body=(s,side,over={})=>({...hero(s,side),id:-9,type:'MINION',name:'Boar',text:'',raw:{CARDTYPE:'MINION',name:'Boar'},
  atk:1,hp:5,maxHp:5,armor:0,race:null,
  taunt:false,ds:false,stealth:false,poison:false,lifesteal:false,windfury:false,rush:false,ignoreTaunt:false,
  dormant:false,immune:false,frozen:false,elusive:false,reborn:false,legendary:false,canAttack:false,attacks:0,
  maxAttacks:1,side,...over});

test('the list is thirty cards with a known hero and power, and every card is a step at twenty mana', ()=>{
  assert.equal(Object.values(LIST.cards).reduce((a,b)=>a+b,0),30);
  assert.equal(LIST.hero,'HERO_02');
  assert.equal(LIST.power,'HERO_02bp');
  assert.deepEqual(LIST.cards,{BE_349:2,'CORE_UNG_809':2,JAIL_458:1,JAIL_800:1,BE_204:2,BE_013:1,DINO_411:2,
    BE_870:2,JAIL_850:1,'CORE_WC_042':2,JAIL_457:2,JAIL_EVENT_100:1,'CORE_GIL_531':2,BE_207:2,EDR_856:1,
    CATA_565:2,BE_151:2,BE_014:2});
  for(const id of Object.keys(LIST.cards))assert.ok(DB[id],`${id} is in the card database`);
  assert.match(textOf(DB[LIST.power]),/summon a random basic totem/i);
  for(const id of Object.keys(LIST.cards)){
    let s=table({hand:[H(id,50)],deck:filler(5),oppDeck:filler(5),mana:20});
    s={...s,me:[...s.me,body(s,'me',{id:-8})],opp:[...s.opp,body(s,'opp')]};
    assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50),DB[id].name);
  }
});

test('Eyemaul summons two 2/2 Rush Elementals after the hero attacks', ()=>{
  let s=table({hand:[H('BE_349',50)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  assert.equal(s.weapon.name,'Eyemaul');
  assert.equal(hero(s,'me').atk,2);
  s=step(s,{kind:'attack',id:hero(s,'me').id,targetId:hero(s,'opp').id});
  const summoned=minions(s.me).filter(b=>b.name==='Elemental');
  assert.deepEqual(summoned.map(b=>[b.atk,b.hp,b.canAttack]),[[2,2,true],[2,2,true]]);
});

test("Tiny Pal's four ammunitions fire on a swing", ()=>{
  const seen=new Set();
  for(let seed=1;seed<=24;seed++){
    let s=table({hand:[H('JAIL_458',50)],deck:filler(5),oppDeck:filler(5),seed});
    s={...s,opp:[...s.opp,body(s,'opp',{id:-9,atk:2,hp:2,maxHp:2})]};
    s=play(s,50);
    assert.equal(s.weapon.name,'Tiny Pal');
    const before=hero(s,'opp').hp,cards=s.hand.length;
    s=step(s,{kind:'attack',id:hero(s,'me').id,targetId:hero(s,'opp').id});
    if(hero(s,'opp').hp<=before-3)seen.add('blast');
    else if(minions(s.opp).some(b=>b.frozen))seen.add('freeze');
    else if(minions(s.me).length>0)seen.add('summon');
    else if(s.hand.length>cards)seen.add('battlecry');
  }
  assert.deepEqual([...seen].sort(),['battlecry','blast','freeze','summon']);
});

test('Fire Fly adds a 1/2 Flame Elemental to the hand', ()=>{
  let s=table({hand:[H('CORE_UNG_809',50)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  const flame=s.hand.find(c=>c.name==='Flame Elemental');
  assert.ok(flame,'the Elemental is in hand');
  assert.deepEqual([flame.cost,flame.atk,flame.hp],[1,1,2]);
});

test('Wailing Vapor gains +1 Attack after an Elemental is played and not after another minion', ()=>{
  let s=table({hand:[H('CORE_WC_042',50),H('RLK_532',51),H('CORE_UNG_809',52)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  const vapor=()=>s.me.find(b=>b.name==='Wailing Vapor');
  assert.equal(vapor().atk,1);
  s=play(s,51);                                         // a plain 2/2, no Elemental
  assert.equal(vapor().atk,1);
  s=play(s,52);                                         // Fire Fly is an Elemental
  assert.equal(vapor().atk,2);
});

test('Warden Maiev gives the next minion +3/+3 and Dormant for one turn', ()=>{
  let s=table({hand:[H('JAIL_850',50),H('RLK_532',51)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  const warden=s.me.find(b=>b.name==='Warden Maiev');
  assert.deepEqual([warden.atk,warden.hp],[1,3]);
  s=play(s,51);
  const buffed=s.me.find(b=>b.name==='Walking Dead');
  assert.deepEqual([buffed.atk,buffed.hp,buffed.dormant],[5,8,true]);
  s=step(s,{kind:'end'});                               // the other side's turn
  s=step(s,{kind:'end'});                               // back to us: the body wakes
  const back=s.me.find(b=>b.name==='Walking Dead');
  assert.equal(back.dormant,false);
  assert.equal(back.canAttack,true);
});

test('Hijacked Securitybot gives the other minions +1/+1, not itself', ()=>{
  let s=table({hand:[H('JAIL_457',50)],deck:filler(5),oppDeck:filler(5)});
  s={...s,me:[...s.me,body(s,'me',{id:-8,atk:1,hp:1,maxHp:1})]};
  s=play(s,50);
  const bot=s.me.find(b=>b.name==='Hijacked Securitybot');
  assert.deepEqual([bot.atk,bot.hp],[3,3]);
  assert.deepEqual([s.me.find(b=>b.id===-8).atk,s.me.find(b=>b.id===-8).hp],[2,2]);
});

test("Skywall Sentinel heralds the 1/2 Soldier of Al'Akir and its neighbours gain Attack", ()=>{
  let s=table({hand:[H('CATA_565',50)],deck:filler(5),oppDeck:filler(5)});
  s={...s,me:[...s.me,body(s,'me',{id:-8,atk:1,hp:5,maxHp:5})]};
  s=play(s,50);
  const sentinel=s.me.find(b=>b.name==='Skywall Sentinel');
  const soldier=s.me.find(b=>b.name==="Soldier of Al'Akir");
  assert.deepEqual([sentinel.atk,sentinel.hp,sentinel.taunt],[1,2,true]);
  assert.deepEqual([soldier.atk,soldier.hp],[1,2]);
  assert.equal(s.me.find(b=>b.id===-8).atk,1,'the Soldier is not beside the body: only the Sentinel is');
});

test('Unstable Prototype comes back once and buffs the minions in hand when it dies', ()=>{
  let s=table({hand:[H('BE_207',50),H('RLK_532',51)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  const proto=s.me.find(b=>b.name==='Unstable Prototype');
  s={...s,me:s.me.map(b=>b.id===proto.id?{...b,hp:0}:b)};
  s=step(s,{kind:'end'});                               // the turn passes: the buffed card is the other seat's now
  const held=s.them.hand.find(c=>c.name==='Walking Dead');
  assert.deepEqual([held.atk,held.hp],[3,6],'the 2/5 in hand is a 3/6');
  assert.ok(s.opp.some(b=>b.name==='Unstable Prototype'),'Reborn brings it back');
});

test("Watfin's Discover hands the picked minion over with +1/+1", ()=>{
  let s=table({hand:[H('JAIL_EVENT_100',50)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  assert.equal(s.choice?.kind,'discoverMinion');
  const pick=s.choice.options[0],raw=s.game.allById[pick];
  s=step(s,{kind:'choose',id:pick});
  const got=s.hand.find(c=>c.name===raw.name);
  assert.ok(got,'the picked minion is in hand');
  assert.deepEqual([got.atk,got.hp],[Number(raw.ATK)+1,Number(raw.HEALTH)+1]);
});

test('Totemic Call summons one basic Totem', ()=>{
  let s=table({hand:[],deck:filler(5),oppDeck:filler(5)});
  s=step(s,{kind:'power',id:s.power.id});
  const names=new Set(['Searing Totem','Stoneclaw Totem','Wrath of Air Totem','Healing Totem']);
  const totems=minions(s.me);
  assert.equal(totems.length,1);
  assert.ok(names.has(totems[0].name),totems[0].name);
  assert.equal(s.power.used,true);
});

test('the C\'Thun pieces and the plain bodies are playable', ()=>{
  for(const id of ['BE_013','BE_204','BE_014','JAIL_800','BE_870','CORE_GIL_531','EDR_856','DINO_411','BE_151']){
    const m=gameModel({type:DB[id].type,text:textOf(DB[id])});
    assert.ok(m&&m.kind,`${DB[id].name} has a model`);
  }
  let s=table({hand:[H('JAIL_800',50)],deck:filler(5),oppDeck:filler(5),mana:20});
  s=play(s,50);
  const zee=s.me.find(b=>b.name==="Mug'Zee");
  assert.deepEqual([zee.atk,zee.hp],[6,7]);
});

test('the models read the cards by their text', ()=>{
  const m=id=>gameModel({type:DB[id].type,text:textOf(DB[id])});
  assert.deepEqual(m('BE_349'),{kind:'weapon'});
  assert.deepEqual(m('JAIL_458'),{kind:'weapon'});
  assert.equal(m('JAIL_850').warden,true);
  assert.equal(m('CORE_WC_042').vapor,true);
  assert.deepEqual(m('JAIL_457').buffOthers,{atk:1,hp:1});
  assert.equal(m('CATA_565').herald,true);
  assert.equal(m('CORE_UNG_809').addToken,'Flame Elemental');
  assert.equal(m('JAIL_EVENT_100').discoverMinion,1);
  assert.equal(m('BE_204').cthun,'always');
  assert.equal(m('BE_014').cthun,'started');
  assert.equal(m('BE_013').oldGod,true);
});
