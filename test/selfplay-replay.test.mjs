import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNet} from '../src/selfplay-net.mjs';
import {loadList,cardDb} from '../src/selfplay.mjs';
import {replayGame} from '../src/selfplay-replay.mjs';

test('replay: every step names its move, sides follow the decks, and the shares weighed sum to at most 1', ()=>{
  const nets=['priest-egg-pilot-v6-20261028','warlock-zoo-v9'].map(n=>loadNet(`models/selfplay/${n}.json`));
  const lists=['priest-egg','warlock-zoo'].map(loadList),db=cardDb();
  const names=lists.map(l=>new Set(Object.keys(l.cards).map(id=>db[id]?.name)));
  for(const first of [0,1]){
    const g=replayGame(nets,lists,{seed:7,first,guard:true});
    assert.ok(g.steps.length>10);
    assert.equal(g.steps[0].side,first===0?0:1,'the side that opens is the one given the first seat');
    assert.ok([0,1,null].includes(g.winner));
    for(const x of g.steps){
      assert.ok(x.move&&!/#\d|undefined/.test(x.move),x.move);
      assert.equal(x.boards.length,2);assert.equal(x.hands.length,2);
      assert.ok(x.heroes[0]&&x.heroes[1]);
      const taken=x.alts.find(([t])=>t===x.move);
      if(taken)assert.equal(taken[1],x.p,'the share shown for the step taken is its entry among those weighed');
      if(!x.guard)assert.ok(x.p>0);
      assert.ok(x.alts.reduce((a,[,p])=>a+p,0)<=1.001);
    }
    // each side's hand is drawn from its own deck: hands are indexed by deck, not by seat
    for(const k of [0,1])assert.ok(g.steps.some(x=>x.hands[k].some(c=>names[k].has(c.name))),`hand ${k}`);
  }
});
