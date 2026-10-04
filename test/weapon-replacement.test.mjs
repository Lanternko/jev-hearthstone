import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weaponReplacement} from '../src/weapon-replacement.mjs';
import {weaponPreservation} from '../src/weapon-preservation.mjs';
import {constrainActions} from '../src/policy.mjs';
import {prepare,allowsPlanContinuation} from '../src/choose.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game3-swing-before-replace.json',import.meta.url)));
const fixture=()=>structuredClone(original);
const pipeline=c=>{const trace={},a=constrainActions(c.state,c.options,{trace});return prepare(c.state,a,{admission:trace.admission});};
const proof=c=>weaponReplacement(c.state,c.options);
const hand=(c,id)=>c.state.me.hand.find(x=>x.entityId===id);
const hero=c=>c.state.me.board.find(x=>x.CARDTYPE==='HERO');
const foe=c=>c.state.opponent.board.find(x=>x.CARDTYPE==='HERO');
const equip=c=>c.options.find(a=>a.id==='o2');

test('recorded game3 turn6 swings the 1-durability Chronoclaws before equipping the second copy',()=>{
 const c=fixture(),r=proof(c),p=pipeline(c);
 assert.equal(c.actual.id,'o2','the recorded mistake equipped first');
 assert.equal(r.equipActionId,'o2');assert.equal(r.weaponId,5);assert.equal(r.replacedId,27);
 assert.deepEqual(r.proof.sameDiscardSet.map(t=>t.entityId),[10]);
 assert.equal(r.proof.oldDurability,1);assert.equal(r.proof.mana,6);assert.equal(r.proof.handAfterSwing,4);
 assert.equal(p.forced,undefined,'no forced move: the swing target and the follow-up stay with Jev');
 assert.ok(!p.acts.some(a=>a.id==='o2'));assert.ok(!Object.hasOwn(p.crit,'o2'));
 assert.ok(!Object.values(p.plans).some(s=>s[0].id===5),'no plan starts by equipping');
 assert.ok(p.acts.some(a=>a.entityId===64&&a.targetId!=null),'old weapon swings remain legal');
 const swingPlans=Object.entries(p.plans).filter(([,s])=>s[0].kind==='attack'&&s[0].id===64);
 assert.ok(swingPlans.length,'a swing-first plan stays on the menu');
 for(const [id] of swingPlans){assert.equal(p.crit[id].weaponReplacement.version,'weapon-replacement-v1');
  assert.match(p.crit[id].description,/Swing the equipped Chronoclaws before equipping Chronoclaws/);}
 assert.equal(p.weaponReplacement.equipActionId,'o2');
 assert.equal(allowsPlanContinuation(c.state,c.options,equip(c)),false,'a queued plan cannot reach the vetoed equip');
});

test('user contrast: with only the new weapon in hand, swinging first would discard it, so both orders stay',()=>{
 const c=fixture();c.state.me.hand=c.state.me.hand.filter(x=>x.entityId!==10);c.options=c.options.filter(a=>a.entityId!==10);
 assert.equal(proof(c),null);
 const p=pipeline(c);assert.ok(p.forced?.action?.id==='o2'||p.acts?.some(a=>a.id==='o2'),'equip is not removed');
});

test('same-cost tie that includes the new weapon is a different discard set and is compared',()=>{
 const c=fixture();hand(c,10).COST=4;assert.equal(proof(c),null);
 const a=fixture();hand(a,5).COST=6;assert.equal(proof(a),null,'new weapon as highest card');
});

test('tie of payoffs without the new weapon keeps the proof; every tied card must pay',()=>{
 const c=fixture();c.state.me.hand.push({entityId:500,CARDTYPE:'SPELL',COST:6,name:'Disposable Acolytes',
  text:'When you play or discard this, summon two random 1-Cost minions.'});
 const r=proof(c);assert.deepEqual(r.proof.sameDiscardSet.map(t=>t.entityId).sort((x,y)=>x-y),[10,500]);
 const a=fixture();a.state.me.hand.push({entityId:500,CARDTYPE:'SPELL',COST:6,name:'Blast',text:'Deal 5 damage.'});
 assert.equal(proof(a),null,'a nonpayoff in the tied top set may be the card discarded');
});

test('a new weapon that hits harder makes equip-first a different swing and is compared',()=>{
 const c=fixture();hand(c,5).ATK=5;assert.equal(proof(c),null);
 const a=fixture();a.state.me.board.find(x=>x.entityId===27).ATK=3;assert.equal(proof(a),null,'worn-down old weapon');
 assert.ok(proof(fixture()),'equal attack proves');
});

