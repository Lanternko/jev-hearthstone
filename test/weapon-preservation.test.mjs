import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weaponPreservation,preferredWeaponPreservation} from '../src/weapon-preservation.mjs';
import {constrainActions} from '../src/policy.mjs';
import {prepare,allowsWeaponContinuation} from '../src/choose.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/validation10-game1-preserve-duke-before-weapon.json',import.meta.url)));
const fixture=()=>structuredClone(original);
const pipeline=c=>{const trace={},a=constrainActions(c.state,c.options,{trace});return prepare(c.state,a,{admission:trace.admission});};
const intent=c=>weaponPreservation(c.state,c.options)[0];
const preferred=c=>preferredWeaponPreservation(c.state,c.options);
const duke=c=>c.state.me.hand.find(x=>x.entityId===19);
const after=()=>{const c=fixture();return {state:c.afterEquip.state,options:c.afterEquip.rawOptions??c.afterEquip.options};};

test('recorded game1 turn4 plays observed 8/8 before spending all mana on Chronoclaws',()=>{
 const c=fixture(),p=pipeline(c),i=p.weaponPreservation[0];
 assert.equal(p.forced.source,'weapon_preservation');assert.equal(p.forced.action.entityId,19);
 assert.equal(i.equipped,false);assert.equal(i.mana.afterEquipment,0);
 assert.equal(i.targets[0].entityId,19);assert.equal(i.targets[0].discardKind,'none');
 assert.equal(i.development[0].affordableAfterEquipment,false);
 assert.equal(i.development[0].afterPlayThenEquipTargets[0].entityId,15);
 assert.ok(!p.rest&&!p.plans,'one observed play, no next-turn queue');
});

test('a fresh equipped zero-mana state holds nonlethal face swing; queued plans use the same rule',()=>{
 const c=after(),p=pipeline(c);
 assert.equal(p.forced.source,'weapon_preservation_hold');assert.equal(p.forced.action.type,'END_TURN');
 const swing=c.options.find(a=>a.targetId!=null);
 assert.equal(allowsWeaponContinuation(c.state,c.options,swing),false);
 assert.equal(allowsWeaponContinuation(c.state,c.options,p.forced.action),true);
});

test('visible face lethal wins even when it discards the valuable minion',()=>{
 const c=after();c.state.opponent.board.find(x=>x.CARDTYPE==='HERO').DAMAGE=26;
 const p=pipeline(c);assert.equal(p.forced.source,'forced_lethal');assert.equal(p.forced.action.targetId,68);
 assert.equal(allowsWeaponContinuation(c.state,c.options,p.forced.action),true);
});

test('generic observed valuable body and changed costs/entity ids generalize',()=>{
 const c=fixture(),body=duke(c);Object.assign(body,{entityId:919,name:'Observed giant',text:'Taunt',ATK:6,HEALTH:7,COST:5});
 c.state.me.mana=5;
 c.options.find(a=>a.entityId===19).entityId=919;
 const p=pipeline(c);assert.equal(p.forced.source,'weapon_preservation');assert.equal(p.forced.action.entityId,919);
 c.state.me.mana=9;
 assert.equal(preferred(c),null,'enough mana to equip then play remains a comparison');
 assert.equal(intent(c).development[0].affordableAfterEquipment,true);
});

test('ties are logged and cannot promise Walking Dead after an intervening draw',()=>{
 const c=fixture();c.state.me.hand.push({entityId:500,CARDTYPE:'MINION',COST:4,ATK:5,HEALTH:5,text:''});
 assert.equal(intent(c).ties,true);assert.equal(preferred(c),null);
 const a=fixture();a.state.me.hand=a.state.me.hand.filter(x=>x.entityId!==19);
 a.state.me.hand.push({entityId:501,CARDTYPE:'SPELL',COST:6,text:'Deal 5 damage.'});
 assert.equal(intent(a).targets[0].entityId,501);
 const b=fixture();b.state.me.hand.push({entityId:502,CARDTYPE:'MINION',COST:3,ATK:3,HEALTH:4,text:''});
 assert.equal(intent(b).development[0].afterPlayThenEquipTargets.length,2);
});

