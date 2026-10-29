import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,handCard} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';
import {vocabulary,encode,obsSize,actSize} from '../src/selfplay-encode.mjs';
import {loadNet} from '../src/selfplay-net.mjs';

// decks/priest-egg (2026-10-28, F-861): Slime 'em! puts each chair's minions aside for its Ectoplasm.
// With `pile` the state holds the four cells at its very end: my pile over seven and the most breaks an
// egg in it has left over five, then the same for the other chair. Nets made before it keep their state.
const DB=cardDb(),PRIEST=loadList('priest-egg'),ZOO=loadList('warlock-zoo');
const V=vocabulary([PRIEST,ZOO],undefined,{timers:true,extra:true,stages:true,imbue:true,pile:true});
const OLD=vocabulary([PRIEST,ZOO],undefined,{timers:true,extra:true,stages:true,imbue:true});
const C=(id,e)=>rawCard(DB[id],e),H=(id,e)=>handCard(C(id,e),true);
const minion=(s,side,id,cardId)=>({...hero(s,side),id,type:'MINION',name:DB[cardId].name,cardId,text:DB[cardId].text??'',
  raw:C(cardId,id),atk:DB[cardId].attack??0,hp:DB[cardId].health??1,maxHp:DB[cardId].health??1,armor:0,
  taunt:false,ds:false,stealth:false,poison:false,lifesteal:false,windfury:false,rush:false,ignoreTaunt:false,
  dormant:false,immune:false,frozen:false,elusive:false,reborn:false,legendary:false,canAttack:false,attacks:0,maxAttacks:1,side});
const tail=s=>{const o=encode(s,moves(s),V).obs;return o.slice(-4)};
const near=(a,b)=>a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-9,`${a} vs ${b}`));

test('the pile block is four cells, and only a vocabulary that asks for it has them', ()=>{
  assert.equal(obsSize(V),obsSize(OLD)+4);
  assert.equal(actSize(V),actSize(OLD));
  const s=newGame({lists:[PRIEST,ZOO],seed:7});
  assert.equal(encode(s,moves(s),V).obs.length,obsSize(V));
  near(tail(s),[0,0,0,0]);
});

test("each chair shows its Slime 'em! pile and the egg in it, and Ectoplasm empties ours", ()=>{
  let s=newGame({lists:[PRIEST,ZOO],seed:7});
  s={...s,mana:10,crystals:10,hand:[H('CAP_805',50)],them:{...s.them,hand:[]}};
  s={...s,me:[...s.me,minion(s,'me',-7,'DINO_410t3'),minion(s,'me',-8,'EDR_449')],
    opp:[...s.opp,minion(s,'opp',-9,'EDR_449')]};
  s=apply(s,{kind:'play',id:50}).s;
  near(tail(s),[2/7,3/5,1/7,0]);
  const ecto=s.hand.find(c=>c.raw.cardId==='CAP_805t');
  assert.ok(ecto,'Ectoplasm in hand');
  s=apply(s,{kind:'play',id:ecto.id}).s;
  near(tail(s).slice(0,2),[0,0]);
  near(tail(s).slice(2),[1/7,0]);
});

test('the pilot made before it keeps the state it was trained on', ()=>{
  const net=loadNet('models/selfplay/priest-egg-pilot-v3-20261028.json');
  assert.equal(net.vocab.pile,false);
  const s=newGame({lists:[PRIEST,ZOO],seed:7});
  assert.equal(encode(s,moves(s),net.vocab).obs.length,obsSize(net.vocab));
});