test('a top card that does not pay in full is left to comparison',()=>{
 for(const update of [
  {name:'Duke of Below',CARDTYPE:'MINION',ATK:4,HEALTH:4,text:'Has +2/+2 for each card you\'ve discarded this game.'},
  {name:'Blast',text:'Deal 5 damage.'},
  {name:'Mystery',text:''}
 ]){const c=fixture();Object.assign(hand(c,10),update);assert.equal(proof(c),null,update.name);}
});

test('overdraw, fatigue and a full board for body payoffs keep both orders',()=>{
 const c=fixture();for(let n=0;n<7;n++)c.state.me.hand.push({entityId:600+n,CARDTYPE:'SPELL',COST:1,text:''});
 assert.equal(proof(c),null,'9 cards - 1 + 3 drawn would burn');
 const a=fixture();a.state.me.deckCount=2;assert.equal(proof(a),null);
 const b=fixture();Object.assign(hand(b,10),{name:'Walking Dead',CARDTYPE:'MINION',ATK:9,HEALTH:6,text:'Taunt If you discard this minion, summon it.'});
 assert.ok(proof(b),'discarded body payoff with room proves');
 for(let n=0;n<6;n++)b.state.me.board.push({entityId:700+n,CARDTYPE:'MINION',ATK:1,HEALTH:1});
 assert.equal(proof(b),null);
});

test('no free face swing, secrets, hero unable to swing or windfury leave the orders to comparison',()=>{
 const c=fixture();c.options=c.options.filter(a=>a.id!=='o3t0');assert.equal(proof(c),null,'taunt: no face swing');
 const s=fixture();s.state.opponent.secretCount=1;assert.equal(proof(s),null);
 for(const update of [{FROZEN:1},{EXHAUSTED:1},{NUM_ATTACKS_THIS_TURN:1},{WINDFURY:1}]){
  const h=fixture();Object.assign(hero(h),update);assert.equal(proof(h),null,Object.keys(update)[0]);
 }
 const w=fixture();w.state.me.board.find(x=>x.entityId===27).WINDFURY=1;assert.equal(proof(w),null);
});

test('only the known Chronoclaws discard text is modelled; mana, legality and choices are checked',()=>{
 const t=fixture();hand(t,5).text='Deathrattle: Deal 2 damage.';assert.equal(proof(t),null);
 const o=fixture();o.state.me.board.find(x=>x.entityId===27).SILENCED=1;assert.equal(proof(o),null);
 const m=fixture();m.state.me.mana=3;assert.equal(proof(m),null);
 const l=fixture();l.options=l.options.filter(a=>a.id!=='o2');assert.equal(proof(l),null);
 const ch=fixture();ch.state.choice={type:'DISCOVER'};assert.equal(proof(ch),null);
});

test('visible lethal still wins before the replacement veto',()=>{
 const c=fixture();foe(c).DAMAGE=26;foe(c).ARMOR=0;
 const p=pipeline(c),pick=p.forced?.action??p.lethal?.action;
 assert.match(p.forced?.source??p.lethal?.source,/lethal/);assert.equal(pick.entityId,64);assert.equal(pick.targetId,66);
});

test('replacement swing damage counts the equipped weapon once, keeping only the hero bonus',()=>{
 const damage=c=>Object.fromEntries(weaponPreservation(c.state,c.options).map(i=>[i.weaponId,i.swingDamage]));
 const c=fixture();assert.deepEqual(damage(c),{27:4,5:4},'hero ATK 4 is the equipped 4/3, not a bonus');
 assert.equal(pipeline(c).weaponPreservation.find(i=>i.weaponId===5).swingDamage,4,'Jev sees 4, not 8');
 const b=fixture();hero(b).ATK=6;assert.equal(damage(b)[5],6,'a +2 hero bonus survives the replacement');
 const s=fixture();hero(s).ATK=2;assert.equal(damage(s)[5],4,'a stale low tag never shrinks the new swing');
 const n=fixture();n.state.me.board=n.state.me.board.filter(x=>x.CARDTYPE!=='WEAPON');hero(n).ATK=1;
 assert.deepEqual(damage(n),{5:5},'with no weapon worn the whole hero ATK is a bonus');
});

test('validated-turn-intents engine is frozen; current version adds the veto',async()=>{
 const previous=await loadDecisionEngine('silverfish-v1-validated-turn-intents-v1'),now=await loadDecisionEngine();
 assert.equal(now.version,'silverfish-v1-fodder-hold-v1');assert.notEqual(previous.prepare,now.prepare);
 const c=fixture(),old=previous.prepare(c.state,previous.constrainActions(c.state,c.options));
 assert.equal(old.weaponReplacement,undefined);
 assert.ok(old.acts.some(a=>a.id==='o2'),'historical engine still offers the equip');
 assert.ok(!pipeline(c).acts.some(a=>a.id==='o2'));
});
