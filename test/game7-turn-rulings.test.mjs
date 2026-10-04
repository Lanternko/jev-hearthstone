// 2026-10-05 fourth small batch, game 1 rulings, against a Swarmguard board with no burn: take
// every free trade before tapping or ending, and equip the weapon so the hero soaks the 1-Attack hits.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions} from '../src/policy.mjs';
import {search} from '../src/plan.mjs';

const load=n=>JSON.parse(readFileSync(new URL(`./fixtures/user-rulings/${n}.json`,import.meta.url),'utf8'));
const kept=f=>{const r=constrainActions(f.state,f.options);return (r.actions??r).map(a=>a.id)};

test('free trades into three 1/3 Taunts: no Life Tap first, no ending the turn',()=>{
 const tap=kept(load('swarm-free-trades-before-tap'));
 assert.ok(!tap.includes('o0')&&!tap.includes('o1'),tap.join(','));
 const end=kept(load('swarm-free-trades-no-end'));
 assert.ok(!end.includes('o0'),end.join(','));
 assert.ok(end.length>0);
});

test('the full clear tops the search and sends the leftover attackers face',()=>{
 const f=load('swarm-free-trades-no-end');
 const {plans}=search(f.state,constrainActions(f.state,f.options));
 const s=plans[0].steps;
 assert.equal(s.filter(m=>m.kind==='attack'&&[113,55,112].includes(m.targetId)).length,3);
 assert.equal(s.filter(m=>m.kind==='attack'&&m.targetId===66).length,2);
});

test('Chronoclaws in hand: minions do not trade into what the armed hero can kill',()=>{
 const ids=kept(load('weapon-soaks-low-attack-taunts'));
 assert.ok(ids.includes('o2'),'Chronoclaws');
 assert.ok(!ids.some(id=>/^o[6-9]t/.test(id)),ids.join(','));
 assert.ok(!ids.includes('o0'),'END_TURN');
});
