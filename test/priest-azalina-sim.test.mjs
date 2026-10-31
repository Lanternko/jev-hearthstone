import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,handCard,costOf} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';

// decks/priest-azalina (2026-10-31, R-165): Azalina Soulsever's 40 Health and copied deck, Mind Sweeper,
// Unshackle Soul, Moonwell, Dark Deacon and Dark Terraforming. The list is the HSReplay Moon list with
// the Medivh package (Medivh, Atiesh, Karazhan) swapped for cards seen in ranked games.
const DB=cardDb(),LIST=loadList('priest-azalina'),CTHUN=loadList('priest-azalina-cthun'),ZAKAJZ=loadList('warlock-zakajz');
const C=(id,entityId,over={})=>({...rawCard(DB[id],entityId),...over});
const H=(id,entityId,over)=>handCard(C(id,entityId,over),true);
const table=({hand=[],deck=[],oppDeck=[],mana=10,seed=7}={})=>{
  const s=newGame({lists:[LIST,LIST],seed});
  return {...s,mana,crystals:mana,hand,deck,them:{...s.them,hand:[],deck:oppDeck}};
};
const step=(s,m)=>apply(s,m).s;
const play=(s,id,targetId)=>step(s,{kind:'play',id,...(targetId!=null?{targetId}:{})});
const filler=(n,at=80)=>Array.from({length:n},(_,i)=>C('RLK_532',at+i));
const minions=bs=>bs.filter(b=>b.type==='MINION');
const body=(s,side,over={})=>({...hero(s,side),id:-9,type:'MINION',name:'Boar',text:'',raw:{CARDTYPE:'MINION',name:'Boar'},
  atk:1,hp:5,maxHp:5,armor:0,
  taunt:false,ds:false,stealth:false,poison:false,lifesteal:false,windfury:false,rush:false,ignoreTaunt:false,
  dormant:false,immune:false,frozen:false,elusive:false,reborn:false,legendary:false,canAttack:false,attacks:0,
  maxAttacks:1,side,...over});

test('both Azalina lists are twenty cards and every card is a step at twenty mana', ()=>{
  for(const list of [LIST,CTHUN]){
  assert.equal(Object.values(list.cards).reduce((a,b)=>a+b,0),20);
  for(const id of Object.keys(list.cards)){
    let s=table({hand:[H(id,50)],deck:filler(5),oppDeck:filler(5),mana:20});
    s={...s,me:[...s.me,body(s,'me',{id:-8})],opp:[...s.opp,body(s,'opp')]};
    assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50),DB[id].name);
  }
  }
});

test('Azalina starts at 40 Health with 20 cards copied from the enemy deck', ()=>{
  for(const [lists,k] of [[[LIST,ZAKAJZ],0],[[ZAKAJZ,LIST],1]]){
    const s=newGame({lists,seed:3});
    const az=k===0?{h:s.me[0],deck:s.deck,hand:s.hand}:{h:s.opp[0],deck:s.them.deck,hand:s.them.hand};
    assert.deepEqual([az.h.hp,az.h.maxHp],[40,40]);
    const cards=[...az.deck,...az.hand.map(c=>c.raw)].filter(c=>c.cardId!=='GAME_005');
    assert.equal(cards.length,40);
    const copied=cards.filter(c=>c.copied);
    assert.equal(copied.length,20);
    for(const c of copied)assert.ok(ZAKAJZ.cards[c.cardId],c.cardId);
    // R-167: a card can be copied more than once, never more often than the enemy list holds it.
    const n={};for(const c of copied)n[c.cardId]=(n[c.cardId]??0)+1;
    for(const [id,k] of Object.entries(n))assert.ok(k<=ZAKAJZ.cards[id],`${id} ${k}>${ZAKAJZ.cards[id]}`);
    const plain=newGame({lists:[ZAKAJZ,ZAKAJZ],seed:3});
    assert.equal(plain.me[0].hp,30,'only the Azalina seat changes');
  }
});

