import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,boardFirstDiscard} from '../src/policy.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game148-board-before-draw.json',import.meta.url)));
const outlet=f.state.me.hand.find(c=>c.name==='Ocular Occultist');
const dead=f.state.me.hand.find(c=>c.name==='Walking Dead');
const hog=f.state.me.hand.find(c=>c.name==="Hand of Gul'dan");
test('game 148 turn 3: direct battlecry prefers Walking Dead over Hand of Guldan',()=>{
 const out=constrainActions(f.state,f.options).filter(a=>a.entityId===outlet.entityId);
 assert.ok(out.length>0);assert.ok(out.every(a=>a.targetId===dead.entityId));
 assert.ok(!out.some(a=>a.targetId===hog.entityId));
});
test('keep resource comparison with spare mana, a developed board, close lethal, or no summon space',()=>{
 const draws=s=>boardFirstDiscard(s,f.options).some(a=>a.targetId===hog.entityId);
 const spare=structuredClone(f.state);spare.me.mana=4;assert.ok(draws(spare));
 const wide=structuredClone(f.state);wide.me.board.push(...[1,2].map(i=>({entityId:900+i,CARDTYPE:'MINION',ATK:1,HEALTH:1})));assert.ok(draws(wide));
 const close=structuredClone(f.state);close.opponent.board.find(c=>c.CARDTYPE==='HERO').HEALTH=10;assert.ok(draws(close));
 const full=structuredClone(f.state);full.me.board.push(...Array.from({length:5},(_,i)=>({entityId:900+i,CARDTYPE:'LOCATION'})));assert.ok(draws(full));
});
