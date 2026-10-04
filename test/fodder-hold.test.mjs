import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,wastedFodder,fodderRelease} from '../src/policy.mjs';
import {prepare} from '../src/choose.mjs';
import {holdValue,fodderHoldPenalty} from '../src/fodder-hold.mjs';
import {search,score} from '../src/plan.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/morning-g1-t16-golem-under-lethal.json',import.meta.url)));
const fixture=()=>structuredClone(original);
const pipeline=c=>{const trace={},a=constrainActions(c.state,c.options,{trace});return {trace,p:prepare(c.state,a,{admission:trace.admission})};};
const hand=(c,id)=>c.state.me.hand.find(x=>x.entityId===id);
const W={draw:1.5};
const card=(name,type,cost,text,atk=0,hp=0)=>({id:1,name,type,cost,text,atk,hp});

// The recorded board with Golem swapped for Walking Dead and Trogg Exile gone: 9 attack against
// 6 health, and only a 2/5 Taunt wall (6+5 > 9) keeps us alive.
function tauntSaves(){
 const c=fixture();
 Object.assign(hand(c,21),{name:'Walking Dead',ATK:2,HEALTH:5,COST:3,text:'Taunt If you discard this minion, summon it.'});
 c.state.opponent.board=c.state.opponent.board.filter(x=>x.entityId!==147);
 return c;
}

test('recorded g1 T16: Golem has no Taunt, cannot stop their lethal, and stays deleted',()=>{
 const c=fixture();
 assert.deepEqual([...wastedFodder(c.state)],[21]);
 assert.equal(fodderRelease(c.state,c.options),null);
 const {trace,p}=pipeline(c);
 assert.equal(trace.fodderRelease,null);
 assert.ok(!(p.acts??[]).some(a=>a.id==='o1'),'the Golem cast stays off the menu');
 const {start,plans}=search(c.state,c.options,{fodderHold:[21]});
 assert.ok(score(start,start)<=-50,'their board is lethal whatever we do');
 assert.ok(plans[0].steps[0].id!==21,'with the hold charged the search no longer leads with Golem');
});

test('a Taunt cast that turns their lethal into survival is released for that one action',()=>{
 const c=tauntSaves(),r=fodderRelease(c.state,c.options);
 assert.ok(r,'released');
 assert.equal(r.version,'fodder-hold-v1');assert.equal(r.actionId,'o1');assert.equal(r.name,'Walking Dead');
 assert.equal(r.outlet,'Chronoclaws');assert.equal(r.holdValue,10);
 assert.ok(r.score>r.idleScore+40,'the cast removes the -50 lethal term');
 const {trace,p}=pipeline(c);
 assert.equal(trace.fodderRelease.actionId,'o1');
 const ids=Object.keys(p.crit??{}).filter(id=>p.crit[id].fodderHold);
 assert.ok(ids.length,'the released cast carries its hold cost to Jev');
 for(const id of ids)assert.match(p.crit[id].description,/gives up its free discard payoff \(about 10 /);
});

test('the same Walking Dead with no lethal to stop is an ordinary hold and stays deleted',()=>{
 const c=tauntSaves();c.state.opponent.board=c.state.opponent.board.filter(x=>x.CARDTYPE!=='MINION');
 assert.equal(fodderRelease(c.state,c.options),null);
 const {trace,p}=pipeline(c);assert.equal(trace.fodderRelease,null);
 assert.ok(!(p.acts??[]).some(a=>a.id==='o1'));
});

test('a Taunt that is not enough to survive is not released either',()=>{
 const c=tauntSaves();c.state.opponent.board.push({entityId:900,CARDTYPE:'MINION',name:'Ogre',ATK:4,HEALTH:4});
 assert.equal(fodderRelease(c.state,c.options),null);
});

test('hold value is what the simulator would award for the discard',()=>{
 assert.equal(holdValue(card('Walking Dead','MINION',3,'Taunt If you discard this minion, summon it.',2,5),W),10);
 assert.equal(holdValue(card('Silverware Golem','MINION',3,'If you discard this minion, summon it.',3,4),W),8);
 assert.equal(holdValue(card('Boneweb Egg','MINION',2,'Deathrattle: Summon two 2/1 Spiders. If you discard this, trigger its Deathrattle.',0,2),W),6);
 assert.equal(holdValue(card("Hand of Gul'dan",'SPELL',6,'When you play or discard this, draw 3 cards.'),W),4.5);
 assert.equal(holdValue(card('Disposable Acolytes','SPELL',2,'When you play or discard this, summon two random 1-Cost minions.'),W),6);
 assert.equal(holdValue(card('Blast','SPELL',3,'Deal 5 damage.'),W),0);
});

test('the penalty charges a held card only when it left the hand without being discarded',()=>{
 const c=card('Silverware Golem','MINION',3,'If you discard this minion, summon it.',3,4),start={fodderHold:[1],hand:[c]};
 assert.equal(fodderHoldPenalty(start,{hand:[c],discarded:[]},W),0,'still held');
 assert.equal(fodderHoldPenalty(start,{hand:[],discarded:[c]},W),0,'discarded: the payoff fired');
 assert.equal(fodderHoldPenalty(start,{hand:[],discarded:[]},W),8,'cast');
 assert.equal(fodderHoldPenalty({hand:[c]},{hand:[],discarded:[]},W),0,'no hold set: the plain menu search is unchanged');
});

test('weapon-replacement engine is frozen; current version adds the release',async()=>{
 const previous=await loadDecisionEngine('silverfish-v1-weapon-replacement-v1'),now=await loadDecisionEngine();
 assert.equal(now.version,'silverfish-v1-veto-audit-v1');assert.notEqual(previous.prepare,now.prepare);
 const c=tauntSaves(),old=previous.prepare(c.state,previous.constrainActions(c.state,c.options));
 assert.ok(!(old.acts??[]).some(a=>a.id==='o1')&&old.forced?.action?.id!=='o1','historical engine still deletes the cast');
 const {p}=pipeline(c);
 assert.ok((p.acts??[]).some(a=>a.id==='o1')||Object.values(p.plans??{}).some(s=>s[0].id===21)||p.forced?.action?.id==='o1');
});
