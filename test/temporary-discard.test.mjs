import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions} from '../src/policy.mjs';
import {prepare,resolve,allowsPlanContinuation} from '../src/choose.mjs';
import {temporaryDiscardAssessments,temporaryPayoff} from '../src/temporary-discard.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/validation10-game3-temporary-free-325.json',import.meta.url)));
const fixture=()=>structuredClone(original);
function pipeline(c){const trace={},full=constrainActions(c.state,c.options,{trace});return {full,trace,p:prepare(c.state,full,{admission:trace.admission})};}

test('Eswin T3: verified Temporary 325 waits for free expiry, leaving safe Life Tap available',()=>{
 const c=fixture(),{full,p}=pipeline(c);
 assert.ok(!full.some(a=>a.entityId===18));
 assert.ok(full.some(a=>a.entityId===81));
 assert.ok(!Object.values(p.plans??{}).some(s=>s[0].id===18));
 assert.ok(Object.keys(p.crit).some(id=>resolve(p,id).action.entityId===81));
 const evidence=p.temporaryDiscard.find(c=>c.entityId===18);
 assert.equal(evidence.payoff.kind,'body');assert.equal(evidence.deferHardCast,true);
 assert.equal(evidence.castCost,3);assert.equal(evidence.endTurnManaCost,0);
 assert.equal(evidence.fits,true);assert.equal(c.state.me.mana,3);
});

test('Discover note distinguishes free turn-end payoff from the affordable printed cost',()=>{
 const c=fixture().discover,{p}=pipeline(c);
 assert.ok(p.crit.c4e131);assert.match(p.crit.c4e131.description,/zero mana/);
 assert.match(p.crit.c4e131.description,/safe draw/);
});

test('exact-text self-summon generalizes across name/id/stat changes',()=>{
 const c=fixture(),card=c.state.me.hand[0];
 Object.assign(card,{entityId:900,name:'Other self-summoning body',ATK:4,HEALTH:7});
 c.options.find(a=>a.entityId===18).entityId=900;
 assert.equal(temporaryPayoff(card).kind,'body');
 assert.ok(!pipeline(c).full.some(a=>a.entityId===900));
});

test('non-temporary, wrong expiry, untrusted enchantment and unknown appended clauses retain the cast',()=>{
 for(const mutate of [c=>delete c.temporary,c=>c.temporary.expires='next_turn',
  c=>c.temporary.confidence=0.5,c=>c.text+=' Also summon a Demon.'
 ]){
  const c=fixture();mutate(c.state.me.hand[0]);
  assert.ok(pipeline(c).full.some(a=>a.entityId===18));
 }
});

