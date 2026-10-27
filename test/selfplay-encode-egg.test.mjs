import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,hero} from '../src/sim.mjs';
import {newGame,loadList,cardDb} from '../src/selfplay.mjs';
import {vocabulary,encode,obsSize} from '../src/selfplay-encode.mjs';

// decks/priest-egg (2026-10-27): the Egg of Khelos breaks through five 0/3 stages that share a name
// and a vocabulary slot. With `stages` each body of each chair shows how many breaks it still has,
// so the network can tell DINO_410 from DINO_410t5; the nets made before the block go without it.
const DB=cardDb(),PRIEST=loadList('priest-egg'),ZOO=loadList('warlock-zoo');
const V=vocabulary([PRIEST,ZOO],undefined,{timers:true,extra:true,stages:true});
const OLD=vocabulary([PRIEST,ZOO],undefined,{timers:true,extra:true});
const egg=(s,side,id,cardId)=>({...hero(s,side),id,type:'MINION',cardId,name:DB[cardId].name,text:DB[cardId].text??'',
  raw:{CARDTYPE:'MINION',cardId,name:DB[cardId].name,text:DB[cardId].text??''},
  atk:0,hp:3,maxHp:3,armor:0,taunt:false,ds:false,stealth:false,poison:false,lifesteal:false,windfury:false,rush:false,
  ignoreTaunt:false,dormant:false,immune:false,frozen:false,elusive:false,reborn:false,legendary:false,
  canAttack:false,attacks:0,maxAttacks:1,side});
const plain=(s,side,id)=>({...egg(s,side,id,'RLK_532'),atk:1,hp:5,maxHp:5,name:'Boar'});

test('the stage block is fourteen cells, and only a vocabulary that asks for it has them', ()=>{
  assert.equal(obsSize(V),obsSize(OLD)+14);
  assert.equal(V.stages,true);
  assert.equal(OLD.stages,false);
  const s=newGame({lists:[PRIEST,ZOO],seed:7});
  assert.equal(encode(s,moves(s),OLD).obs.length,obsSize(OLD));
  assert.equal(encode(s,moves(s),V).obs.length,obsSize(V));
});

test('each egg on either side shows its breaks remaining, the other bodies zero', ()=>{
  const s0=newGame({lists:[PRIEST,ZOO],seed:7});
  const s={...s0,me:[...s0.me,egg(s0,'me',-81,'DINO_410'),egg(s0,'me',-82,'DINO_410t4'),plain(s0,'me',-83)],
    opp:[...s0.opp,egg(s0,'opp',-84,'DINO_410t3'),egg(s0,'opp',-85,'DINO_410t')]};
  const {obs}=encode(s,moves(s),V),at=obsSize(V)-14;
  assert.deepEqual([obs[at],obs[at+1],obs[at+2]],[1,2/5,0],'mine: five breaks, two, not an egg');
  assert.deepEqual([obs[at+7],obs[at+8]],[3/5,0],'theirs: three breaks left; Khelos is no egg');
});

test("the old vocabulary keeps the state the older nets were trained on", ()=>{
  assert.deepEqual(OLD.names,vocabulary([PRIEST,ZOO]).names,'the flags do not move a card');
  assert.equal(obsSize(OLD),30+7*8+7*6+4*OLD.size+33+1);
  assert.equal(obsSize(vocabulary([PRIEST,ZOO])),30+7*8+7*6+4*OLD.size);
});
