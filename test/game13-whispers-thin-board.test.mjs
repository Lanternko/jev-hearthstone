// 2026-10-10 batch game 13 turn 6 ruling: 「只有场上只有一张牌，不值得用 buff，而且我们弃掉的牌并不是一个素材」 --
// 3 mana, Platysaur alone, Whispers would eat The Soularium. Play a 3-drop instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions} from '../src/policy.mjs';

const load=()=>JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game13-whispers-thin-board.json',import.meta.url),'utf8'));
const kept=f=>{const r=constrainActions(f.state,f.options);return (r.actions??r).map(a=>a.id)};

test('one minion and a non-payoff discard: Whispers waits, Chamber stays',()=>{
 const ids=kept(load());
 assert.ok(!ids.includes('o4'),ids.join(' '));
 assert.ok(ids.includes('o1'),ids.join(' '));
});

test('two minions out turns the rule off',()=>{
 const f=load();
 const p=f.state.me.board.find(c=>c.entityId===6);
 f.state.me.board.push({...p,entityId:999});
 assert.ok(kept(f).includes('o4'));
});

test('a payoff as the cheapest card turns the rule off',()=>{
 const f=load();
 f.state.me.hand=f.state.me.hand.filter(c=>c.entityId!==29);
 f.options=f.options.filter(a=>a.id!=='o3');
 const wd=f.state.me.hand.find(c=>c.entityId===5);
 f.state.me.hand.push({...wd,entityId:998,COST:1});
 assert.ok(kept(f).includes('o4'));
});
