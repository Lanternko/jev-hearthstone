import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepare,resolve,turnOrderAssessment} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
import {divineShieldAssessment} from '../src/divine-shield.mjs';
import {fromState,apply} from '../src/sim.mjs';
import {narrate} from '../src/plan.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/validation10-game2-shield-pop-alternatives.json',import.meta.url)));
const fixture=()=>structuredClone(original);
function pipeline(c){const trace={},full=constrainActions(c.state,c.options,{trace});return prepare(c.state,full,{admission:trace.admission});}

test('game2 T5 prefers expendable shield pop with a funded Rush finisher',()=>{
 const c=fixture(),p=pipeline(c),i=p.divineShield[0];
 assert.equal(i.targetId,46);assert.ok(i.lowAttackIds.includes('o6t0'));
 assert.equal(p.forced.source,'shield_setup');assert.equal(p.forced.action.entityId,80);
 assert.equal(p.forced.evidence.finisherId,33);assert.equal(p.forced.evidence.reserveMana,4);
 assert.equal(p.forced.evidence.executeOnlyPop,true);
 assert.equal(i.packets[0].entityId,5);assert.equal(i.packets[0].shieldBreakGuaranteed,false);
});

test('unknown deathrattle is an observation boundary, not a reason to omit the shield-pop option',()=>{
 const c=fixture(),p=pipeline(c),m={kind:'attack',id:p.forced.action.entityId,targetId:p.forced.action.targetId};
 const r=apply(fromState(c.state,c.options),m);
 assert.equal(r.exact,false);assert.equal(r.s.opp.find(c=>c.id===46).ds,false);
 assert.ok(!r.s.me.some(c=>c.id===80));
 assert.ok(!r.s.me.some(c=>c.name==='Whelp'),'unobserved summon stats are not fabricated');
 assert.match(p.forced.evidence.guidance,/do not assume summoned stats or queue/);
});

test('narrative includes a minion played and killed within the same plan',()=>{
 const c=fixture(),text=narrate(fromState(c.state,c.options),c.recordedPlan);
 assert.match(text,/Your minions lost: Duke of Below/);
 assert.ok(!text.includes('Your minions lost: none'));
});

test('changed names/ids and attack stats generalize, surviving high attacker remains a comparison',()=>{
 const c=fixture(),egg=c.state.me.board.find(x=>x.entityId===80);
 Object.assign(egg,{entityId:900,name:'Other small minion',text:'Deathrattle: Draw a card.'});
 c.options.find(a=>a.entityId===80).entityId=900;
 const p=pipeline(c);assert.equal(p.plans.shield1[0].id,900);
 assert.ok(Object.values(p.plans).some(m=>m.some(x=>x.kind==='attack'&&x.id===10)),'3/6 survival alternative is not hard-deleted');
});

test('frozen/sleeping/zero-Attack/absent legal attacks cannot become shield-pop intents',()=>{
 for(const update of [{FROZEN:1},{EXHAUSTED:1},{ATK:0},{DORMANT:1}]){
  const c=fixture();Object.assign(c.state.me.board.find(x=>x.entityId===80),update);
  assert.ok(!divineShieldAssessment(c.state,c.options)[0].lowAttackIds.includes('o6t0'));
 }
 const c=fixture();c.options=c.options.filter(a=>a.entityId!==80);
 assert.ok(!divineShieldAssessment(c.state,c.options)[0].lowAttackIds.includes('o6t0'));
});

test('no shield means no synthetic shield option; damage cannot be counted as a guaranteed shield hit',()=>{
 const c=fixture();c.state.opponent.board.find(x=>x.entityId===46).DIVINE_SHIELD=0;
 assert.equal(divineShieldAssessment(c.state,c.options).length,0);
 assert.ok(!Object.keys(pipeline(c).plans??{}).some(id=>id.startsWith('shield')));
 const a=fixture();a.state.opponent.board.push({entityId:900,CARDTYPE:'MINION',ATK:1,HEALTH:1});
 const packet=divineShieldAssessment(a.state,a.options)[0].packets[0];
 assert.equal(packet.eligibleEnemies,3);assert.equal(packet.shieldBreakGuaranteed,false);assert.equal(packet.observeAfter,true);
});

test('packet damage requires legal affordable full text; missing option and unknown added clauses are not invented',()=>{
 for(const change of [
  c=>c.state.me.mana=3,
  c=>c.options=c.options.filter(x=>x.entityId!==5),
  c=>c.state.me.hand.find(x=>x.entityId===5).text+=' If your hero is damaged, double this.'
 ]){const c=fixture();change(c);assert.equal(divineShieldAssessment(c.state,c.options)[0].packets.length,0);}
});

test('shield alternatives do not restore premature attacks ahead of a beneficial buff',()=>{
 const c=fixture();c.state.me.hand.push({entityId:900,CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'});
 c.options.push({id:'buff',type:'POWER',entityId:900});
 // Remove the competing development that defers this buff: it is ready now.
 c.state.me.hand=c.state.me.hand.filter(x=>![33,26].includes(x.entityId));
 c.options=c.options.filter(x=>![33,26].includes(x.entityId));
 const p=pipeline(c);assert.ok(!Object.keys(p.plans??{}).some(id=>id.startsWith('shield')));
 assert.ok(p.turnOrder.heldAttackIds.includes('o6t0'));
});

test('visible lethal retains priority over low-Attack alternatives',()=>{
 const c=fixture(),foe=c.state.opponent.board.find(x=>x.CARDTYPE==='HERO');
 Object.assign(foe,{HEALTH:1,DAMAGE:0,ARMOR:0});
 c.state.me.board.find(x=>x.entityId===24).text='All friendly attacks ignore taunt.';
 c.options.push({id:'kill',type:'POWER',entityId:24,targetId:66});
 assert.equal(pipeline(c).forced.source,'forced_lethal');
});

test('previous turn-order engine remains frozen while current adds both alternatives',async()=>{
 const old=await loadDecisionEngine('silverfish-v1-turn-order-v1'),now=await loadDecisionEngine();
 assert.equal(now.version,'silverfish-v1-weapon-replacement-v1');
 const c=fixture(),p=old.prepare(c.state,old.constrainActions(c.state,c.options));
 assert.ok(!Object.keys(p.plans??{}).some(id=>id.startsWith('shield')));
 assert.ok(!Object.keys(p.crit).some(id=>old.resolve(p,id).action.entityId===80));
 assert.equal(pipeline(c).forced.source,'shield_setup');
});
