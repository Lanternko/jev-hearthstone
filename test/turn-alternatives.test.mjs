import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions} from '../src/policy.mjs';
import {prepare,resolve,allowsPlanContinuation} from '../src/choose.mjs';
import {handRetentionAssessment} from '../src/hand-retention.mjs';
import {turnAlternatives} from '../src/turn-alternatives.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
import {fromState} from '../src/sim.mjs';
import {narrate} from '../src/plan.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/validation10-game4-barrage-acolytes-linked-duke.json',import.meta.url)));
const fixture=()=>structuredClone(original);
function pipeline(c){const trace={},full=constrainActions(c.state,c.options,{trace});return {full,p:prepare(c.state,full,{admission:trace.admission})};}
const routes=p=>Object.keys(p.crit??{}).map(id=>({id,action:resolve(p,id).action,description:p.crit[id].description,steps:p.plans?.[id]}));

test('game 4 T6: random damage plus development reserves six total mana without claiming kills',()=>{
 const c=fixture(),{p}=pipeline(c),intent=p.turnAlternatives.find(i=>i.kind==='random_damage_then_development');
 assert.equal(intent.damageEntityId,60);assert.equal(intent.followupEntityId,61);
 assert.equal(intent.totalCost,6);assert.equal(intent.reserveMana,2);assert.equal(intent.manaAfterDamage,2);
 assert.equal(intent.enemyMinions.length,3);assert.equal(intent.baseDamage,5);
 assert.deepEqual(intent.enemyMinions.map(c=>c.health),[2,2,2]);
 assert.equal(intent.heroAlsoEligible,true);assert.equal(intent.queuedFollowup,false);
 assert.match(p.crit.o1.description,/reserving 2 mana/);assert.match(p.crit.o1.description,/no kills/);
 assert.ok(!p.forced);assert.ok(!routes(p).some(r=>r.steps?.[0].id===60&&r.steps.length>1));
});

test('safe draw remains a competing information intent with four mana and an observation boundary',()=>{
 const {p}=pipeline(fixture()),tap=p.turnAlternatives.find(i=>i.firstActionId==='o6');
 assert.equal(tap.draws,1);assert.equal(tap.manaAfterDraw,4);assert.equal(tap.queuedFollowup,false);
 assert.equal(tap.risk.damageMax,12);
 assert.ok(routes(p).some(r=>r.action.entityId===67));
 for(const r of routes(p).filter(r=>r.action.entityId===67&&r.steps)){
  assert.equal(r.steps.length,1);assert.equal(r.steps[0].exact,false);
 }
});

test('conditional minion death link is distinct from automatic end-of-turn expiry',()=>{
 const {p}=pipeline(fixture()),risk=p.handRetention.risks[0];
 assert.equal(risk.entityId,57);assert.equal(risk.condition,'linked_friendly_minion_dies');
 assert.equal(risk.confidence,0.9);assert.deepEqual(risk.sourceCandidates,[37]);
 assert.match(risk.guidance,/not turn-end expiry/);
 assert.ok(!p.temporaryDiscard.some(c=>c.entityId===57));
});

test('otherwise equivalent Dukes use the threatened copy in direct choices, plans and queue guards',()=>{
 const c=fixture(),{full,p}=pipeline(c);
 assert.ok(full.some(a=>a.entityId===57));assert.ok(!full.some(a=>a.entityId===56));
 assert.ok(routes(p).some(r=>r.steps?.[0].id===57));
 assert.ok(!routes(p).some(r=>r.action.entityId===56));
 assert.equal(allowsPlanContinuation(c.state,c.options,c.options.find(a=>a.entityId===56)),false);
 assert.equal(allowsPlanContinuation(c.state,c.options,c.options.find(a=>a.entityId===57)),true);
 assert.match(p.crit.o3.description,/Conditional discard/);
});

test('equivalent-copy ruling generalizes across minion names, card IDs and common stat changes',()=>{
 const c=fixture();for(const h of c.state.me.hand.filter(h=>[56,57].includes(h.entityId)))Object.assign(h,{cardId:'OTHER',name:'Other Rush body',ATK:5,HEALTH:6});
 assert.deepEqual(handRetentionAssessment(c.state,c.options).copyPreferences[0].deferredEntityIds,[56]);
});

test('different costs, stats, effects, enchantments and positional mechanics retain separate comparisons',()=>{
 for(const mutate of [c=>c.COST=3,c=>c.ATK=3,c=>c.text+=' Battlecry: Draw a card.',c=>c.otherEnchantment=42,c=>c.text+=' Outcast: Gain +1/+1.']){
  const c=fixture();mutate(c.state.me.hand.find(h=>h.entityId===57));
  assert.equal(handRetentionAssessment(c.state,c.options).copyPreferences.length,0);
 }
});

