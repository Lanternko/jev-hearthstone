// 2026-10-05 batch, game 5 rulings: keep the Platysaur-linked Soul Barrage for its free discard;
// enemy draw-only triggers keep the trade search exact; idle mana casts a Temporary Hand of Gul'dan.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions} from '../src/policy.mjs';
import {search} from '../src/plan.mjs';

const load=n=>JSON.parse(readFileSync(new URL(`./fixtures/user-rulings/${n}.json`,import.meta.url),'utf8'));
const kept=f=>{const r=constrainActions(f.state,f.options);return (r.actions??r).map(a=>a.id)};

test('casts the unlinked Soul Barrage and keeps the Platysaur-linked copy',()=>{
 const ids=kept(load('linked-barrage-copy'));
 assert.ok(ids.includes('o1'));                 // Soul Barrage 48, unlinked
 assert.ok(!ids.includes('o4'));                // Soul Barrage 42, discarded free when Platysaur dies
});

test('enemy draw-only effects do not cut the clear: 1/1 Rush takes one, Duke the other',()=>{
 const f=load('draw-only-trades');
 const {plans}=search(f.state,f.options);
 const best=plans[0].steps.filter(s=>s.kind==='attack').map(s=>`${s.id}>${s.targetId}`);
 assert.ok(best.includes('110>10')&&best.includes('41>18'),best.join(' '));
});

test('idle mana and nothing else to play: cast the Temporary Hand of Gul\'dan instead of ending',()=>{
 assert.deepEqual(kept(load('temporary-guldan-idle-mana')),['o1']);
});
