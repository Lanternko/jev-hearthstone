import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {moves,apply,hero,handCard} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';
import {vocabulary,encode,obsSize,actSize} from '../src/selfplay-encode.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {eggGuard} from '../src/egg-guard.mjs';
import {Arena} from '../src/selfplay-env.mjs';
import {match} from '../src/selfplay-match.mjs';

// decks/priest-egg (2026-10-28): the Imbue list turns the hero power into Blessing of the Moon, whose
// offer is cut by one for each Imbue. With `imbue` the state holds the count of each chair, and the
// cards of the Imbue list keep places of their own instead of the "other" slot (F-853). The nets made
// before it (zoo-v9 among them) keep exactly the state and the steps they were trained on.
const DB=cardDb(),PRIEST=loadList('priest-egg'),ZOO=loadList('warlock-zoo');
const V=vocabulary([PRIEST,ZOO],undefined,{timers:true,extra:true,stages:true,imbue:true});
const OLD=vocabulary([PRIEST,ZOO],undefined,{timers:true,extra:true,stages:true});
const GOLDEN=JSON.parse(readFileSync(new URL('./fixtures/zoo-v9-logits.json',import.meta.url),'utf8'));
const C=(id,e)=>rawCard(DB[id],e),H=(id,e)=>handCard(C(id,e),true);
// A table of our own: the deck in hand, no hidden cards, ten mana.
const table=({hand=[],mana=10,seed=7}={})=>{
  const s=newGame({lists:[PRIEST,ZOO],seed});
  return {...s,mana,crystals:mana,hand,them:{...s.them,hand:[],deck:[]}};
};
const play=(s,id,targetId)=>apply(s,{kind:'play',id,...(targetId!=null?{targetId}:{})}).s;

test('the Imbue block is two cells, and only a vocabulary that asks for it has them', ()=>{
  assert.equal(obsSize(V),obsSize(OLD)+2);
  assert.equal(V.imbue,true);
  assert.equal(OLD.imbue,false);
  const s=newGame({lists:[PRIEST,ZOO],seed:7});
  assert.equal(encode(s,moves(s),V).obs.length,obsSize(V));
  assert.equal(encode(s,moves(s),OLD).obs.length,obsSize(OLD));
  assert.equal(actSize(V),actSize(OLD),'the Imbue count is not part of a step');
});

test('each chair shows how often its hero power was imbued, over five and capped', ()=>{
  const s0=newGame({lists:[PRIEST,ZOO],seed:7});
  const bless=n=>({...s0.power,name:'Blessing of the Moon',cost:2,gain:0,heal:0,bless:n});
  const s={...s0,power:bless(2),them:{...s0.them,power:bless(4)}};
  const at=obsSize(V)-2,{obs}=encode(s,moves(s),V);
  assert.deepEqual([obs[at],obs[at+1]],[2/5,4/5]);
  const s2={...s,power:bless(9)};
  assert.equal(encode(s2,moves(s2),V).obs[at],1,'the count stops at five');
  const s3={...s0,power:{...bless(0),bless:undefined}};
  assert.equal(encode(s3,moves(s3),V).obs[at],0,'a power never imbued is zero');
});

test('the Imbue list keeps its own slots, and the older pilot leaves them to "other"', ()=>{
  const other=v=>v.size-1;
  const imbueNames=['Intertwined Fate','Lunarwing Messenger','Defias Smuggler','Cleansing Lightspawn','Power Word: Barrier','Elder Word: Flay'];
  for(const n of imbueNames)assert.notEqual(V.index.get(n),other(V),`${n} has a slot`);
  // The pilot P2 was trained before the list changed: every new card of it shares the "other" slot there (F-853).
  const p2=loadNet('models/selfplay/priest-egg-pilot-v2-20261027.json').vocab;
  for(const n of imbueNames)assert.equal(p2.index.has(n),false,`${n} has no slot in P2 and falls to "other" (${other(p2)})`);
  // The list's cards are known even when the run does not play the list (a vocabulary reused against it).
  const zooOnly=vocabulary([ZOO],undefined,{imbue:true});
  for(const n of imbueNames)assert.notEqual(zooOnly.index.get(n),other(zooOnly));
  assert.equal(vocabulary([ZOO]).names.includes('Intertwined Fate'),false);
});

