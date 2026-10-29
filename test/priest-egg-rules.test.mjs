import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,handCard,costOf} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';
import {vocabulary,encode,actSize} from '../src/selfplay-encode.mjs';

// decks/priest-egg, the user's rulings of 2026-10-28: the Elder Word repeats on the next Shadow spell,
// Prepare spends the mana left for X+1 off the card, Kaldorei Priestess's -2 Attack lasts until our
// next turn, and Gravedawn Sunbloom's Kindred looks at the Holy cards of our last turn.
const DB=cardDb(),LIST=loadList('priest-egg');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const H=(id,entityId)=>handCard(C(id,entityId),true);
const table=({hand=[],deck=[],oppDeck=[],mana=10,seed=7}={})=>{
  const s=newGame({lists:[LIST,LIST],seed});
  return {...s,mana,crystals:mana,hand,deck,them:{...s.them,hand:[],deck:oppDeck}};
};
const step=(s,m)=>apply(s,m).s;
const play=(s,id,targetId)=>step(s,{kind:'play',id,...(targetId!=null?{targetId}:{})});
const end=s=>step(s,{kind:'end'});
const filler=(n,at=80)=>Array.from({length:n},(_,i)=>C('RLK_532',at+i));
const body=(s,side,over={})=>({...hero(s,side),id:-9,type:'MINION',name:'Boar',text:'',raw:{CARDTYPE:'MINION',name:'Boar'},
  atk:1,hp:5,maxHp:5,armor:0,
  taunt:false,ds:false,stealth:false,poison:false,lifesteal:false,windfury:false,rush:false,ignoreTaunt:false,
  dormant:false,immune:false,frozen:false,elusive:false,reborn:false,legendary:false,canAttack:false,attacks:0,
  maxAttacks:1,side,...over});

test('the card data carries the spell school', ()=>{
  assert.equal(C('BE_223',1).school,'SHADOW');
  assert.equal(C('TLC_816',1).school,'HOLY');
  assert.equal(C('CAP_805',1).school,'SHADOW');
});

test('Elder Word: Flay repeats on the next Shadow spell, once, and a Holy spell in between does not use it up', ()=>{
  let s=table({hand:[H('BE_223',50),H('TLC_816',51),H('BE_223',52),H('CAP_805',53)],deck:filler(8),oppDeck:filler(5)});
  const face=()=>hero(s,'opp').hp,hp0=face();
  s=play(s,50);
  assert.equal(face(),hp0-3,'Flay itself');
  assert.equal(s.elderWord?.kind,'flay');
  s=play(s,51);                                                   // Gravedawn Sunbloom: Holy
  assert.equal(face(),hp0-3,'a Holy spell does not repeat it');
  assert.equal(s.elderWord?.kind,'flay','and does not use it up');
  s=play(s,52);
  assert.equal(face(),hp0-9,'the second Flay deals 3 and repeats the first');
  assert.equal(s.elderWord?.kind,'flay','the second Flay waits for the next Shadow spell');
  s=play(s,53);                                                   // Slime 'em!: Shadow
  assert.equal(face(),hp0-12,"Slime 'em! repeats the second Flay");
  assert.equal(s.elderWord,null,'and the repeat is spent');
});

test('Elder Word: Foresight repeats its draw on the next Shadow spell, and the repeat waits through the turn end', ()=>{
  let s=table({hand:[H('BE_221',50),H('BE_223',51)],deck:filler(8),oppDeck:filler(8)});
  s=play(s,50);
  assert.equal(s.hand.length,2,'Flay and the drawn card');
  assert.equal(s.hand.find(c=>c.id!==51).cost,Math.max(0,DB.RLK_532.cost-2),'two cheaper');
  s=end(end(s));
  assert.equal(s.elderWord?.kind,'drawReduce','still waiting on our next turn');
  const n=s.hand.length;
  s=play(s,51);
  assert.equal(s.hand.length,n,'Flay leaves the hand and the repeated Foresight draws one');
  assert.equal(s.elderWord?.kind,'flay');
});

test('Prepare spends all the mana left and the card costs that plus one less, once a card', ()=>{
  let s=table({hand:[H('JAIL_998',50),H('JAIL_912',51)],deck:filler(8),oppDeck:filler(8),mana:2});
  assert.ok(moves(s).some(m=>m.kind==='prepare'&&m.id===50));
  assert.ok(moves(s).some(m=>m.kind==='prepare'&&m.id===51));
  const v=vocabulary([LIST,LIST],DB,{stages:true,imbue:true});
  const e=encode(s,moves(s),v);
  assert.ok(e.acts.every(a=>a.length===actSize(v)),'the step vector keeps its size');
  s=step(s,{kind:'prepare',id:50});
  assert.equal(s.mana,0);
  assert.equal(s.hand.find(c=>c.id===50).cost,0,'Defias Smuggler 3 - (2+1)');
  assert.ok(!moves(s).some(m=>m.kind==='prepare'&&m.id===50),'once a card');
  s=step(s,{kind:'prepare',id:51});
  assert.equal(s.hand.find(c=>c.id===51).cost,6,'Soothsayer 7 - (0+1)');
  s=end(end(s));
  assert.equal(s.hand.find(c=>c.id===51).cost,6,'the cut stays in hand');
});

test('Prepare is a step of whole games only: the live planner never offers it', ()=>{
  const s={...table({hand:[H('JAIL_998',50)],mana:2}),game:null};
  assert.ok(!moves(s).some(m=>m.kind==='prepare'));
});

test("Kaldorei Priestess's -2 Attack lasts through the opponent's turn and wears off when ours begins", ()=>{
  let s=table({hand:[H('EDR_970',50)],deck:filler(8),oppDeck:filler(8)});
  s={...s,opp:[...s.opp,body(s,'opp',{id:-7,atk:3}),body(s,'opp',{id:-8,atk:1})]};
  s=play(s,50);
  const atk=(st,side,id)=>st[side].find(b=>b.id===id).atk;
  assert.deepEqual([atk(s,'opp',-7),atk(s,'opp',-8)],[1,0]);
  s=end(s);
  assert.deepEqual([atk(s,'me',-7),atk(s,'me',-8)],[1,0],'still down on their turn');
  s=end(s);
  assert.deepEqual([atk(s,'opp',-7),atk(s,'opp',-8)],[3,1],'back at our next turn');
});

test('Gravedawn Sunbloom costs 2 less after a Holy card on our last turn, not this one', ()=>{
  let s=table({hand:[H('TLC_816',50),H('TLC_816',51)],deck:filler(10),oppDeck:filler(10)});
  const sun=id=>costOf(s,s.hand.find(c=>c.id===id));
  assert.equal(sun(51),4);
  s=play(s,50);
  assert.equal(sun(51),4,'a Holy card this turn does not count yet');
  s=end(end(s));
  assert.equal(sun(51),2,'Kindred: a Holy card last turn');
  s=end(end(s));
  assert.equal(sun(51),4,'a turn with no Holy card');
});
