import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,apply,hero,hpOf,handCard,body,costOf} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard} from '../src/selfplay.mjs';

// Self-play models for the category 3 warlock-zoo cards: the two Rituals, Floating Lessons and
// Godfather Kazakus (docs/warlock-zoo-sim-coverage.md).
const DB=cardDb(),ZOO=loadList('warlock-zoo');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const H=(id,entityId)=>handCard(C(id,entityId),true);
const table=({hand=[],deck=[],oppHand,oppDeck=[],mana=10}={})=>{
  const s=newGame({lists:[ZOO,ZOO],seed:7});
  return {...s,mana,crystals:mana,hand,deck,them:{...s.them,hand:oppHand??s.them.hand,deck:oppDeck}};
};
const step=(s,m)=>apply(s,m).s;
const play=(s,id,targetId)=>step(s,{kind:'play',id,...(targetId!=null?{targetId}:{})});
const end=s=>step(s,{kind:'end'});
const cycle=s=>end(end(s));                      // the opponent's turn, then the next one of ours
const choose=(s,id)=>step(s,{kind:'choose',id});
const minions=bs=>bs.filter(b=>b.type==='MINION').map(b=>[b.name,b.atk,b.hp]);
const yetis=n=>Array.from({length:n},(_,i)=>C('CS2_182',80+i));
const canPlay=(s,id)=>moves(s).some(m=>m.kind==='play'&&m.id===id);
const still={canAttack:false,targets:new Set(),maxAttacks:1};
const own=(s,id,entityId)=>{s.me.push({...body(C(id,entityId),'me'),...still});return s};
const enemy=(s,id,entityId)=>{s.opp.push({...body(C(id,entityId),'opp'),...still});return s};

test('Ritual of Summoning: nothing at our first turn start, two 3/5 Taunts at the second', ()=>{
  let s=play(table({hand:[H('BE_085',50)],deck:yetis(12),oppDeck:yetis(12)}),50);
  assert.equal(s.mana,8);
  s=cycle(s);
  assert.deepEqual(minions(s.me),[]);
  s=cycle(s);
  assert.deepEqual(minions(s.me),[["C'thrax Brute",3,5],["C'thrax Brute",3,5]]);
  assert.ok(s.me.filter(b=>b.type==='MINION').every(b=>b.taunt&&!b.canAttack));
  assert.deepEqual(s.timers,[]);
  assert.equal(minions(cycle(s).me).length,2);       // it fires once
});

test('Ritual of Summoning: the opponent\'s turns do not count, and a full board takes fewer', ()=>{
  let s=table({hand:[H('BE_085',50)],deck:yetis(12),oppDeck:yetis(12)});
  for(let i=0;i<6;i++)own(s,'CS2_182',90+i);
  s=play(s,50);
  s=end(s);                                           // the opponent's turn start: not ours
  assert.deepEqual([s.them.timers.length,s.them.timers[0].left],[1,2]);
  s=end(s);s=cycle(s);
  assert.equal(minions(s.me).filter(m=>m[0]==="C'thrax Brute").length,1);
});

test('Ritual of C\'Thun: no pick at the first turn start, four abilities at the second', ()=>{
  let s=enemy(table({hand:[H('BE_726',50)],deck:yetis(12),oppDeck:yetis(12)}),'CS2_182',90);
  s=play(s,50);
  assert.equal(s.mana,9);
  s=cycle(s);
  assert.equal(s.choice,null);
  s=cycle(s);
  assert.deepEqual([s.choice.kind,s.choice.options],['cthun',['BE_013t1','BE_013t2','BE_013t3','BE_013t4']]);
  assert.deepEqual(moves(s).map(m=>m.kind),['choose','choose','choose','choose']);
});

test('Ritual of C\'Thun: each of the four abilities', ()=>{
  const at=(foes,mine)=>{
    let s=table({hand:[H('BE_726',50)],deck:yetis(12),oppDeck:yetis(12)});
    for(let i=0;i<foes;i++)enemy(s,'CS2_182',90+i);
    for(let i=0;i<mine;i++)own(s,'CS2_182',70+i);
    return cycle(cycle(play(s,50)));
  };
  // Wrath: seven points among the hero and the Yeti, one at a time.
  let s=choose(at(1,0),'BE_013t1');
  assert.equal(30-hpOf(hero(s,'opp'))+5-(s.opp.find(b=>b.type==='MINION')?.hp??0),7);
  // Domain: two of three other friendly minions, or the only one.
  s=choose(at(0,3),'BE_013t2');
  assert.deepEqual(minions(s.me).map(m=>m.join('/')).sort(),['Chillwind Yeti/4/5','Chillwind Yeti/6/8','Chillwind Yeti/6/8']);
  assert.deepEqual(minions(choose(at(0,1),'BE_013t2').me),[['Chillwind Yeti',6,8]]);
  // Glare: Lifesteal, five to the enemy minion chosen; with no enemy minion it is not offered.
  let g=at(2,0);hero(g,'me').hp=20;
  g=choose(g,'BE_013t3');
  assert.equal(g.choice.kind,'glare');
  assert.equal(g.choice.options.length,2);
  g=choose(g,g.choice.options[0]);
  assert.deepEqual([minions(g.opp).length,hero(g,'me').hp],[1,25]);
  assert.deepEqual(at(0,0).choice.options,['BE_013t1','BE_013t2','BE_013t4']);
  // Servants: two 2/3 Taunts.
  s=choose(at(0,0),'BE_013t4');
  assert.deepEqual(minions(s.me),[['Faceless Fanatic',2,3],['Faceless Fanatic',2,3]]);
  assert.ok(s.me.filter(b=>b.type==='MINION').every(b=>b.taunt));
});