test('an affordable follow-up buff or immediate attack preserves the paid-play comparison',()=>{
 for(const mode of ['buff','rush','charge']){
  const c=fixture();
  if(mode==='buff'){
   c.state.me.mana=4;c.state.me.maxMana=4;
   c.state.me.hand.push({entityId:900,CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'});
   c.options.push({id:'buff',type:'POWER',entityId:900});
  }else c.state.me.hand[0][mode.toUpperCase()]=1;
  assert.equal(temporaryDiscardAssessments(c.state,c.options)[0].deferHardCast,false);
  assert.ok(pipeline(c).full.some(a=>a.entityId===18));
 }
});

test('summon-trigger engine preserves immediate value; spent Battlecry alone does not',()=>{
 const c=fixture();c.state.me.board.find(c=>c.entityId===116).text='After you summon a minion, deal 1 damage to a random enemy.';
 assert.equal(temporaryDiscardAssessments(c.state,c.options)[0].deferHardCast,false);
 assert.ok(pipeline(c).full.some(a=>a.entityId===18));
 assert.equal(temporaryDiscardAssessments(fixture().state,fixture().options)[0].playEngine,false);
});

test('highest-cost weapon setup is left to existing weapon rules rather than this expiry gate',()=>{
 const c=fixture();c.state.me.hand.push({entityId:900,CARDTYPE:'SPELL',COST:2,text:'When you play or discard this, draw 3 cards.'});
 c.state.me.board.push({entityId:901,CARDTYPE:'WEAPON',ATK:4,HEALTH:3,text:'After your hero attacks, discard your highest Cost card.'});
 const i=temporaryDiscardAssessments(c.state,c.options)[0];
 assert.equal(i.changesWeaponDiscard,true);assert.equal(i.deferHardCast,false);
 assert.equal(i.playActionId,'o1');
});

test('reserve all known expiring body slots and reject unknown competing expiry outcomes',()=>{
 for(const mode of ['full','two-bodies-one-slot','unknown']){
  const c=fixture();
  if(mode==='unknown')c.state.me.hand.push({entityId:900,CARDTYPE:'SPELL',COST:0,text:'If you discard this, summon mysterious things.',temporary:{expires:'end_of_own_turn',confidence:1}});
  else{
   const target=mode==='full'?7:6;
   while(c.state.me.board.filter(c=>c.CARDTYPE==='MINION').length<target)c.state.me.board.push({entityId:900+c.state.me.board.length,CARDTYPE:'MINION',ATK:1,HEALTH:1,EXHAUSTED:1});
   if(mode!=='full')c.state.me.hand.push({...structuredClone(c.state.me.hand[0]),entityId:950});
  }
  const i=temporaryDiscardAssessments(c.state,c.options)[0];
  assert.equal(i.fits,false);assert.equal(i.deferHardCast,false);
 }
});

test('spare mana never overrides lethal self-damage, overdraw or fatigue draw gates',()=>{
 for(const mode of ['low-health','full-hand','fatigue']){
  const c=fixture();
  if(mode==='low-health')c.state.me.board.find(c=>c.CARDTYPE==='HERO').DAMAGE=28;
  if(mode==='fatigue'){c.state.me.deckCount=0;c.state.me.fatigue=24;}
  if(mode==='full-hand')while(c.state.me.hand.length<10)c.state.me.hand.push({entityId:900+c.state.me.hand.length,CARDTYPE:'SPELL',COST:10,text:''});
  const {full}=pipeline(c);
  assert.ok(!full.some(a=>a.entityId===18));assert.ok(!full.some(a=>a.entityId===81));
 }
});

test('no draw option still permits attacks and ending without spending on the expiring body',()=>{
 const c=fixture();c.options=c.options.filter(a=>a.entityId!==81);
 const {full,p}=pipeline(c);
 assert.ok(full.some(a=>a.type==='END_TURN'));assert.ok(!full.some(a=>a.entityId===18));
 assert.ok(!p.forced||p.forced.action.entityId!==18);
});

test('after attacks, safe spare mana draws even while the free expiring body remains in hand',()=>{
 const c=fixture();
 for(const b of c.state.me.board.filter(c=>c.CARDTYPE==='MINION')){b.EXHAUSTED=1;b.NUM_ATTACKS_THIS_TURN=1;}
 c.options=c.options.filter(a=>a.targetId==null);
 const {p}=pipeline(c);
 const next=p.forced?[p.forced.action]:Object.keys(p.crit).map(id=>resolve(p,id).action);
 assert.ok(next.length>0);assert.ok(next.every(a=>a.entityId===81));
 assert.equal(c.state.me.hand[0].entityId,18);
 assert.equal(p.temporaryDiscard[0].deferHardCast,true);
});

test('current queued guard rejects raw hard-cast too; previous shield engine remains frozen',async()=>{
 const c=fixture(),action=c.options.find(a=>a.entityId===18);
 const old=await loadDecisionEngine('silverfish-v1-shield-alternatives-v1'),now=await loadDecisionEngine();
 assert.equal(now.version,'silverfish-v1-veto-audit-v1');
 assert.equal(old.allowsPlanContinuation(c.state,c.options,action),true);
 assert.equal(allowsPlanContinuation(c.state,c.options,action),false);
 assert.ok(old.constrainActions(c.state,c.options).some(a=>a.entityId===18));
});
