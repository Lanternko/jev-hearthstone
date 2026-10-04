import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chamberIntents,preferredChamberIntent} from '../src/chamber-intent.mjs';
import {constrainActions} from '../src/policy.mjs';
import {prepare,resolve} from '../src/choose.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/validation10-game1-chamber-walking-dead.json',import.meta.url)));
const fixture=()=>structuredClone(original);
const pipeline=c=>{const trace={},a=constrainActions(c.state,c.options,{trace});return prepare(c.state,a,{admission:trace.admission});};
const assessment=c=>chamberIntents(c.state,c.options)[0];
const preferred=c=>preferredChamberIntent(c.state,c.options,chamberIntents(c.state,c.options));
function installed(c,{charges=2}={}){
 const loc=c.state.me.hand.find(x=>x.entityId===24);
 c.state.me.hand=c.state.me.hand.filter(x=>x.entityId!==24);
 c.state.me.board.push({...loc,HEALTH:charges,EXHAUSTED:0,LOCATION_ACTION_COOLDOWN:0});
 c.state.me.mana=0;c.options=[{id:'end',type:'END_TURN'},{id:'activate',type:'POWER',entityId:24}];
 return c;
}

test('recorded game: install Chamber instead of nonlethal Soulfire, with the full payoff logged',()=>{
 const c=fixture(),p=pipeline(c),i=p.chamberIntents[0];
 assert.equal(p.forced.action.id,'o1');assert.equal(p.forced.source,'chamber_development');
 assert.equal(i.phase,'install');assert.equal(i.handAfterInstall,3);assert.equal(i.installCost,3);
 assert.equal(i.activationCost,0);assert.equal(i.manaAfter,0);assert.equal(i.slotsAtDiscard,3);
 assert.equal(i.chargesAfterUse,1);
 const body=i.candidates.find(x=>x.entityId===15);
 assert.equal(body.guaranteedOffer,true);assert.equal(body.attack,2);assert.equal(body.health,5);
 assert.equal(body.bodies,1);assert.equal(body.safeDraw,true);assert.equal(body.drawRisk.requested,2);
 assert.ok(!p.rest&&!p.plans,'one observed first step, never a queued activation or draw');
});

test('the installed location can activate at zero mana; choose only from the fresh offer',()=>{
 const c=installed(fixture()),p=pipeline(c);
 assert.equal(p.forced.action.id,'activate');assert.equal(p.chamberIntents[0].phase,'activate');
 assert.ok(!p.rest&&!p.plans);
 const loc=c.state.me.board.find(x=>x.entityId===24);
 c.state.choice={id:45,type:'GENERAL',min:1,max:1,source:loc,entities:structuredClone(c.state.me.hand)};
 c.options=c.state.choice.entities.map(x=>({id:`c45e${x.entityId}`,type:'CHOICE',choiceId:45,entityId:x.entityId}));
 const pick=pipeline(c);
 assert.equal(pick.forced.action.entityId,15);assert.equal(pick.chamberIntents[0].phase,'choose');
 assert.ok(!pick.rest&&!pick.plans);
 // After the draw we have no retained intent: rest/choice legality is freshly read.
 delete c.state.choice;loc.EXHAUSTED=1;loc.LOCATION_ACTION_COOLDOWN=2;
 assert.equal(assessment(c).legal,false);assert.equal(preferred(c),null);
});

test('cost changes and entity ids generalize; installing is unaffordable when mana is short',()=>{
 const c=fixture();c.state.me.mana=2;
 assert.equal(assessment(c).legal,false);assert.equal(preferred(c),null);
 const loc=c.state.me.hand.find(x=>x.entityId===24);loc.COST=2;loc.entityId=924;loc.name='Discounted Chamber';
 c.options.find(x=>x.id==='o1').entityId=924;
 assert.equal(preferred(c).action.entityId,924);assert.equal(assessment(c).manaAfter,0);
});

test('a four-card remaining hand is an uncertain offer, not a guaranteed summon',()=>{
 const c=fixture();c.state.me.hand.push({entityId:500,CARDTYPE:'SPELL',COST:5,text:''});
 const i=assessment(c);assert.equal(i.handAfterInstall,4);assert.ok(i.candidates.every(x=>!x.guaranteedOffer));
 assert.equal(preferred(c),null);
 const p=pipeline(c);assert.notEqual(p.forced?.source,'chamber_development');
 assert.match(p.crit.o1.description,/Staged intent:/);assert.match(p.crit.o1.description,/larger hands do not/);
 assert.equal(resolve(p,'o1').action.entityId,24);
});

