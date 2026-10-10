// 2026-10-10 batch game 18 turn 4 ruling: 「九点打在两点的手下上面，就浪费了七点伤害」 -- Chronoclaws swung at a
// 0/2 Bloated Leech and discarded Soul Barrage. Minions trade into it for free; play the 1-drop, the buff,
// then Wicked Whispers, which discards the lowest-cost card (Tame Pet).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions} from '../src/policy.mjs';

const load=()=>JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game18-chronoclaws-wastes-barrage.json',import.meta.url),'utf8'));
const kept=f=>{const r=constrainActions(f.state,f.options);return (r.actions??r).map(a=>a.id)};
const leech=f=>f.state.opponent.board.find(c=>c.entityId===107);

test('Chronoclaws is held while minions clear a harmless board for free',()=>{
 const ids=kept(load());
 assert.ok(!ids.includes('o6'),ids.join(' '));
 assert.ok(ids.includes('o5'),ids.join(' '));
});

test('an enemy minion with attack turns the rule off',()=>{
 const f=load();leech(f).ATK=3;
 assert.ok(kept(f).includes('o6'));
});

test('not enough minion attack for the board turns the rule off',()=>{
 const f=load();
 f.options=f.options.filter(a=>!/^o[89]t/.test(a.id));
 assert.ok(kept(f).includes('o6'));
});

test('after Amalgam and the buff, Wicked Whispers is open',()=>{
 const f=load();
 f.state.me.hand=f.state.me.hand.filter(c=>c.entityId!==109&&c.entityId!==52);
 f.state.me.mana=2;
 f.options=f.options.filter(a=>a.id!=='o5'&&a.id!=='o1');
 assert.ok(kept(f).includes('o2'));
});
