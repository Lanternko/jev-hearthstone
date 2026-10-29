import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNet} from '../src/selfplay-net.mjs';
import {loadList,cardDb} from '../src/selfplay.mjs';
import {cardWins} from '../src/selfplay-cardwin.mjs';
import {isEggDeck} from '../src/egg-guard.mjs';
import {vocabulary} from '../src/selfplay-encode.mjs';

// decks/priest-egg-hsr (2026-10-28): the most played Egg Priest of HSReplay, the pre-Imbue list.
const DB=cardDb(),LIST=loadList('priest-egg-hsr');

test('priest-egg-hsr: 30 real cards, hero and power as priest-egg',()=>{
  const n=Object.values(LIST.cards).reduce((a,b)=>a+b,0);
  assert.equal(n,30);
  for(const id of Object.keys(LIST.cards))assert.ok(DB[id],id);
  const base=loadList('priest-egg');
  assert.equal(LIST.hero,base.hero);assert.equal(LIST.power,base.power);
});

test('isEggDeck names both egg priest decks and nothing else',()=>{
  assert.ok(isEggDeck('priest-egg')&&isEggDeck('priest-egg-hsr'));
  assert.ok(!isEggDeck('warlock-zoo')&&!isEggDeck('priest-eggs')&&!isEggDeck(undefined));
});

test('priest-egg-hsr: every card is in the vocabulary of the egg pilot or takes the unknown slot, and a game finishes',()=>{
  const nets=['priest-egg-pilot-v5-20261028','warlock-zoo-v9'].map(n=>loadNet(`models/selfplay/${n}.json`));
  const v=nets[0].vocab;
  const oov=Object.keys(LIST.cards).filter(id=>!v.index.has(DB[id].name));
  assert.ok(oov.length<=5,'at most the five cards the v5 pilot never saw take the unknown slot');
  const lists=['priest-egg-hsr','warlock-zoo'].map(loadList);
  const games=4,{rows,wins}=cardWins(nets,lists,{games,seed:11,guard:true});
  assert.ok(wins>=0&&wins<=games);
  assert.ok(rows.size>5);
  for(const [name,r] of rows)assert.ok(r.played<=r.drawn&&r.drawn<=games,name);
  assert.ok(vocabulary([LIST],DB).size>1);
});
