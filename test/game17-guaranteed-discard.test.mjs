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

// User correction (2026-10-10): 「派對動物不需要有三個空場才能下」 and 「如果有優勢交換都可以自殺」 -- with one slot
// free, only the swing that frees a second one (the 2/2 into the Taunt) is open; the 2/4 and 4/4 bounce off.
test('with one slot, only the room-freeing trade is open and the turn does not pass',()=>{
 const f=load();
 assert.ok(guaranteedDiscard(f.state,f.options));
 const ids=kept(f);
 assert.ok(ids.includes('o5t0'),ids.join(' '));
 for(const id of ['o6t0','o7t0','o3','o0','o1'])assert.ok(!ids.includes(id),ids.join(' '));
});

test('once the 2/2 is gone and a summon fits, Party Fiend goes down without waiting for more room',()=>{
 const f=load();
 f.state.me.board=f.state.me.board.filter(c=>c.entityId!==93);
 f.options=f.options.filter(a=>a.id!=='o5t0');
 const ids=kept(f);
 assert.ok(ids.includes('o3'),ids.join(' '));
 assert.ok(!ids.includes('o0'),ids.join(' '));
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
