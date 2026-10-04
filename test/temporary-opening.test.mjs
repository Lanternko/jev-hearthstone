import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
import {temporaryOpeningAction} from '../src/temporary-opening.mjs';
import {parsePower,publicState,createParser} from '../src/power.mjs';
const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game10-temporary-party.json',import.meta.url)));
const defs=Object.fromEntries(JSON.parse(readFileSync(new URL('../data/cards.enUS.json',import.meta.url))).map(c=>[c.id,c]));
test('new50 game10 T1: Temporary Party develops without Coin; full pipeline retains the ruling',()=>{
 for(const planner of [true,false]){
  const p=prepare(f.state,constrainActions(f.state,f.options),{planner});
  assert.equal(p.forced?.action.entityId,40);
  assert.equal(p.forced.source,'temporary_opening_development');
 }
});
test('expiry alone cannot force self-damage, an illegal card, crowded board or a regular non-Temporary Party',()=>{
 const cases=[
  s=>delete s.me.hand.find(c=>c.entityId===40).temporary,
  s=>s.me.hand.find(c=>c.entityId===40).temporary.confidence=0.4,
  s=>s.me.mana=0,
  s=>s.me.board.find(c=>c.CARDTYPE==='HERO').HEALTH=3,
  s=>s.me.board.push({entityId:900,CARDTYPE:'MINION',ATK:1,HEALTH:1}),
  s=>s.me.maxMana=5,
 ];
 for(const change of cases){const s=structuredClone(f.state);change(s);assert.equal(temporaryOpeningAction(s,f.options),null);}
 assert.equal(temporaryOpeningAction(f.state,f.options.filter(a=>a.entityId!==40)),null);
});
const lines=`CREATE_GAME
GameEntity EntityID=1
tag=TURN value=2
Player EntityID=2 PlayerID=1
tag=CONTROLLER value=1
Player EntityID=3 PlayerID=2
tag=CONTROLLER value=2
FULL_ENTITY - Creating ID=40 CardID=VAC_940
tag=CONTROLLER value=2
tag=CARDTYPE value=MINION
tag=ZONE value=HAND
FULL_ENTITY - Creating ID=82 CardID=GBL_999e
tag=CONTROLLER value=2
tag=CARDTYPE value=ENCHANTMENT
tag=ATTACHED value=40
tag=CREATOR value=53
tag=ZONE value=PLAY`;
const power=s=>s.split('\n').map(l=>'D 07:31:36.6749188 GameState.DebugPrintPower() - '+l).join('\n')+'\n';
test('real Temporary enchantment survives parsing and vanishes when removed or card leaves hand',()=>{
 const p=createParser().feed(power(lines));
 let s=publicState(p.result(),2,defs);
 assert.equal(s.me.hand[0].temporary.expires,'end_of_own_turn');
 assert.equal(s.me.hand[0].temporary.sourceEntityId,53);
 assert.ok(!publicState(p.result(),1,defs).opponent.hand,'no hidden opponent hand exported');
 p.feed(power('TAG_CHANGE Entity=82 tag=ZONE value=REMOVEDFROMGAME'));
 assert.ok(!publicState(p.result(),2,defs).me.hand[0].temporary);
 const played=publicState(parsePower(power(lines+'\nTAG_CHANGE Entity=40 tag=ZONE value=PLAY')),2,defs);
 assert.ok(!played.me.board.find(c=>c.entityId===40).temporary);
 p.feed(power('CREATE_GAME'));
 assert.equal(publicState(p.result(),2,defs).me.hand.length,0);
});
