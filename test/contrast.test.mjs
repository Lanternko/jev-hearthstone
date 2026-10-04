import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../src/policy.mjs';
// Step 4 of the rule-tier plan (2026-10-05): every preference gets a contrast pair. The positive is a
// real board from history where the rule took action X off the menu; the contrast is the same board
// with one feature changed, the feature the rule's reason rests on, and there X must stay. Passing
// both halves is what says the rule's scope is drawn where its reason is.
const load=n=>JSON.parse(readFileSync(new URL(`./fixtures/contrast/${n}.json`,import.meta.url),'utf8'));
const byName=(list,n)=>{const c=(list??[]).find(c=>c.name===n);assert.ok(c,`no ${n}`);return c;};
const prune=(x,id)=>{x.options=x.options.filter(o=>o.entityId!==id&&o.targetId!==id);};
const body=(id,atk,hp,extra)=>({entityId:id,name:'Test Body',CARDTYPE:'MINION',ATK:atk,HEALTH:hp,baseAttack:atk,baseHealth:hp,COST:1,text:'',...extra});
const E={
 mana:d=>x=>{x.state.me.mana=Number(x.state.me.mana)+d;
  x.options=x.options.filter(o=>{const c=x.state.me.hand.find(h=>h.entityId===o.entityId);return !c||Number(c.COST??0)<=x.state.me.mana;});},
 dropHand:n=>x=>{const c=byName(x.state.me.hand,n);x.state.me.hand=x.state.me.hand.filter(h=>h!==c);prune(x,c.entityId);},
 dropMine:n=>x=>{const c=byName(x.state.me.board,n);x.state.me.board=x.state.me.board.filter(h=>h!==c);prune(x,c.entityId);},
 dropFoe:n=>x=>{const c=byName(x.state.opponent.board,n);x.state.opponent.board=x.state.opponent.board.filter(h=>h!==c);prune(x,c.entityId);},
 myHp:hp=>x=>{const h=x.state.me.board.find(c=>c.CARDTYPE==='HERO');h.DAMAGE=Number(h.baseHealth??h.HEALTH??30)-hp;},
 foeHp:hp=>x=>{const h=x.state.opponent.board.find(c=>c.CARDTYPE==='HERO');h.DAMAGE=Number(h.baseHealth??h.HEALTH??30)-hp;},
 notTemporary:n=>x=>{delete byName(x.state.me.hand,n).temporary;},
 wake:n=>x=>{byName(x.state.me.board,n).EXHAUSTED=0;},
 addFoe:(atk,hp,k=1)=>x=>{for(let i=0;i<k;i++)x.state.opponent.board.push(body(900+i,atk,hp));},
 addMine:(atk,hp)=>x=>{x.state.me.board.push(body(950,atk,hp,{EXHAUSTED:1}));},
 // The same hand slot holding another card (borrowed from another fixture), same entity id.
 swapHand:(n,from)=>x=>{const c=byName(x.state.me.hand,n);x.state.me.hand[x.state.me.hand.indexOf(c)]={...structuredClone(from),entityId:c.entityId};},
 all:(...fs)=>x=>fs.forEach(f=>f(x)),
};
const card=(fixture,n)=>byName(load(fixture).state.me.hand,n);
const egg=card('saferCopies','Boneweb Egg'),claws=card('splitToFace','Chronoclaws');

