import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,handCard,costOf,gameModel} from '../src/sim.mjs';
import {textOf} from '../src/mechanics.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';

// decks/priest-egg (2026-10-27): the Egg of Khelos's five cracked stages, Medivh's Triumph, the clears,
// N'Zoth's cost and the rest of the list the zoo lost to.
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
const egg=s=>s.me.find(b=>b.name==='The Egg of Khelos');
const body=(s,side,over={})=>({...hero(s,side),id:-9,type:'MINION',name:'Boar',text:'',raw:{CARDTYPE:'MINION',name:'Boar'},
  atk:1,hp:5,maxHp:5,armor:0,
  taunt:false,ds:false,stealth:false,poison:false,lifesteal:false,windfury:false,rush:false,ignoreTaunt:false,
  dormant:false,immune:false,frozen:false,elusive:false,reborn:false,legendary:false,canAttack:false,attacks:0,
  maxAttacks:1,side,...over});

test('the list is thirty cards, decodes to the given code, and every card is a step at twenty mana', ()=>{
  assert.equal(Object.values(LIST.cards).reduce((a,b)=>a+b,0),30);
  assert.equal(LIST.hero,'HERO_09bk');
  assert.equal(LIST.power,'HERO_09dbp');
  // The Imbue / Intertwined Fate build the human egg priests play (2026-10-27).
  assert.deepEqual(LIST.cards,{'CORE_CS1_130':2,BE_223:1,TIME_447:1,CORE_EX1_193:1,JAIL_940:1,DINO_411:2,EDR_449:2,END_025:2,
    BE_221:2,CAP_801:2,EDR_970:2,DINO_410:1,TIME_432:2,JAIL_998:1,TLC_816:1,EDR_856:1,CORE_EX1_197:1,CAP_805:1,TIME_427:1,
    CATA_308:2,JAIL_912:1});
  for(const id of Object.keys(LIST.cards)){
    let s=table({hand:[H(id,50)],deck:filler(5),oppDeck:filler(5),mana:20});
    s={...s,me:[...s.me,body(s,'me',{id:-8})],opp:[...s.opp,body(s,'opp')]};
    assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50),DB[id].name);
  }
});

