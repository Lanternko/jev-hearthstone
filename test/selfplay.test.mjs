import test from 'node:test';
import assert from 'node:assert/strict';
import {fromState,moves,apply,hero,hpOf,handCard} from '../src/sim.mjs';
import {newGame,loadList,cardDb,rawCard,winner,playout,randomPolicy} from '../src/selfplay.mjs';

const DB=cardDb(),LIST=loadList('warlock-discard');
const C=(id,entityId)=>rawCard(DB[id],entityId);
const H=(id,entityId)=>handCard(C(id,entityId),true);
// Seat 0 to act, heroes 1 and 2, with exactly the hands and decks a test names.
const table=({hand=[],deck=[],oppHand=[],oppDeck=[],mana=10}={})=>{
  const s=newGame({lists:[LIST,LIST],seed:7});
  return {...s,mana,crystals:mana,hand,deck,them:{...s.them,hand:oppHand,deck:oppDeck}};
};
const step=(s,m)=>apply(s,m).s;
const play=(s,id,targetId)=>step(s,{kind:'play',id,...(targetId!=null?{targetId}:{})});
const end=s=>step(s,{kind:'end'});
const minions=bs=>bs.filter(b=>b.type==='MINION').map(b=>[b.name,b.atk,b.hp]);
const filler=n=>Array.from({length:n},(_,i)=>C('RLK_532',80+i));

test('the list is thirty cards and every one of them is a step at ten mana', ()=>{
  assert.equal(Object.values(LIST.cards).reduce((a,b)=>a+b,0),30);
  for(const id of Object.keys(LIST.cards)){
    const s=table({hand:[H(id,50),H('KAR_205',51)],deck:filler(5)});
    assert.ok(moves(s).some(m=>m.kind==='play'&&m.id===50),DB[id].name);
  }
});

test('opening: three cards and the first draw against four and The Coin', ()=>{
  const s=newGame({lists:[LIST,LIST],seed:1});
  assert.deepEqual([s.seat,s.turn,s.mana,s.crystals,s.hand.length,s.deck.length],[0,1,1,1,4,26]);
  assert.deepEqual([s.them.seat,s.them.hand.length,s.them.deck.length],[1,5,26]);
  assert.equal(s.them.hand.at(-1).name,'The Coin');
  assert.deepEqual([hpOf(hero(s,'me')),hpOf(hero(s,'opp'))],[30,30]);
});

test('the planner on a live state never sees an end step', ()=>{
  const live={turn:5,me:{mana:3,hand:[],board:[{entityId:1,CARDTYPE:'HERO',HEALTH:30,name:'Hero'}],deckCount:20,fatigue:0,drawHazards:[]},
    opponent:{board:[{entityId:2,CARDTYPE:'HERO',HEALTH:30,name:'Hero'}],hand:[]}};
  assert.deepEqual(moves(fromState(live,[])),[]);
});

test('end hands the turn over: a crystal, a card, and last turn\'s minion may attack', ()=>{
  let s=table({hand:[H('KAR_205',50)],deck:filler(3),oppDeck:filler(3),mana:3});
  s=play(s,50);
  assert.ok(!moves(s).some(m=>m.kind==='attack'));
  s=end(s);
  assert.deepEqual([s.seat,s.turn,s.crystals,s.mana,s.hand.length,s.deck.length],[1,2,1,1,1,2]);
  assert.deepEqual(minions(s.opp),[['Silverware Golem',3,4]]);
  s=end(s);
  assert.deepEqual([s.seat,s.turn,s.crystals,s.hand.length],[0,3,4,1]);
  assert.ok(moves(s).some(m=>m.kind==='attack'&&m.id===50&&m.targetId===2));
  s=step(s,{kind:'attack',id:50,targetId:2});
  assert.equal(hpOf(hero(s,'opp')),27);
  assert.ok(!moves(s).some(m=>m.kind==='attack'));
});

test('The Coin is one mana this turn', ()=>{
  const s=play(table({hand:[H('GAME_005',50)],mana:1}),50);
  assert.deepEqual([s.mana,s.crystals],[2,1]);
});

test('Life Tap draws the top card and costs two Health', ()=>{
  const t=table({deck:[C('CATA_493',60),C('KAR_205',61)],mana:2});
  const s=step(t,moves(t).find(m=>m.kind==='power'));
  assert.deepEqual([s.hand.map(c=>c.id),s.deck.length,hpOf(hero(s,'me')),s.mana],[[60],1,28,0]);
  assert.ok(!moves(s).some(m=>m.kind==='power'));
});

test('an empty deck is fatigue, one more each time', ()=>{
  let s=table({mana:2});
  s=step(s,moves(s).find(m=>m.kind==='power'));
  assert.equal(hpOf(hero(s,'me')),30-1-2);
  s=end(end(s));
  // The other seat drew from an empty deck once, this one twice.
  assert.deepEqual([hpOf(hero(s,'me')),hpOf(hero(s,'opp')),s.fatigue,s.them.fatigue],[25,29,2,1]);
});