test('discard payoff body, draw or random summons remain eligible weapon intents',()=>{
 for(const body of [
  {name:'Walking Dead',text:'Taunt If you discard this minion, summon it.'},
  {name:'Hand of Gul\'dan',CARDTYPE:'SPELL',text:'When you play or discard this, draw 3 cards.'},
  {name:'Disposable Acolytes',CARDTYPE:'SPELL',text:'When you play or discard this, summon two random 1-Cost minions.'}
 ]){const c=fixture();Object.assign(duke(c),body);assert.equal(intent(c).targets[0].paysOnDiscard,true);assert.equal(preferred(c),null);}
});

test('small bodies and unknown Battlecries are comparisons, not forced 6/7-mana claims',()=>{
 for(const update of [{ATK:2,HEALTH:3},{text:'Battlecry: Deal 4 damage to your hero.'},
  {text:'Rush Has +2/+2 for each card you\'ve discarded this game. Battlecry: Deal 10 damage to your hero.'}]){
  const c=fixture();Object.assign(duke(c),update);assert.equal(preferred(c),null);
 }
});

test('missing legal play, unaffordable development and full board never invent a body action',()=>{
 const c=fixture();c.options=c.options.filter(a=>a.entityId!==19);assert.equal(preferred(c),null);
 const a=fixture();a.state.me.mana=3;assert.equal(preferred(a),null);
 const b=fixture();for(let n=0;n<7;n++)b.state.me.board.push({entityId:500+n,CARDTYPE:'MINION',ATK:1,HEALTH:1});
 assert.equal(preferred(b),null);assert.equal(intent(b).development[0].legalPlay,false);
});

test('hero attack availability is checked before treating equipping as an immediate discard route',()=>{
 for(const update of [{FROZEN:1},{EXHAUSTED:1},{NUM_ATTACKS_THIS_TURN:1}]){
  const c=fixture();Object.assign(c.state.me.board.find(x=>x.CARDTYPE==='HERO'),update);
  assert.equal(intent(c).available,false);assert.equal(preferred(c),null);
 }
 const a=fixture();a.options=a.options.filter(x=>x.entityId!==29);
 assert.equal(intent(a).available,false);assert.equal(preferred(a),null);
});

test('necessary removal, secrets, active friendly engines and near lethal stay in full comparison',()=>{
 for(const change of [
  c=>c.state.opponent.board.push({entityId:500,CARDTYPE:'MINION',ATK:4,HEALTH:4}),
  c=>c.state.opponent.secretCount=1,
  c=>c.state.opponent.board.find(x=>x.CARDTYPE==='HERO').DAMAGE=23,
  c=>c.state.me.board.push({entityId:500,CARDTYPE:'MINION',ATK:1,HEALTH:1,text:'After you play a minion, draw a card.'})
 ]){const c=fixture();change(c);assert.equal(preferred(c),null);assert.notEqual(pipeline(c).forced?.source,'weapon_preservation');}
});

test('do not force passing while another legal resource/card/removal action remains',()=>{
 const c=after();c.options.push({id:'other',type:'POWER',entityId:500});assert.equal(preferred(c),null);
 const a=after();a.options=a.options.filter(x=>x.type!=='END_TURN');assert.equal(preferred(a),null);
});

test('free information can precede commitment without spending the protected development mana',()=>{
 const c=fixture();c.state.me.hand.push({entityId:500,CARDTYPE:'SPELL',COST:0,text:'Draw a card.'});
 c.options.push({id:'information',type:'POWER',entityId:500});assert.equal(preferred(c),null);
});

test('equipped affordable body uses same evidence; new draw and attack buffs are rechecked',()=>{
 const c=after();c.state.me.mana=4;c.options.push({id:'body',type:'POWER',entityId:19});
 assert.equal(preferred(c).action.id,'body');
 const a=after();a.state.me.hand.push({entityId:500,CARDTYPE:'SPELL',COST:6,text:''});assert.equal(preferred(a),null);
 const b=after();b.state.me.board.find(x=>x.CARDTYPE==='HERO').ATK=10;assert.equal(preferred(b),null);
});

test('chamber engine is frozen, current version adds the ruling without mutating historical behavior',async()=>{
 const previous=await loadDecisionEngine('silverfish-v1-chamber-intent-v1'),now=await loadDecisionEngine();
 assert.equal(now.version,'silverfish-v1-veto-audit-v1');assert.notEqual(previous.prepare,now.prepare);
 const c=fixture();assert.notEqual(previous.prepare(c.state,previous.constrainActions(c.state,c.options)).forced?.source,'weapon_preservation');
 assert.equal(pipeline(c).forced.source,'weapon_preservation');
 assert.equal(previous.allowsWeaponContinuation,undefined);
});
