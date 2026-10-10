// 2026-10-10 batch game 17 turn 10 ruling: 「先送掉一個2-2，然後再下派對，然後再解場」 -- 4 mana, three
// ready attackers, Party Fiend, Soulfire and Soul Barrage in hand, and the turn passed. Trade to open
// space, play Party Fiend, then Soulfire discards Soul Barrage for certain.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,guaranteedDiscard} from '../src/policy.mjs';

const load=()=>JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game17-soulfire-guarantees-barrage.json',import.meta.url),'utf8'));
const kept=f=>{const r=constrainActions(f.state,f.options);return (r.actions??r).map(a=>a.id)};
const attacks=['o5t0','o6t0','o7t0'];
// After the swings: the 2/2 traded into the Taunt and the others have attacked.
const swung=f=>{
 f.state.me.board=f.state.me.board.filter(c=>c.entityId!==93);
 f.options=f.options.filter(a=>!attacks.includes(a.id));
 return f;
};

test('with ready attackers, the turn does not pass and only the trades are open',()=>{
 const f=load();
 assert.ok(guaranteedDiscard(f.state,f.options));
 assert.deepEqual(kept(f),attacks);
});

test('after the trades, Party Fiend goes down before Soulfire',()=>{
 const f=swung(load());
 const ids=kept(f);
 assert.deepEqual(ids,['o3']);
});

test('with Soul Barrage the only card left, Soulfire is played and Barrage is not hard-cast',()=>{
 const f=swung(load());
 f.state.me.hand=f.state.me.hand.filter(c=>c.entityId!==34);
 f.state.me.mana=3;
 f.options=f.options.filter(a=>a.id!=='o3');
 const ids=kept(f);
 assert.ok(ids.length&&ids.every(id=>id.startsWith('o2t')),ids.join(' '));
 assert.ok(!ids.includes('o0')&&!ids.includes('o1'));
});

test('not enough mana for the whole hand leaves the rule off',()=>{
 const f=load();
 f.state.me.mana=1;
 assert.equal(guaranteedDiscard(f.state,f.options),null);
});
