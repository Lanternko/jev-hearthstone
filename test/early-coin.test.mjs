import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
import {earlyCoinDevelopment} from '../src/early-coin.mjs';

const f=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game120-turn2-coin-occultist.json',import.meta.url)));
const afterCoin=()=>{
 const s=structuredClone(f.state);
 s.me.mana=3;s.me.hand=s.me.hand.filter(c=>c.entityId!==68);
 return s;
};
const afterOptions=[{id:'end',type:'END_TURN'},{id:'egg',entityId:21},
 {id:'discard-dead',entityId:7,targetId:15},{id:'discard-golem',entityId:7,targetId:5}];

test('game 120 T2: live preparation chooses Coin over bare Egg, then re-observes',()=>{
 const p=prepare(f.state,constrainActions(f.state,f.options));
 assert.equal(p.forced?.source,'early_coin_development');
 assert.equal(p.forced.action.entityId,68);
 assert.equal(p.rest,undefined,'no queue across a Battlecry choice');
});

test('after Coin: legal Occultist development chooses a body and preserves a T3 play',()=>{
 const s=afterCoin(),p=prepare(s,constrainActions(s,afterOptions));
 assert.equal(p.forced?.source,'early_coin_development');
 assert.equal(p.forced.action.entityId,7);
 assert.ok([5,15].includes(p.forced.action.targetId));
 const retained=s.me.hand.filter(c=>![7,p.forced.action.targetId].includes(c.entityId));
 assert.ok(retained.some(c=>c.CARDTYPE==='MINION'&&c.COST===s.me.maxMana+1&&c.ATK>0));
 const choice={...s,choice:{type:'GENERAL',source:s.me.hand.find(c=>c.entityId===7),entities:s.me.hand.filter(c=>c.entityId!==7)}};
 const picks=choice.choice.entities.map(c=>({id:`c${c.entityId}`,type:'CHOICE',entityId:c.entityId}));
 const filtered=constrainActions(choice,picks);
 assert.ok(filtered.length>0&&filtered.every(a=>[5,15].includes(a.entityId)), 'discard observation selects a fixed body rather than Egg or unrelated resources');
});

test('Battlecry choice can be deferred until the game presents it',()=>{
 const pick=earlyCoinDevelopment(afterCoin(),[{id:'play',entityId:7}]);
 assert.equal(pick.action.entityId,7);
 assert.equal(pick.action.targetId,undefined);
});

test('Coin development abstains without payoff, follow-up curve, or legal execution',()=>{
 const noPayoff=structuredClone(f.state);noPayoff.me.hand=noPayoff.me.hand.filter(c=>![5,15].includes(c.entityId));
 assert.equal(earlyCoinDevelopment(noPayoff,f.options),null);
 const noCurve=structuredClone(f.state);noCurve.me.hand=noCurve.me.hand.filter(c=>c.entityId!==5);
 assert.equal(earlyCoinDevelopment(noCurve,f.options),null);
 assert.equal(earlyCoinDevelopment(f.state,f.options.filter(a=>a.entityId!==68)),null);
 assert.equal(earlyCoinDevelopment(afterCoin(),afterOptions.filter(a=>a.entityId!==7)),null);
});

test('real cheap alternatives, an occupied board, opponent turn and unrelated mana stay open',()=>{
 for(const change of [
  s=>s.me.hand.push({entityId:80,name:'Party Fiend',CARDTYPE:'MINION',COST:1,ATK:1}),
  s=>s.me.hand.push({entityId:81,name:'Cursed Catacombs',CARDTYPE:'SPELL',COST:0}),
  s=>s.me.board.push({entityId:82,CARDTYPE:'MINION',ATK:1,HEALTH:1}),
  s=>s.opponent.board.push({entityId:83,CARDTYPE:'MINION',ATK:5,HEALTH:5}),
  s=>s.me.current=false,
  s=>s.me.maxMana=4,
  s=>s.choice={type:'GENERAL'},
 ]){
  const s=structuredClone(f.state);change(s);
  assert.equal(earlyCoinDevelopment(s,f.options),null);
 }
});
