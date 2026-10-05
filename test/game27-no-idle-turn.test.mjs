// 2026-10-05 batch game 27 turn 5 ruling: 「這邊怎麼空過？ 1. 下魔眼 棄掉武器；下回合下公爵（公爵66
// 大於武器，如果小於66會保留武器）。雖然棄掉武器很可惜，但浪費三個水晶更糟 2. 抽牌。抽牌也比空過好」
// -- 3 mana unspent with Occultist and Life Tap on the menu: passing is off it, and Occultist discards
// Chronoclaws so Duke comes down a 6/6 next turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions} from '../src/policy.mjs';

const load=()=>JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game27-occultist-discards-weapon.json',import.meta.url),'utf8'));
const kept=f=>constrainActions(f.state,f.options).map(a=>a.id);
const duke=f=>f.state.me.hand.find(c=>c.name==='Duke of Below');

test('a full turn of mana is not passed: Occultist or Life Tap beats ending the turn',()=>{
 const ids=kept(load());
 assert.ok(!ids.includes('o0'));
 assert.ok(ids.includes('o2'));
});

test('Occultist discards the weapon when Duke would come down at least a 6/6',()=>{
 const ids=kept(load());
 assert.ok(ids.includes('o1t0'));
 assert.ok(!ids.includes('o1t1'));
});

test('a Duke smaller than 6/6 after the discard keeps the weapon instead',()=>{
 const f=load();duke(f).ATK=3;
 const ids=kept(f);
 assert.ok(!ids.includes('o1t0'));
 assert.ok(ids.includes('o1t1'));
});

test('mana already spent this turn: ending the turn stays allowed',()=>{
 const f=load();f.state.me.mana=2;
 assert.ok(kept(f).includes('o0'));
});