test('a card drawn into a full hand is burned', ()=>{
  const t=table({hand:Array.from({length:10},(_,i)=>H('RLK_532',50+i)),deck:[C('CATA_493',60),C('KAR_205',61)],mana:2});
  const s=step(t,moves(t).find(m=>m.kind==='power'));
  assert.deepEqual([s.hand.length,s.deck.map(c=>c.entityId)],[10,[61]]);
});

test('Shred of Time casts when drawn and the draw goes on', ()=>{
  let s=play(table({hand:[H('TIME_026',50)],deck:[],mana:3}),50);
  assert.deepEqual(s.deck.map(c=>c.name),['Shred of Time','Shred of Time']);
  s={...s,deck:[...s.deck,C('KAR_205',61)]};
  s=step(s,moves(s).find(m=>m.kind==='power'));
  assert.deepEqual([s.hand.map(c=>c.id),s.deck.length,hpOf(hero(s,'me')),s.fatigue],[[61],0,30-3-3-2,0]);
});

test('The Soularium: three Temporary cards, discarded with their payoffs at the end of the turn', ()=>{
  let s=play(table({hand:[H('BOT_568',50)],deck:[C('KAR_205',60),C('RLK_534',61),C('SCH_147',62),C('CATA_493',63)],oppDeck:filler(2),mana:2}),50);
  assert.deepEqual(s.hand.map(c=>[c.id,c.temp]),[[60,true],[61,true],[62,true]]);
  s=end(s);
  assert.deepEqual([s.them.hand.length,s.them.discardCount],[0,3]);
  assert.deepEqual(minions(s.opp).sort(),[['Silverware Golem',3,4],['Spider',2,1],['Spider',2,1]]);
  assert.equal(hpOf(hero(s,'me')),25);                           // Soul Barrage, nothing else to hit
  s=end(s);
  // Duke of Below comes off the deck already counting the three discards.
  assert.deepEqual(s.hand.map(c=>[c.name,c.atk,c.hp,!!c.temp]),[['Duke of Below',8,8,false]]);
});

test('Platysaur discards the card it drew when it dies, on either side of the table', ()=>{
  let s=play(table({hand:[H('TLC_603',50),H('EX1_308',51)],deck:[C('KAR_205',60)]}),50);
  assert.deepEqual(s.hand.map(c=>c.id),[51,60]);
  const own=play(s,51,50);
  assert.deepEqual([minions(own.me),own.hand.length,own.discardCount],[[['Silverware Golem',3,4]],0,1]);

  s=table({hand:[H('TLC_603',50)],deck:[C('KAR_205',60)],oppHand:[H('EX1_308',70)],oppDeck:[C('SCH_147',71)]});
  s=play(end(play(s,50)),70,50);
  // Seat 0 loses the Golem from its hand and gets the body; seat 1's Soulfire then discards its Egg.
  assert.deepEqual([minions(s.opp),s.them.hand.length,s.them.discardCount],[[['Silverware Golem',3,4]],0,1]);
  assert.deepEqual([minions(s.me),s.hand.length,s.discardCount],[[['Spider',2,1],['Spider',2,1]],0,1]);
});

test('Boneweb Egg hatches for its owner when the other side kills it', ()=>{
  let s=table({hand:[H('SCH_147',50)],oppHand:[H('EX1_308',70)],oppDeck:[],mana:2});
  s=play(end(play(s,50)),70,50);
  assert.deepEqual(minions(s.opp),[['Spider',2,1],['Spider',2,1]]);
});

test('Cursed Catacombs asks which of three different deck cards to take', ()=>{
  const deck=[C('KAR_205',60),C('KAR_205',61),C('CATA_493',62),C('SCH_147',63),C('TLC_451',64),C('RLK_534',65)];
  let s=play(table({hand:[H('TLC_451',50)],deck}),50);
  assert.equal(s.choice.kind,'discover');
  const offered=s.choice.options.map(id=>deck.find(d=>d.entityId===id).name);
  assert.equal(new Set(offered).size,3);
  assert.ok(!offered.includes('Cursed Catacombs'));
  assert.deepEqual(moves(s),s.choice.options.map(id=>({kind:'choose',id})));
  const id=s.choice.options[1];
  s=step(s,{kind:'choose',id});
  assert.deepEqual([s.choice,s.hand.map(c=>[c.id,c.temp]),s.deck.length],[null,[[id,true]],5]);
  assert.ok(moves(s).some(m=>m.kind==='end'));
});

test('Cursed Catacombs: a discovered Shred of Time casts and a normal draw replaces it', ()=>{
  const deck=[C('TIME_025t',60),C('KAR_205',61),C('CATA_493',62),C('SCH_147',63)];
  let s=play(table({hand:[H('TLC_451',50)],deck}),50);
  const hp=hpOf(hero(s,'me'));
  s=step(s,{kind:'choose',id:60});
  assert.equal(hpOf(hero(s,'me')),hp-3);
  assert.equal(s.hand.length,1);
  assert.ok(!s.hand[0].temp&&s.hand[0].name!=='Shred of Time');
  assert.equal(s.deck.length,2);
});

