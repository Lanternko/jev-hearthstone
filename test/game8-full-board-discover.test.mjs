// 2026-10-05 fourth small batch, game 2 turn 6 ruling: on a full board, Cursed Catacombs takes the
// discard that draws (Hand of Gul'dan), not the discard that summons into no room.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions} from '../src/policy.mjs';

const load=n=>JSON.parse(readFileSync(new URL(`./fixtures/user-rulings/${n}.json`,import.meta.url),'utf8'));
const kept=f=>{const r=constrainActions(f.state,f.options);return (r.actions??r).map(a=>a.id)};

test("full board: Catacombs picks Hand of Gul'dan over Disposable Acolytes",()=>{
 assert.deepEqual(kept(load('full-board-catacombs-draws')),['c5e158']);
});

test('with a free slot the Acolytes pick stays open',()=>{
 const f=load('full-board-catacombs-draws');
 const state={...f.state,me:{...f.state.me,board:f.state.me.board.filter(c=>c.entityId!==145)}};
 assert.ok(kept({state,options:f.options}).includes('c5e157'));
});
