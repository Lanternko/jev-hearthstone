import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,handCard,gameModel} from '../src/sim.mjs';
import {textOf} from '../src/mechanics.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';
import {eggGuard} from '../src/egg-guard.mjs';

// decks/priest-egg, the Imbue build (2026-10-27): Blessing of the Moon, the copies of the opponent's
// deck, Power Word: Barrier, Cleansing Lightspawn, Defias Smuggler, Elder Word: Flay, and the Haunt on
// our own Egg.
const DB=cardDb(),LIST=loadList('priest-egg');
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
  atk:1,hp:5,maxHp:5,armor:0,
  taunt:false,ds:false,stealth:false,poison:false,lifesteal:false,windfury:false,rush:false,ignoreTaunt:false,
  dormant:false,immune:false,frozen:false,elusive:false,reborn:false,legendary:false,canAttack:false,attacks:0,
  maxAttacks:1,side,...over});

test('every new card of the build is read from its card text', ()=>{
  const want={EDR_449:'minion',TIME_432:'fate',CORE_EX1_193:'minion',TIME_447:'barrier',TIME_427:'minion',JAIL_998:'minion',BE_223:'flay'};
  for(const [id,kind] of Object.entries(want)){
    const m=gameModel({type:DB[id].type,text:textOf({text:DB[id].text})});
    assert.equal(m?.kind,kind,DB[id].name);
  }
  assert.ok(gameModel({type:'MINION',text:textOf({text:DB.EDR_449.text})}).imbue);
  assert.ok(gameModel({type:'MINION',text:textOf({text:DB.EDR_970.text})}).imbue);
});

test('Imbue turns Lesser Heal into Blessing of the Moon, and every Imbue cuts its card one more', ()=>{
  let s=table({hand:[H('EDR_449',50),H('EDR_449',51)],deck:filler(5),oppDeck:filler(5)});
  assert.equal(s.power.heal,2,'Lesser Heal to start');
  s=play(s,50);
  assert.deepEqual([s.power.name,s.power.bless,s.power.cost,s.power.heal],['Blessing of the Moon',1,2,0]);
  s=play(s,51);
  assert.equal(s.power.bless,2);
  assert.ok(minions(s.me).every(b=>b.lifesteal),'Lunarwing Messenger has Lifesteal');
});

test('Blessing of the Moon offers Priest cards the mana left can pay, and the pick is Temporary and cheaper', ()=>{
  let s=table({hand:[H('EDR_449',50),H('EDR_449',51)],deck:filler(5),oppDeck:filler(5),mana:7});
  s=play(s,50);s=play(s,51);                       // 7 - 2 - 2 = 3 mana; Imbue 2
  s=step(s,{kind:'power',id:s.power.id});           // 1 mana left
  assert.equal(s.mana,1);
  assert.equal(s.choice.kind,'bless');
  assert.ok(s.choice.options.length>=2&&s.choice.options.length<=3);
  for(const id of s.choice.options){
    assert.equal(DB[id].cardClass,'PRIEST',DB[id].name);
    assert.ok(Math.max(0,DB[id].cost-2)<=1,`${DB[id].name} is playable after the cut`);
  }
  const pick=s.choice.options[0];
  s=step(s,{kind:'choose',id:pick});
  const got=s.hand.find(c=>c.raw.cardId===pick);
  assert.ok(got?.temp,'Temporary');
  assert.equal(got.cost,Math.max(0,DB[pick].cost-2));
  assert.ok(!moves(s).some(m=>m.kind==='power'),'once a turn');
  s=step(s,{kind:'end'});
  assert.ok(!s.them.hand.some(c=>c.raw.cardId===pick&&c.temp),'discarded at the end of the turn');
});