test('Chamber of Viscidus: open when played, a chosen discard and two cards, then shut for a turn', ()=>{
  let s=play(table({hand:[H('WON_103',50),H('KAR_205',51),H('SCH_147',52)],deck:filler(8),oppDeck:filler(4),mana:3}),50);
  assert.deepEqual([s.locations,s.sites[0].ready],[1,true]);
  s=step(s,{kind:'use',id:50});
  assert.deepEqual([s.choice.kind,[...s.choice.options].sort()],['site',[51,52]]);
  s=step(s,{kind:'choose',id:51});
  assert.deepEqual([minions(s.me),s.hand.map(c=>c.id),s.sites[0].durability],[[['Silverware Golem',3,4]],[52,80,81],1]);
  assert.ok(!moves(s).some(m=>m.kind==='use'));
  s=end(end(s));
  assert.ok(!moves(s).some(m=>m.kind==='use'));
  s=end(end(s));
  assert.ok(moves(s).some(m=>m.kind==='use'));
  s=step(step(s,{kind:'use',id:50}),{kind:'choose',id:52});
  assert.deepEqual([s.locations,s.sites.length],[0,0]);
});

test('Chronoclaws: the swing, the highest-cost discard, and no Attack on the other turn', ()=>{
  let s=play(table({hand:[H('END_016',50),H('KAR_205',51),H('SCH_147',52)],deck:filler(3),oppDeck:filler(3),mana:4}),50);
  s=step(s,{kind:'attack',id:1,targetId:2});
  assert.deepEqual([hpOf(hero(s,'opp')),minions(s.me),s.hand.map(c=>c.id),s.weapon.durability],[26,[['Silverware Golem',3,4]],[52],2]);
  assert.ok(!moves(s).some(m=>m.kind==='attack'&&m.id===1));
  s=end(s);
  assert.equal(hero(s,'opp').atk,0);
  s=end(s);
  assert.ok(moves(s).some(m=>m.kind==='attack'&&m.id===1&&m.targetId===2));
});

test('Soul Barrage and Disposable Acolytes resolve in full', ()=>{
  let s=table({hand:[H('KAR_205',50)],oppHand:[H('RLK_534',70),H('CATA_499',71)],oppDeck:filler(1),mana:3});
  s=end(play(s,50));
  s={...s,mana:6};
  s=play(s,70);
  const golem=s.opp.find(b=>b.id===50),lost=30-hpOf(hero(s,'opp'))+(golem?4-golem.hp:4);
  assert.equal(lost,5);
  s=play(s,71);
  assert.equal(minions(s.me).length,2);
  assert.ok(s.me.filter(b=>b.type==='MINION').every(b=>b.id<0&&DB[b.cardId].cost===1));
});

const trace=seed=>{
  const r=playout(newGame({lists:[LIST,LIST],seed}),randomPolicy(seed));
  return [r.winner,r.steps,r.s.turn,hpOf(hero(r.s,'me')),hpOf(hero(r.s,'opp')),r.s.hand.map(c=>c.id)];
};
test('the same seed is the same game', ()=>{
  assert.deepEqual(trace(11),trace(11));
  assert.notDeepEqual(trace(11),trace(12));
});

test('a hundred mirror games of random legal moves all reach a dead hero inside the rules', ()=>{
  const wins=[0,0];
  for(let seed=1;seed<=100;seed++){
    const pick=randomPolicy(seed);
    let s=newGame({lists:[LIST,LIST],seed}),steps=0;
    for(let legal;(legal=moves(s)).length;steps++){
      assert.ok(steps<5000,`seed ${seed} does not end`);
      const before=s.seat;
      const m=pick(s,legal);
      s=apply(s,m).s;
      assert.equal(s.seat,m.kind==='end'?1-before:before);
      for(const [bs,seat] of [[s.me,s],[s.opp,s.them]]){
        assert.ok(bs.filter(b=>b.type==='MINION').length+seat.locations<=7,`seed ${seed}: board`);
        assert.ok(bs.every(b=>b.type==='HERO'||b.hp>0),`seed ${seed}: a dead minion stays`);
        assert.ok(seat.hand.length<=10,`seed ${seed}: hand`);
        assert.ok(seat.mana>=0&&seat.crystals<=10,`seed ${seed}: mana`);
        assert.equal(seat.locations,seat.sites.length);
      }
      assert.equal(new Set([...s.me,...s.opp,...s.hand,...s.them.hand].map(x=>x.id)).size,
        s.me.length+s.opp.length+s.hand.length+s.them.hand.length,`seed ${seed}: an id is used twice`);
    }
    const w=winner(s);
    assert.ok(w===0||w===1||w==='draw',`seed ${seed} has no result`);
    if(w!=='draw')wins[w]++;
  }
  assert.ok(wins[0]>20&&wins[1]>20,`one seat wins nearly always: ${wins}`);
});