test('Floating Lessons: the target and a random minion in hand get double the cost, Mawman included', ()=>{
  let s=table({hand:[H('CS2_182',52),H('BE_729',50),H('BE_094',51),H('CS2_182',53)],deck:yetis(5)});
  s=play(play(s,52),50);
  const aim=moves(s).filter(m=>m.id===51).map(m=>m.targetId).sort();
  assert.deepEqual(aim,[50,52]);
  assert.equal(costOf(s,s.hand.find(c=>c.id===51)),2);
  s=play(s,51,52);
  assert.deepEqual(minions(s.me),[['Chillwind Yeti',8,9],['Mawman Cultist',4,4]]);
  assert.deepEqual([s.hand[0].atk,s.hand[0].hp],[8,9]);
  // At its printed cost it is +2/+2 and works on an enemy; no minion in hand: the target only.
  s=enemy(table({hand:[H('BE_094',51)],deck:yetis(5)}),'CS2_182',90);
  s=play(s,51,90);
  assert.deepEqual(minions(s.opp),[['Chillwind Yeti',6,7]]);
  assert.equal(canPlay(table({hand:[H('BE_094',51)],deck:yetis(5)}),51),false);
});

test('Godfather Kazakus: two picks of three that never repeat, then the trial\'s length', ()=>{
  for(const [id,cost,turns] of [['CAP_405tb1',7,0],['CAP_405tb2',4,1],['CAP_405tb3',0,4]]){
    let s=play(table({hand:[H('CAP_405',50)],deck:yetis(5)}),50);
    assert.deepEqual(minions(s.me),[['Godfather Kazakus',3,3]]);
    const first=s.choice.options;
    assert.equal(new Set(first).size,3);
    s=choose(s,first[1]);
    const second=s.choice.options;
    assert.equal(new Set(second).size,3);
    assert.ok(!second.includes(first[1]));
    s=choose(s,second[2]);
    assert.deepEqual(s.choice.options,['CAP_405tb1','CAP_405tb2','CAP_405tb3']);
    s=choose(s,id);
    const trial=s.hand.at(-1);
    assert.deepEqual([trial.cost,trial.trial.turns,trial.trial.effects],[cost,turns,[first[1],second[2]]]);
    assert.equal(s.choice,null);
  }
});

test('Kazakus\' trial: Rushed at once, Grueling at our next turn, Unending at our fourth', ()=>{
  const turnsOf={CAP_405tb1:0,CAP_405tb2:1,CAP_405tb3:4};
  const fresh=id=>{
    const s=table({hand:[{...H(id,60),trial:{turns:turnsOf[id],effects:['CAP_405t8','CAP_405t4']}}],deck:yetis(30),oppDeck:yetis(30)});
    hero(s,'me').hp=10;
    return s;
  };
  let s=play(fresh('CAP_405tb1'),60);                 // heal 12, draw 3
  assert.deepEqual([hero(s,'me').hp,s.hand.length,s.deck.length,s.mana],[22,3,27,3]);
  s=play(fresh('CAP_405tb2'),60);
  assert.deepEqual([hero(s,'me').hp,s.hand.length,s.mana],[10,0,6]);
  s=cycle(s);
  assert.deepEqual([hero(s,'me').hp,s.deck.length],[22,26]);        // 3 from the trial, 1 for the turn
  s=play(fresh('CAP_405tb3'),60);
  assert.equal(s.mana,10);
  for(let i=1;i<=3;i++){s=cycle(s);assert.equal(hero(s,'me').hp,10,`turn ${i}`)}
  s=cycle(s);
  assert.equal(hero(s,'me').hp,22);
});

test('Kazakus\' effects: fight, control, steal, buff, cost, summons, Voidlord', ()=>{
  const cast=(effect,foes=0)=>{
    const t={...H('CAP_405tb1',60),trial:{turns:0,effects:[effect,'CAP_405t8']}};
    const s=table({hand:[t,H('CS2_182',61),H('BE_151',62)],deck:yetis(8),
      oppHand:[H('CS2_182',70),H('BE_086',71),H('BE_151',72)]});
    for(let i=0;i<foes;i++)enemy(s,'CS2_182',90+i);
    return play(s,60);
  };
  let s=cast('CAP_405t1',2);                          // each swings once: 4 into 5 twice kills both
  assert.deepEqual(minions(s.opp),[]);
  s=cast('CAP_405t2',2);
  assert.deepEqual([minions(s.me).length,minions(s.opp).length],[1,1]);
  s=cast('CAP_405t3');
  assert.deepEqual([s.hand.length,s.them.hand.length],[4,1]);
  s=cast('CAP_405t5');
  assert.deepEqual(s.hand.map(c=>[c.atk,c.hp]),[[7,8],[6,6]]);
  s=cast('CAP_405t6');
  assert.equal(minions(s.me).length,3);
  s=cast('CAP_405t7');
  assert.deepEqual(s.hand.map(c=>c.cost),[2,3]);
  s=cast('CAP_405t9');
  assert.deepEqual(minions(s.me),[['Voidlord',3,9]]);
  assert.ok(s.me.find(b=>b.type==='MINION').taunt);
  s.me.find(b=>b.type==='MINION').hp=0;
  s=end(s);
  assert.deepEqual(minions(s.opp),[['Demon',1,3],['Demon',1,3],['Demon',1,3]]);
});