// [rule, X (removed by the rule on the positive, kept on the contrast), contrast edit, the feature]
const PAIRS=[
 ['boardFirstDiscard','o3t1',E.mana(1),'one more mana: the board card fits beside the discard'],
 ['bodyBeforeBuff','o1',E.dropHand('Platysaur'),'no body in hand to play before the buff'],
 ['buffBeforeTap','o4',E.all(E.dropMine('Felbeast'),E.dropMine('Felbeast'),E.mana(3)),'two bodies, not three: the buff is no longer worth reserving for'],
 ['castBeforeSwing','o3t0',E.dropHand('Chamber of Viscidus'),'nothing to cast before the swing'],
 ['counterFirst','o5t5',E.mana(-2),'Duke of Below no longer castable this turn'],
 ['deadWhispers','o3',E.addMine(1,2),'one minion on board: the buff has a target'],
 ['deferHardCast','o1',E.notTemporary('Walking Dead'),'the Walking Dead is not a temporary copy'],
 ['developBeforeBuff','o2',E.foeHp(5),'their hero at 5: the buff is lethal now'],
 ['discardPick','c3e88',E.addFoe(1,1,3),'three 1/1s on their side: the split damage clears a swarm'],
 ['freezeThreatFirst','o2t0',E.dropFoe('Naga Monstrosity'),'no higher-Attack threat to freeze'],
 ['mustSpend','o4t0',E.mana(-1),'one mana: no card left to spend first'],
 ['mustSpendEnd','o0',E.swapHand('Disposable Acolytes',egg),'the card left is an Egg with Occultist in hand, a deliberate hold'],
 ['newBodyBuffWaits','o1',E.wake('Platysaur'),'the single body can attack this turn'],
 ['occultistPick','o2t2',E.addFoe(1,1),'a third 1/1 on their side: Soul Barrage clears a swarm'],
 ['overdrawWaits','o11',E.dropHand('Soul Barrage'),'one card fewer in hand: the draw no longer burns'],
 ['overflowWaits','o3',E.dropMine('Felbeast'),'one more free slot: all bodies fit'],
 ['passiveEggCoin','o2',E.mana(1),'one more mana: the Coin buys more than a lone Egg'],
 ['pricedOut','o3',E.mana(1),'one more mana: the tap no longer prices out a card'],
 ['saferCopies','o2',E.dropMine('Platysaur'),'no Platysaur: neither Egg copy is endangered'],
 ['setupFirst','o1t0',E.dropMine('Chamber of Viscidus'),'no location to set up before the swings'],
 ['splitToFace','o1',E.addFoe(2,2),'an enemy minion for the split damage to hit'],
 ['tapOnlyEnd','o0',E.all(E.myHp(6),E.addFoe(5,5)),'6 Health facing 5 Attack: tapping is not free'],
 ['wastedBurn','o3t0',E.foeHp(5),'their hero in burn range'],
 ['wastedFodder','o1',E.mana(-1),'two mana: Occultist cannot be the outlet this turn'],
 ['weaponBuffFirst','o4',E.myHp(6),'6 Health: the weapon line is no longer preferred'],
 ['weaponFirst','o3t0',E.dropMine('Chronoclaws'),'no weapon for the hero to swing first'],
 ['whispersEatsPlayable','o1',E.swapHand('Disposable Acolytes',claws),'casting Continuity leaves a real card, not fodder, as the cheapest'],
 ['whispersWaits','o2',E.all(E.swapHand('Platysaur',claws),E.mana(0)),'no body that fits beside Whispers'],
 ['whispersWorthCasting','o0',E.dropMine('Platysaur'),'two minions, not three: ending the turn is allowed'],
];

const run=(state,options)=>{const trace={};const a=constrainActions(state,options,{trace});
 const menu=a.length&&!state.choice?spendFirst(state,a,{admission:trace.admission,trace}):a;
 const took=new Set((trace.preferences??[]).flatMap(p=>p.removed.map(id=>p.rule+'|'+id)));
 return {menu:menu.map(x=>x.id),took:(rule,id)=>took.has(rule+'|'+id)};};

for(const [rule,X,edit,feature] of PAIRS)
 test(`contrast ${rule}: ${feature}`,()=>{
  const f=load(rule),pos=run(f.state,f.options);
  assert.ok(pos.took(rule,X),`${rule} takes ${X} on the positive (${f.source})`);
  assert.ok(!pos.menu.includes(X));
  const x=structuredClone(f);edit(x);
  assert.ok(x.options.some(o=>o.id===X),`${X} is still on the contrast's menu`);
  const con=run(x.state,x.options);
  assert.ok(!con.took(rule,X),`${rule} leaves ${X} on the contrast`);
  assert.ok(con.menu.includes(X),`${X} survives every other rule on the contrast`);
 });
