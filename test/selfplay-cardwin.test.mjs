import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNet} from '../src/selfplay-net.mjs';
import {loadList} from '../src/selfplay.mjs';
import {cardWins} from '../src/selfplay-cardwin.mjs';

test('card win rates: a card is played only in games it was drawn in, and wins never exceed games', ()=>{
  const nets=['priest-egg-pilot-v3-20261028','warlock-zoo-v9'].map(n=>loadNet(`models/selfplay/${n}.json`));
  const lists=['priest-egg','warlock-zoo'].map(loadList);
  const games=6,{rows,wins}=cardWins(nets,lists,{games,seed:5,guard:true});
  assert.ok(wins>=0&&wins<=games);
  assert.ok(rows.has('The Egg of Khelos')||rows.size>5);
  for(const [name,r] of rows){
    assert.ok(r.played<=r.drawn&&r.drawn<=games,name);
    assert.ok(r.playedWon<=r.played&&r.drawnWon<=Math.min(r.drawn,wins),name);
    assert.ok(r.plays>=r.played,name);
  }
});