test('other known summon payoffs generalize; two rewarding offers remain a comparison',()=>{
 const c=fixture(),body=c.state.me.hand.find(x=>x.entityId===15);
 Object.assign(body,{name:'Silverware Golem',ATK:3,HEALTH:4,text:'If you discard this minion, summon it.'});
 assert.equal(preferred(c).action.id,'o1');assert.equal(assessment(c).candidates[0].attack,3);
 Object.assign(body,{name:'Boneweb Egg',ATK:0,HEALTH:2,
  text:'Deathrattle: Summon two 2/1 Spiders. If you discard this, trigger its Deathrattle.'});
 assert.equal(preferred(c).action.id,'o1');assert.equal(assessment(c).candidates[0].bodies,2);
 const a=fixture(),duke=a.state.me.hand.find(x=>x.entityId===19);
 Object.assign(duke,{CARDTYPE:'SPELL',name:'Hand of Gul\'dan',text:'When you play or discard this, draw 3 cards.'});
 assert.equal(assessment(a).candidates.length,2);assert.equal(preferred(a),null);
});

test('the install description does not claim activation draws occurred on installation',()=>{
 const c=fixture();c.state.opponent.secretCount=1;
 const p=pipeline(c);
 assert.ok(p.crit.o1.chamberIntent);
 assert.ok(!p.crit.o1.description.includes('Draw assessment:'),'draw bounds belong to the later chosen discard');
});

test('a missing legal install/activation/choice cannot be manufactured',()=>{
 const c=fixture();c.options=c.options.filter(x=>x.entityId!==24);
 assert.equal(assessment(c).legal,false);assert.equal(preferred(c),null);
 const a=installed(fixture());a.options=a.options.filter(x=>x.entityId!==24);
 assert.equal(assessment(a).legal,false);assert.equal(preferred(a),null);
 const loc=a.state.me.board.find(x=>x.entityId===24);
 a.state.choice={type:'GENERAL',source:loc,entities:a.state.me.hand.filter(x=>x.entityId!==15)};
 a.options=a.state.choice.entities.map(x=>({id:`c${x.entityId}`,type:'CHOICE',entityId:x.entityId}));
 assert.ok(!assessment(a).candidates.some(x=>x.entityId===15));assert.equal(preferred(a),null);
});

test('cooldown/exhaustion and no charges forbid activating even if a stale option survives',()=>{
 for(const update of [{EXHAUSTED:1},{EXHAUSTED:'1'},{LOCATION_ACTION_COOLDOWN:1},{HEALTH:0}]){
  const c=installed(fixture());Object.assign(c.state.me.board.find(x=>x.entityId===24),update);
  assert.equal(assessment(c).legal,false);assert.equal(preferred(c),null);
 }
});

test('slots include installation and last-charge release; clipped bodies are not promised',()=>{
 const c=fixture();while(c.state.me.board.filter(x=>x.CARDTYPE==='MINION').length<6)
  c.state.me.board.push({entityId:500+c.state.me.board.length,CARDTYPE:'MINION',ATK:1,HEALTH:1});
 assert.equal(assessment(c).slotsAtDiscard,0);assert.equal(preferred(c),null);
 const a=installed(c,{charges:1});assert.equal(assessment(a).slotsAtDiscard,1);
 assert.equal(preferred(a).action.id,'activate');
 a.state.me.hand.find(x=>x.entityId===15).name='Boneweb Egg';
 Object.assign(a.state.me.hand.find(x=>x.entityId===15),{ATK:0,HEALTH:2,
  text:'Deathrattle: Summon two 2/1 Spiders. If you discard this, trigger its Deathrattle.'});
 assert.equal(assessment(a).candidates[0].fits,false);assert.equal(preferred(a),null);
});

