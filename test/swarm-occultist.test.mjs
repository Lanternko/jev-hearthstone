import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,swarmOccultist} from '../src/policy.mjs';
// User ruling (2026-10-05, game 2, turn 3): two minions of ours against three small ones; Jev buffed
// with Entropic Continuity and Life Tapped. Occultist discarding Soul Barrage is the play, the
// Walking Dead discard is acceptable.
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/swarm-occultist-barrage.json',import.meta.url)));
const named=n=>f.state.me.hand.find(c=>c.name===n).entityId;
const [occ,barrage,dead]=['Ocular Occultist','Soul Barrage','Walking Dead'].map(named);
test('swarm across a low board: Occultist discarding Soul Barrage (or Walking Dead) is the turn',()=>{
 const out=constrainActions(f.state,f.options);
 const plays=out.filter(a=>a.targetId==null||a.entityId===occ);
 assert.ok(out.some(a=>a.entityId===occ&&a.targetId===barrage));
 assert.ok(plays.every(a=>a.entityId===occ&&[barrage,dead].includes(a.targetId)));
});
test('no swarm, no override',()=>{
 const s=structuredClone(f.state);
 s.opponent.board=s.opponent.board.filter(c=>c.CARDTYPE!=='MINION');
 assert.equal(swarmOccultist(s,f.options),f.options);
});