test('Intertwined Fate copies one card of our deck and then one of theirs', ()=>{
  const ours=[C('DINO_410',60),C('CORE_CS1_130',61),C('CAP_801',62),C('END_025',63)];
  const theirs=[C('CORE_EX1_197',70),C('JAIL_912',71)];
  let s=table({hand:[H('TIME_432',50)],deck:ours,oppDeck:theirs});
  s=play(s,50);
  assert.equal(s.choice.kind,'fate1');
  assert.equal(s.choice.options.length,3);
  for(const id of s.choice.options)assert.ok(ours.some(d=>d.cardId===id));
  const mine=s.choice.options[0];
  s=step(s,{kind:'choose',id:mine});
  assert.equal(s.choice.kind,'fate2');
  assert.deepEqual([...s.choice.options].sort(),['CORE_EX1_197','JAIL_912']);
  s=step(s,{kind:'choose',id:'JAIL_912'});
  assert.equal(s.choice,null);
  assert.deepEqual(s.hand.map(c=>c.raw.cardId).sort(),[mine,'JAIL_912'].sort());
  assert.equal(s.deck.length,4,'copies: our deck keeps its cards');
  assert.equal(s.them.deck.length,2,'and so does theirs');
});

test('Psychic Conjurer copies a card of the opponent\'s deck', ()=>{
  let s=table({hand:[H('CORE_EX1_193',50)],deck:filler(5),oppDeck:[C('CORE_EX1_197',70)]});
  s=play(s,50);
  assert.deepEqual(s.hand.map(c=>c.raw.cardId),['CORE_EX1_197']);
  assert.equal(s.them.deck.length,1);
  assert.ok(minions(s.me).some(b=>b.name==='Psychic Conjurer'));
});

test('Power Word: Barrier shields a friendly minion and gives the minions in hand +2 Health; Cleansing Lightspawn hits as hard as its Health', ()=>{
  let s=table({hand:[H('TIME_447',50),H('TIME_427',51),H('CORE_CS1_130',52)],deck:filler(5),oppDeck:filler(5)});
  assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50&&m.targetId==null),'no friendly minion: still castable for the hand');
  s={...s,me:[...s.me,body(s,'me',{id:-8})],opp:[...s.opp,body(s,'opp',{id:-9,atk:2,hp:8,maxHp:8})]};
  s=play(s,50,-8);
  assert.ok(s.me.find(b=>b.id===-8).ds);
  assert.equal(s.hand.find(c=>c.id===51).hp,5,'Lightspawn 2/3 -> 2/5');
  const h=hero(s,'me');s={...s,me:s.me.map(b=>b===h?{...b,hp:20}:b)};
  s=play(s,51,-9);
  assert.equal(s.opp.find(b=>b.id===-9).hp,3,'5 damage, its Health');
  assert.equal(hero(s,'me').hp,25,'Lifesteal heals as much');
});

test('Defias Smuggler gives a friendly minion +2 Attack and Rush; with none it is still a body', ()=>{
  let s=table({hand:[H('JAIL_998',50),H('EDR_449',51)],deck:filler(5),oppDeck:filler(5)});
  assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50&&m.targetId==null));
  s={...s,opp:[...s.opp,body(s,'opp',{id:-9})]};
  s=play(s,51);
  const bird=s.me.find(b=>b.name==='Lunarwing Messenger');
  assert.ok(!moves(s).some(m=>m.kind==='attack'&&m.id===bird.id),'summoning sick');
  s=play(s,50,bird.id);
  const b2=s.me.find(b=>b.id===bird.id);
  assert.equal(b2.atk,5);
  const hits=moves(s).filter(m=>m.kind==='attack'&&m.id===bird.id).map(m=>m.targetId);
  assert.deepEqual(hits,[-9],'Rush: minions only');
});

test('Elder Word: Flay deals 3 to a random enemy', ()=>{
  let s=table({hand:[H('BE_223',50)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  assert.equal(hero(s,'opp').hp,27,'an empty board: the hero');
});

test('the egg guard casts Haunt on our own Egg, once', ()=>{
  let s=table({hand:[H('DINO_410',50),H('CAP_801',51),H('CAP_801',52)],deck:filler(5),oppDeck:filler(5)});
  assert.equal(eggGuard(s,moves(s)),null,'no Egg on the board');
  s=play(s,50);
  const egg=s.me.find(b=>b.cardId==='DINO_410');
  const m=eggGuard(s,moves(s));
  assert.deepEqual([m.kind,m.targetId],['play',egg.id]);
  s=step(s,m);
  const e=s.me.find(b=>b.id===egg.id);
  assert.deepEqual([e.atk,e.hp,e.taunt,e.reborn],[2,6,true,true]);
  assert.equal(eggGuard(s,moves(s)),null,'already Haunted');
});