test('safe refill must leave next compulsory draw, avoid burn and survive known auto-casts',()=>{
 for(const deckCount of [0,1,2]){
  const c=fixture();c.state.me.deckCount=deckCount;assert.equal(preferred(c),null);
 }
 const c=fixture();c.state.me.board.find(x=>x.CARDTYPE==='HERO').DAMAGE=25;
 c.state.me.drawHazards=[3,3];assert.equal(assessment(c).candidates[0].safeDraw,false);assert.equal(preferred(c),null);
 const a=installed(fixture());for(let n=0;n<9;n++)a.state.me.hand.push({entityId:500+n,CARDTYPE:'SPELL',text:''});
 assert.ok(assessment(a).candidates[0].drawRisk.burnMax>0);assert.equal(preferred(a),null);
});

test('a fresh choice reads current occupancy instead of spending a last charge twice',()=>{
 const c=installed(fixture(),{charges:1}),loc=c.state.me.board.find(x=>x.entityId===24);
 const body=c.state.me.hand.find(x=>x.entityId===15);
 Object.assign(body,{name:'Boneweb Egg',ATK:0,HEALTH:2,
  text:'Deathrattle: Summon two 2/1 Spiders. If you discard this, trigger its Deathrattle.'});
 while(c.state.me.board.filter(x=>x.CARDTYPE==='MINION').length<6)
  c.state.me.board.push({entityId:500+c.state.me.board.length,CARDTYPE:'MINION',ATK:1,HEALTH:1});
 c.state.choice={type:'GENERAL',source:loc,entities:c.state.me.hand};
 c.options=c.state.me.hand.map(x=>({id:`c${x.entityId}`,type:'CHOICE',entityId:x.entityId}));
 assert.equal(assessment(c).slotsAtDiscard,0,'a remaining charge does not mean another use is executed now');
 c.state.me.board=c.state.me.board.filter(x=>x.entityId!==24);
 assert.equal(assessment(c).slotsAtDiscard,1,'already freed location slot cannot be credited again');
 assert.equal(assessment(c).candidates[0].fits,false);
});

test('buff/development, secrets, enemy minions and unknown friendly engines keep comparison',()=>{
 for(const change of [
  c=>{c.state.me.hand.push({entityId:500,CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'});c.options.push({id:'buff',type:'POWER',entityId:500});},
  c=>{c.state.me.hand.push({entityId:500,CARDTYPE:'MINION',COST:1,ATK:2,HEALTH:1,text:''});c.options.push({id:'body',type:'POWER',entityId:500});},
  c=>c.state.opponent.secretCount=1,
  c=>c.state.opponent.board.push({entityId:500,CARDTYPE:'MINION',ATK:1,HEALTH:1}),
  c=>c.state.me.board.push({entityId:500,CARDTYPE:'MINION',ATK:1,HEALTH:1,text:'After you summon a minion, deal 1 damage to a random enemy.'})
 ]){const c=fixture();change(c);assert.equal(preferred(c),null);assert.notEqual(pipeline(c).forced?.source,'chamber_development');}
});

test('visible lethal is resolved before the new value intent',()=>{
 const c=fixture();c.state.opponent.board.find(x=>x.CARDTYPE==='HERO').DAMAGE=25;
 for(const b of c.state.me.board.filter(x=>x.CARDTYPE==='MINION')){
  b.EXHAUSTED=0;b.NUM_ATTACKS_THIS_TURN=0;
  c.options.push({id:`attack${b.entityId}`,type:'POWER',entityId:b.entityId,targetId:68});
 }
 const p=pipeline(c);assert.equal(p.forced?.source,'forced_lethal');assert.notEqual(p.forced?.action.entityId,24);
 const a=fixture();a.state.opponent.board.find(x=>x.CARDTYPE==='HERO').DAMAGE=26;
 assert.equal(preferred(a),null,'Soulfire burn range is not suppressed');
});

test('the v2 engine remains frozen; default and recorded new ruling have distinct behavior',async()=>{
 const old=await loadDecisionEngine('silverfish-v1-combo-admission-v2'),now=await loadDecisionEngine();
 assert.equal(now.version,'silverfish-v1-rule-release-v1');assert.notEqual(old.prepare,now.prepare);
 const c=fixture(),previous=old.prepare(c.state,old.constrainActions(c.state,c.options));
 assert.notEqual(previous.forced?.source,'chamber_development');
 assert.equal(pipeline(c).forced.action.entityId,24);
});