test('unpayable threatened copy cannot remove a legal safe copy',()=>{
 const c=fixture();c.options=c.options.filter(a=>a.entityId!==57);
 assert.equal(handRetentionAssessment(c.state,c.options).copyPreferences.length,0);
 assert.equal(allowsPlanContinuation(c.state,c.options,c.options.find(a=>a.entityId===56)),true);
});

test('another positional hand card prevents collapsing distinct copy positions',()=>{
 const c=fixture();c.state.me.hand[0].text='Outcast: Draw two cards.';
 assert.equal(handRetentionAssessment(c.state,c.options).copyPreferences.length,0);
});

test('structured discard link requires its active exact-text source and strong evidence',()=>{
 const c=fixture(),h=c.state.me.hand.find(h=>h.entityId===57);
 h.discardLink={sourceEntityId:37,confidence:1,condition:'source_minion_death'};
 assert.equal(handRetentionAssessment(c.state,c.options).risks[0].sourceEntityId,37);
 h.discardLink.confidence=0.5;assert.equal(handRetentionAssessment(c.state,c.options).copyPreferences.length,0);
 h.discardLink.confidence=1;
 for(const mode of ['silenced','dormant','dead','missing','unknown-text']){
  const x=structuredClone(c),s=x.state.me.board.find(b=>b.entityId===37);
  if(mode==='silenced')s.SILENCED=1;
  if(mode==='dormant')s.DORMANT=1;
  if(mode==='dead')s.DAMAGE=s.HEALTH;
  if(mode==='missing')x.state.me.board=x.state.me.board.filter(b=>b.entityId!==37);
  if(mode==='unknown-text')s.text+=' Except if protected.';
  assert.equal(handRetentionAssessment(x.state,x.options).risks.length,0,mode);
 }
});

test('narration warns about a linked card left in hand when Platysaur dies',()=>{
 const c=fixture(),oldText=narrate(fromState(c.state,c.options),c.recordedPlan);
 assert.match(oldText,/Conditional hand loss/);
 const {p}=pipeline(c),newText=routes(p).find(r=>r.steps?.[0].id===57).description;
 assert.match(newText,/playing it now removes it/);assert.doesNotMatch(newText,/Conditional hand loss:/);
});

test('random damage development intent does not spend unavailable mana or overflow the board',()=>{
 for(const mode of ['five-mana','one-slot','no-followup','no-enemy','unknown-damage-clause']){
  const c=fixture();
  if(mode==='five-mana')c.state.me.mana=5;
  if(mode==='one-slot')for(let n=0;n<2;n++)c.state.me.board.push({entityId:900+n,CARDTYPE:'MINION',ATK:1,HEALTH:1});
  if(mode==='no-followup')c.options=c.options.filter(a=>a.entityId!==61);
  if(mode==='no-enemy')c.state.opponent.board=c.state.opponent.board.filter(c=>c.CARDTYPE!=='MINION');
  if(mode==='unknown-damage-clause')c.state.me.hand.find(c=>c.entityId===60).text+=' Then draw two cards.';
  assert.ok(!turnAlternatives(c.state,c.options).some(i=>i.kind==='random_damage_then_development'),mode);
 }
});

test('damage-plus-development intent uses full text rather than fixed card names or IDs',()=>{
 const c=fixture();for(const h of c.state.me.hand.filter(c=>[60,61].includes(c.entityId))){h.name='Renamed intent';h.cardId='OTHER';}
 assert.ok(turnAlternatives(c.state,c.options).some(i=>i.kind==='random_damage_then_development'));
});

test('alternative draw guidance cannot bypass self-lethal, fatigue or full-hand gates',()=>{
 for(const mode of ['low-health','fatigue','full-hand']){
  const c=fixture();
  if(mode==='low-health')c.state.me.board.find(b=>b.CARDTYPE==='HERO').DAMAGE=28;
  if(mode==='fatigue'){c.state.me.deckCount=0;c.state.me.fatigue=24;}
  if(mode==='full-hand')while(c.state.me.hand.length<10)c.state.me.hand.push({entityId:900+c.state.me.hand.length,CARDTYPE:'SPELL',COST:10,text:''});
  const {full,p}=pipeline(c);assert.ok(!full.some(a=>a.entityId===67),mode);
  assert.ok(!p.turnAlternatives.some(i=>i.firstActionId==='o6'),mode);
 }
});

test('previous engine remains frozen with both copies; current engine admits all three user comparisons',async()=>{
 const c=fixture(),old=await loadDecisionEngine('silverfish-v1-temporary-discard-v1'),now=await loadDecisionEngine();
 assert.equal(now.version,'silverfish-v1-weapon-replacement-v1');
 assert.ok(old.constrainActions(c.state,c.options).some(a=>a.entityId===56));
 const {p}=pipeline(c),first=routes(p).map(r=>r.action.entityId);
 for(const id of [60,61,67,57])assert.ok(first.includes(id));
});