test('Azalina draws until the hand is full', ()=>{
  let s=table({hand:[H('JAIL_430',50),H('RLK_532',51)],deck:filler(12),oppDeck:filler(5)});
  s=play(s,50);
  assert.equal(s.hand.length,10);
});

test('Mind Sweeper hits every enemy minion for 2 only after a copied card was played', ()=>{
  const setup=hand=>{let s=table({hand,deck:filler(5),oppDeck:filler(5)});
    return {...s,opp:[...s.opp,body(s,'opp',{id:-9}),body(s,'opp',{id:-10,hp:2,maxHp:2})]}};
  let s=setup([H('JAIL_432',50),H('RLK_532',51,{copied:true})]);
  s=play(s,51);s=play(s,50);
  assert.deepEqual(minions(s.opp).map(b=>b.hp),[3]);
  s=setup([H('JAIL_432',50),H('RLK_532',51)]);
  s=play(s,51);s=play(s,50);
  assert.deepEqual(minions(s.opp).map(b=>b.hp),[5,2]);
});

test('Unshackle Soul costs 1 after a copied card and destroys a minion', ()=>{
  let s=table({hand:[H('JAIL_433',50),H('RLK_532',51,{copied:true})],deck:filler(5),oppDeck:filler(5)});
  s={...s,opp:[...s.opp,body(s,'opp',{hp:12,maxHp:12})]};
  assert.equal(costOf(s,s.hand[0]),5);
  s=play(s,51);
  assert.equal(costOf(s,s.hand.find(c=>c.id===50)),1);
  s=play(s,50,-9);
  assert.equal(minions(s.opp).length,0);
});

test('Dark Deacon offers a C\'Thun ability after two Shadow spells were cast while held', ()=>{
  let s=table({hand:[H('BE_012',50),H('CORE_EX1_197',51),H('CORE_EX1_197',52)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,51);s=play(s,52);s=play(s,50);
  assert.equal(s.choice?.kind,'cthun');
  s=table({hand:[H('BE_012',50),H('CORE_EX1_197',51)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,51);s=play(s,50);
  assert.equal(s.choice,null);
});

test('Dark Terraforming deals 5 to the target and one less to each neighbour outward', ()=>{
  let s=table({hand:[H('BE_EVENT_102',50)],deck:filler(5),oppDeck:filler(5)});
  const row=[-11,-12,-13,-14].map(id=>body(s,'opp',{id,hp:9,maxHp:9}));
  s={...s,opp:[...s.opp,...row]};
  s=play(s,50,-12);
  assert.deepEqual(minions(s.opp).map(b=>b.hp),[5,4,5,6]);
});

test('Moonwell deals 4 to every enemy character and restores 4 to every friendly one', ()=>{
  let s=table({hand:[H('EDR_476',50)],deck:filler(5),oppDeck:filler(5)});
  s={...s,me:[...s.me,body(s,'me',{id:-8,hp:2,maxHp:5})],opp:[...s.opp,body(s,'opp',{id:-9,hp:6,maxHp:6}),body(s,'opp',{id:-10,ds:true})]};
  hero(s,'me').hp=30;
  const face=hero(s,'opp').hp;
  s=play(s,50);
  assert.equal(hero(s,'opp').hp,face-4);
  assert.deepEqual(minions(s.opp).map(b=>[b.hp,b.ds]),[[2,false],[5,false]]);
  assert.equal(hero(s,'me').hp,34);
  assert.deepEqual(minions(s.me).map(b=>b.hp),[5]);
});

test('Entropic Rift gives two random Shadow spells the simulator can play', ()=>{
  let s=table({hand:[H('BE_220',50)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  assert.equal(s.hand.length,2);
  for(const c of s.hand){assert.equal(c.raw.CARDTYPE,'SPELL');assert.equal(c.raw.school,'SHADOW',c.name)}
});