test('the Egg of Khelos passes through five cracked stages and hatches the 20/20 Taunt Khelos', ()=>{
  const smites=Array.from({length:5},(_,i)=>H('CORE_CS1_130',60+i));
  let s=table({hand:[H('DINO_410',50),...smites],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  assert.equal(egg(s).cardId,'DINO_410');
  assert.equal(s.rattles,1,'playing the Egg counts as a Deathrattle minion summoned');
  for(const [i,want] of ['DINO_410t2','DINO_410t3','DINO_410t4','DINO_410t5'].entries()){
    s=play(s,60+i,egg(s).id);
    assert.equal(egg(s)?.cardId,want,`break ${i+2}`);
    assert.equal(s.rattles,i+2);
  }
  s=play(s,64,egg(s).id);
  assert.equal(egg(s),undefined,'the fifth break hatches');
  const khelos=s.me.find(b=>b.name==='Khelos');
  assert.ok(khelos,'Khelos is on the board');
  assert.deepEqual([khelos.atk,khelos.hp,khelos.taunt],[20,20,true]);
  assert.equal(s.rattles,5,'five Deathrattle eggs; Khelos has none');
});

test('Servant of Zuramat silences the Egg, so breaking it summons nothing', ()=>{
  let s=table({hand:[H('DINO_410',50),H('BE_228',51),H('CORE_CS1_130',52)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  s=play(s,51,egg(s).id);
  assert.equal(egg(s).silenced,true);
  const id=egg(s).id;
  s=play(s,52,id);
  assert.equal(egg(s),undefined,'a silenced Egg stays dead');
  assert.ok(!minions(s.me).some(b=>b.name==='The Egg of Khelos'));
});

test("Medivh's Triumph costs 5, or 1 with a Legendary, and deals 4 to every minion", ()=>{
  let s=table({hand:[H('CATA_308',50)],deck:filler(5),oppDeck:filler(5)});
  s={...s,me:[...s.me,body(s,'me',{id:-8,atk:6,hp:6,maxHp:6})],opp:[...s.opp,body(s,'opp',{atk:6,hp:6,maxHp:6})]};
  assert.equal(costOf(s,s.hand[0]),5);
  let withEgg=table({hand:[H('DINO_410',51),H('CATA_308',50)],deck:filler(5),oppDeck:filler(5)});
  withEgg=play(withEgg,51);
  assert.ok(withEgg.me.some(b=>b.legendary),'the Egg is a Legendary card');
  assert.equal(costOf(withEgg,withEgg.hand[0]),1);
  s=play(s,50);
  assert.deepEqual(minions(s.me).map(b=>b.hp),[2]);
  assert.deepEqual(minions(s.opp).map(b=>b.hp),[2]);
});

test("N'Zoth, Dream's End costs 1 less for every Deathrattle minion summoned this game", ()=>{
  const smite=Array.from({length:2},(_,i)=>H('CORE_CS1_130',60+i));
  let s=table({hand:[H('DINO_410',50),H('BE_017',51),...smite],deck:filler(5),oppDeck:filler(5),mana:20});
  const nz=()=>s.hand.find(c=>c.name==="N'Zoth, Dream's End");
  assert.equal(costOf(s,nz()),15);
  s=play(s,50);
  assert.equal(costOf(s,nz()),14);
  s=play(s,60,egg(s).id);
  assert.equal(costOf(s,nz()),13);
  s=play(s,61,egg(s).id);
  assert.equal(costOf(s,nz()),12);
});

test('Shadow Word: Ruin destroys every minion with 5 or more Attack and leaves the rest', ()=>{
  let s=table({hand:[H('CORE_EX1_197',50)],deck:filler(5),oppDeck:filler(5),mana:10});
  s={...s,me:[...s.me,body(s,'me',{id:-8,atk:5,hp:5,maxHp:5})],
    opp:[...s.opp,body(s,'opp',{id:-9,atk:6,hp:6,maxHp:6}),body(s,'opp',{id:-10,atk:4,hp:4,maxHp:4})]};
  s=play(s,50);
  assert.equal(minions(s.me).length,0);
  assert.deepEqual(minions(s.opp).map(b=>b.id),[-10]);
});

test('Haunt gives +2/+3, Reborn and Taunt, and the body returns once at 1 Health', ()=>{
  let s=table({hand:[H('CAP_801',50)],deck:filler(5),oppDeck:filler(5)});
  s={...s,me:[...s.me,body(s,'me',{id:-8,atk:2,hp:2,maxHp:2})]};
  s=play(s,50,-8);
  const b=s.me.find(x=>x.id===-8);
  assert.deepEqual([b.atk,b.hp,b.maxHp,b.taunt,b.reborn],[4,5,5,true,true]);
  s={...s,me:s.me.map(x=>x.id===-8?{...x,hp:0}:x)};
  s=step(s,{kind:'end'});                                   // the deathrattle fires as the turn passes
  const back=s.opp.find(x=>x.name==='Boar');
  assert.ok(back,'Reborn brings the body back');
  assert.equal(back.hp,1);
});

test("Slime 'em! destroys every minion and both seats get the Ectoplasm that resummons their own", ()=>{
  let s=table({hand:[H('CAP_805',50)],deck:filler(5),oppDeck:filler(5)});
  s={...s,me:[...s.me,body(s,'me',{id:-8,atk:2,hp:2,maxHp:2})],
    opp:[...s.opp,body(s,'opp',{id:-9,atk:3,hp:3,maxHp:3}),body(s,'opp',{id:-10,atk:4,hp:4,maxHp:4})]};
  s=play(s,50);
  assert.equal(minions(s.me).length,0);
  assert.equal(minions(s.opp).length,0);
  assert.ok(s.hand.some(c=>c.name==='Ectoplasm'),'our Ectoplasm');
  assert.ok(s.them.hand.some(c=>c.name==='Ectoplasm'),'theirs');
  const ecto=s.hand.find(c=>c.name==='Ectoplasm');
  assert.equal(ecto.cost,3);
  s=play(s,ecto.id);
  assert.deepEqual(minions(s.me).map(b=>[b.name,b.atk,b.hp]),[['Boar',2,2]]);
  assert.equal(s.slimePile.length,0);
});

test('Kaldorei Priestess takes 2 Attack off every enemy minion and Holy Eggbearer draws a 0-Attack minion', ()=>{
  let s=table({hand:[H('EDR_970',50),H('DINO_411',51)],deck:[C('DINO_410',60),C('RLK_532',61)],oppDeck:filler(5)});
  s={...s,opp:[...s.opp,body(s,'opp',{id:-9,atk:3,hp:3,maxHp:3})]};
  s=play(s,50);
  assert.equal(minions(s.opp)[0].atk,1);
  assert.deepEqual([s.power.name,s.power.bless,s.power.heal],['Blessing of the Moon',1,0],'the Imbue turns Lesser Heal into Blessing of the Moon');
  s=play(s,51);
  assert.ok(s.hand.some(c=>c.name==='The Egg of Khelos'),'the 0-Attack minion is the Egg');
  assert.ok(!s.hand.some(c=>c.name==='Boar'),'the 2-Attack body stays in the deck');
});

test('Soothsayer restores 6 Health and summons a random 6-Cost minion when it dies', ()=>{
  let s=table({hand:[H('JAIL_912',50)],deck:filler(5),oppDeck:filler(5)});
  const h=hero(s,'me');
  s={...s,me:s.me.map(b=>b.type==='HERO'?{...b,hp:15}:b)};
  s=play(s,50);
  const sooth=s.me.find(b=>b.name==='Soothsayer');
  assert.deepEqual([sooth.atk,sooth.hp,sooth.taunt],[6,6,true]);
  s={...s,me:s.me.map(b=>b.id===sooth.id?{...b,hp:0}:b)};
  s=step(s,{kind:'end'});
  assert.equal(hero(s,'opp').hp,21,'the heal lands on its owner');
  assert.ok(s.opp.filter(b=>b.type==='MINION').length>=1,'a 6-Cost minion came along');
});

test('Undeath Sentence triggers the Egg\'s Deathrattle again from the grave', ()=>{
  let s=table({hand:[H('DINO_410',50),H('CORE_CS1_130',51),H('JAIL_940',52)],deck:filler(5),oppDeck:filler(5)});
  s=play(s,50);
  s=play(s,51,egg(s).id);
  assert.equal(s.grave.length,1);
  s=play(s,52);
  const eggs=minions(s.me).filter(b=>b.name==='The Egg of Khelos');
  assert.deepEqual(eggs.map(b=>b.cardId).sort(),['DINO_410t2','DINO_410t2']);
});

test('the models read the cards by their text', ()=>{
  const m=id=>gameModel({type:DB[id].type,text:textOf(DB[id])});
  assert.deepEqual(m('DINO_410'),{kind:'minion',egg:true});
  assert.deepEqual(m('CATA_308'),{kind:'aoe',damage:4});
  assert.deepEqual(m('CAP_805'),{kind:'slime'});
  assert.equal(m('BE_017').nzoth,true);
  assert.equal(m('JAIL_912').kind,'minion');
});

// 2026-10-27: copies of the egg lost their cardId and text, so a Haunted or Slimed egg came back
// as a blank 0/3 that never cracked again and the priest's self-crack engine was cut short.
test('a Haunted egg cracks to the next stage and its Reborn copy is still an egg that cracks', ()=>{
  let s=table({hand:[H('DINO_410',50),H('CAP_801',51),...[52,53,54].map(i=>H('CORE_CS1_130',i))],deck:filler(5),oppDeck:filler(5),mana:30});
  s=play(s,50);s=play(s,51,egg(s).id);
  s=play(s,52,egg(s).id);s=play(s,53,egg(s).id);            // 6 Health: two Smites kill it
  const eggs=minions(s.me).filter(b=>b.name==='The Egg of Khelos');
  assert.deepEqual(eggs.map(b=>b.cardId).sort(),['DINO_410','DINO_410t2']);
  const copy=eggs.find(b=>b.cardId==='DINO_410');
  assert.deepEqual([copy.atk,copy.hp,copy.taunt,copy.reborn],[0,1,false,false]);   // Haunt's buff is gone
  s=play(s,54,copy.id);
  assert.deepEqual(minions(s.me).map(b=>b.cardId).sort(),['DINO_410t2','DINO_410t2']);
});

test("Slime 'em! cracks the egg and the Ectoplasm egg cracks again", ()=>{
  let s=table({hand:[H('DINO_410',50),H('CAP_805',51),H('CORE_CS1_130',52)],deck:filler(5),oppDeck:filler(5),mana:30});
  s=play(s,50);s=play(s,51);
  s=play(s,s.hand.find(c=>c.name==='Ectoplasm').id);
  assert.deepEqual(minions(s.me).map(b=>b.cardId).sort(),['DINO_410','DINO_410t2']);
  s=play(s,52,minions(s.me).find(b=>b.cardId==='DINO_410').id);
  assert.deepEqual(minions(s.me).map(b=>b.cardId).sort(),['DINO_410t2','DINO_410t2']);
});

test("Ectoplasm brings a Haunted, damaged egg back as the printed 0/3 at the stage it died", ()=>{
  let s=table({hand:[H('DINO_410',50),H('CAP_801',51),H('CORE_CS1_130',52),H('CAP_805',53)],deck:filler(5),oppDeck:filler(5),mana:30});
  s=play(s,50);s=play(s,51,egg(s).id);s=play(s,52,egg(s).id);   // 2/3 Taunt Reborn
  s=play(s,53);                                                // Slime: t2 cracks out and Reborn returns a 0/1
  s=play(s,s.hand.find(c=>c.name==='Ectoplasm').id);
  const back=minions(s.me).filter(b=>b.cardId==='DINO_410'&&b.hp===3);
  assert.equal(back.length,1);
  assert.deepEqual([back[0].atk,back[0].taunt,back[0].reborn],[0,false,false]);
});

test('Endbringer Umbra triggers five different deaths, so each dead egg stage cracks again', ()=>{
  let s=table({hand:[H('DINO_410',50),...[60,61,62,63].map(i=>H('CORE_CS1_130',i)),H('TLC_106',70)],deck:filler(5),oppDeck:filler(5),mana:40});
  s=play(s,50);for(const i of [60,61,62,63])s=play(s,i,egg(s).id);
  assert.deepEqual(minions(s.me).map(b=>b.cardId),['DINO_410t5']);
  s=play(s,70);
  assert.deepEqual(minions(s.me).map(b=>b.cardId).filter(id=>/^DINO/.test(id)).sort(),
    ['DINO_410t2','DINO_410t3','DINO_410t4','DINO_410t5','DINO_410t5']);
});