test('zoo-v9 reads the same state and the same steps as before the Imbue cells', ()=>{
  const net=loadNet('models/selfplay/warlock-zoo-v9.json');
  assert.equal(net.vocab.imbue,false);
  assert.equal(obsSize(net.vocab),GOLDEN.obsLen);
  assert.equal(actSize(net.vocab),GOLDEN.actLen);
  const priest=loadNet('models/selfplay/priest-egg-pilot-v2-20261027.json');
  const lists=[PRIEST,ZOO];
  let sumLogits=0,sumValue=0,steps=0;
  for(const order of [[net,priest],[priest,net]]){
    let s=newGame({lists,seed:11});
    for(let n=0;n<200&&moves(s).length;n++){
      const legal=moves(s),mine=order[s.seat===0?0:1],{obs,acts}=encode(s,legal,net.vocab);
      assert.equal(obs.length,GOLDEN.obsLen);
      const {logits,value}=net.forward(obs,acts);
      sumLogits+=logits.reduce((a,b)=>a+b,0);sumValue+=value;steps++;
      s=apply(s,mine.rank(s,legal).steps[0].move).s;
    }
  }
  assert.equal(steps,GOLDEN.steps);
  assert.ok(Math.abs(sumLogits-GOLDEN.sumLogits)<1e-4,`logits ${sumLogits} against the ${GOLDEN.sumLogits} of the encoder without Imbue`);
  assert.ok(Math.abs(sumValue-GOLDEN.sumValue)<1e-4,`values ${sumValue} against ${GOLDEN.sumValue}`);
});

// decks/priest-egg: the egg guard is a step of its own, not a hint to the net. With the Arena's `egg`
// (train/ppo.py --egg) the Haunt is the only step offered while it can be played, and in a match
// (--guard egg) it is the step taken, so training and measurement see the same games.
const guarded=s=>{
  let t=table({hand:[H('DINO_410',50),H('CAP_801',51)]});
  t=play(t,50);
  return t;
};

test('with the egg guard the Haunt on our egg is the only step offered, and it is played', ()=>{
  const arena=new Arena({lists:[PRIEST,ZOO],n:1,seed:5,egg:true});
  const t=arena.tables[0];
  t.s=guarded();arena.settle(t);
  assert.ok(eggGuard(t.s,t.legal),'the guard fires on this board');
  assert.ok(t.legal.length>1,'the game itself offers more steps');
  assert.equal(arena.view(t).acts.length,1,'the net is asked about the Haunt alone');
  const egg=t.s.me.find(b=>b.cardId==='DINO_410'),id=egg.id,hp=egg.hp;
  arena.step([0]);
  const e=t.s.me.find(b=>b.id===id);
  assert.deepEqual([e.atk,e.hp,e.taunt,e.reborn],[2,hp+3,true,true],'Haunt: +2/+3, Taunt, Reborn');
});

test('without the egg guard the same board is offered every step', ()=>{
  const arena=new Arena({lists:[PRIEST,ZOO],n:1,seed:5,egg:false});
  const t=arena.tables[0];
  t.s=guarded();arena.settle(t);
  assert.equal(t.asked,null);
  assert.equal(arena.view(t).acts.length,t.legal.length);
  assert.ok(t.legal.length>1);
});

test('a match with --guard egg is asked about the Haunt alone, and a match without it never is', ()=>{
  const net=loadNet('models/selfplay/priest-egg-pilot-v2-20261027.json');
  const zoo=loadNet('models/selfplay/warlock-zoo-v9.json');
  // A step is the guard's when the one step offered is Haunt pointed at our own egg.
  const asked=g=>{
    const counts={guarded:0,steps:0};
    const seen={...net,rank:(s,legal)=>{
      counts.steps++;
      const m=legal.length===1?legal[0]:null;
      if(m&&m.kind==='play'&&s.hand.find(c=>c.id===m.id)?.raw?.cardId==='CAP_801'&&s.me.some(b=>b.id===m.targetId))counts.guarded++;
      return net.rank(s,legal);
    }};
    match([seen,zoo],[PRIEST,ZOO],{games:2,seed:3,guard:g});
    return counts;
  };
  const on=asked(true),off=asked(false);
  assert.ok(on.guarded>0,'the guard narrows the step to the Haunt at least once');
  assert.equal(off.guarded,0,'without the guard the Haunt is never the only step');
  assert.ok(off.steps>0&&on.steps===off.steps,'the same games either way');
});
