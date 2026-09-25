import test from 'node:test';
import assert from 'node:assert/strict';
import {search,menu,actionFor} from '../src/plan.mjs';
import {fromState,apply,signature} from '../src/sim.mjs';

// A board in publicState shape plus the options the game would print for it.
function board({mine=[],theirs=[],hand=[],mana=0,heroHp=30,myHp=30}){
  const me=[{entityId:1,CARDTYPE:'HERO',name:'Gul\'dan',HEALTH:myHp,ATK:0},...mine.map((m,i)=>({entityId:10+i,CARDTYPE:'MINION',ZONE_POSITION:i+1,...m}))];
  const opp=[{entityId:2,CARDTYPE:'HERO',name:'Thrall',HEALTH:heroHp},...theirs.map((m,i)=>({entityId:50+i,CARDTYPE:'MINION',ZONE_POSITION:i+1,...m}))];
  const cards=hand.map((c,i)=>({entityId:80+i,ZONE_POSITION:i+1,...c}));
  const state={turn:9,me:{current:true,mana,hand:cards,board:me},opponent:{board:opp}};
  const taunt=opp.some(c=>c.TAUNT);
  const actions=[{id:'o0',type:'END_TURN'}];let o=1;
  for(const a of me.filter(c=>c.CARDTYPE==='MINION'&&(c.ATK??0)>0&&!c.EXHAUSTED)){
    opp.filter(t=>!taunt||t.TAUNT).forEach((t,i)=>actions.push({id:`o${o}t${i}`,type:'POWER',entityId:a.entityId,targetId:t.entityId}));o++;
  }
  for(const c of cards)if((c.COST??0)<=mana)actions.push({id:`o${o++}`,type:'POWER',entityId:c.entityId});
  return {state,actions};
}
const hpAfter=(start,plan)=>plan.steps.reduce((s,m)=>apply(s,m).s,start).opp.find(b=>b.type==='HERO').hp;

test('lethal behind a Taunt: break it, then go face',()=>{
  // 5+4+3+3 = 15 against 12 Health, but a 3/3 Taunt stands in front. The game offers no face
  // attack at all, so lethal.mjs cannot see this; only a sequence does.
  const {state,actions}=board({heroHp:12,
    mine:[{name:'A',ATK:5,HEALTH:5},{name:'B',ATK:4,HEALTH:4},{name:'C',ATK:3,HEALTH:3},{name:'D',ATK:3,HEALTH:3}],
    theirs:[{name:'Wall',ATK:1,HEALTH:3,TAUNT:1}]});
  const {start,plans}=search(state,actions);
  const best=plans[0];
  assert.ok(hpAfter(start,best)<=0,'the best plan kills');
  assert.equal(best.steps[0].targetId,50,'the Taunt goes first');
  assert.ok(best.steps.every(s=>s.exact));
});

test('Divine Shield eats the first hit',()=>{
  const {state,actions}=board({mine:[{name:'A',ATK:5,HEALTH:5}],theirs:[{name:'Squire',ATK:1,HEALTH:1,DIVINE_SHIELD:1}]});
  const s=fromState(state,actions);
  const r=apply(s,{kind:'attack',id:10,targetId:50});
  const t=r.s.opp.find(b=>b.id===50);
  assert.equal(t.hp,1);assert.equal(t.ds,false);
  assert.equal(r.s.me.find(b=>b.id===10).hp,4);
});

test('a Deathrattle on a death ends the plan: the board after it is not predictable',()=>{
  const {state,actions}=board({mine:[{name:'A',ATK:5,HEALTH:5},{name:'B',ATK:2,HEALTH:2}],
    theirs:[{name:'Egg',ATK:0,HEALTH:2,text:'<b>Deathrattle:</b> Summon two 2/1 Spiders.'}]});
  const {plans}=search(state,actions);
  for(const p of plans){
    const i=p.steps.findIndex(s=>!s.exact);
    if(i>=0)assert.equal(i,p.steps.length-1,'nothing is planned past an inexact step');
  }
  assert.ok(plans.some(p=>p.steps.at(-1).targetId===50&&!p.steps.at(-1).exact));
});

test('buff first, then swing: the order the per-option scorer could not see',()=>{
  const {state,actions}=board({heroHp:4,mana:1,
    mine:[{name:'A',ATK:1,HEALTH:1},{name:'B',ATK:1,HEALTH:1}],
    hand:[{name:'Entropic Continuity',CARDTYPE:'SPELL',COST:1,text:'[x]Give your minions +1/+1. Shuffle 2 Shreds of Time into your deck.'}]});
  const {start,plans}=search(state,actions);
  assert.ok(hpAfter(start,plans[0])<=0);
  assert.equal(plans[0].steps[0].kind,'play');
});

test('Whispers: the buff lands and the cheapest card goes',()=>{
  const {state,actions}=board({mana:3,mine:[{name:'A',ATK:1,HEALTH:1}],
    hand:[{name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'},
          {name:'Big',CARDTYPE:'SPELL',COST:5,text:'Draw a card.'},{name:'Small',CARDTYPE:'SPELL',COST:2,text:'Draw a card.'}]});
  const s=fromState(state,actions);
  const r=apply(s,{kind:'play',id:80});
  assert.deepEqual(r.s.hand.map(c=>c.name),['Big']);
  assert.equal(r.s.me.find(b=>b.id===10).atk,2);
  assert.equal(r.exact,true);
});

test('menu: attack options become plans, everything else stays',()=>{
  const {state,actions}=board({mana:2,mine:[{name:'A',ATK:3,HEALTH:3}],theirs:[{name:'X',ATK:2,HEALTH:2}],
    hand:[{name:'Occultist',CARDTYPE:'MINION',COST:2,text:'<b>Taunt</b> <b>Battlecry:</b> Choose a card in your hand to discard.'}]});
  const base=Object.fromEntries(actions.map(a=>[a.id,{...a,description:a.id}]));
  const m=menu(state,actions,base);
  const ids=Object.keys(m.criteria);
  assert.ok(ids.includes('o0')&&ids.includes('o2'),'end turn and the card stay');
  assert.ok(!ids.some(id=>/^o1t/.test(id)),'raw attacks are gone');
  assert.ok(ids.some(id=>id.startsWith('p')));
  const step=m.plans.p1[0];
  assert.equal(actionFor(actions,step).entityId,step.id);
  assert.match(m.criteria.p1.description,/Result: enemy hero/);
});

test('the prediction matches a board that did what was planned',()=>{
  const {state,actions}=board({mine:[{name:'A',ATK:3,HEALTH:3}],theirs:[{name:'X',ATK:2,HEALTH:2}]});
  const {plans}=search(state,actions);
  const kill=plans.find(p=>p.steps[0].targetId===50);
  // What Power.log would show afterwards: X gone, A damaged.
  const real=structuredClone(state);
  real.opponent.board=real.opponent.board.filter(c=>c.entityId!==50);
  real.me.board.find(c=>c.entityId===10).DAMAGE=2;
  assert.equal(signature(fromState(real,[])),kill.steps[0].after);
});

test('Party Fiend first, then the buff lands on all five bodies',()=>{
  // Live 2026-09-24: Continuity went first and the Fiend's three bodies missed it.
  const {state,actions}=board({mana:2,
    mine:[{name:'Felbeast',ATK:1,HEALTH:1},{name:'Party Fiend',ATK:1,HEALTH:1}],
    theirs:[{name:'Annoy-o-Tron',ATK:1,HEALTH:2,TAUNT:1,DIVINE_SHIELD:1}],
    hand:[{name:'Entropic Continuity',CARDTYPE:'SPELL',COST:1,text:'[x]Give your minions +1/+1. Shuffle 2 Shreds of Time into your deck.'},
          {name:'Party Fiend',CARDTYPE:'MINION',COST:1,ATK:1,HEALTH:1,text:'<b>Battlecry:</b> Summon two 1/1 Felbeasts. Deal 3 damage to your hero.'}]});
  const s=fromState(state,actions);
  const r=apply(s,{kind:'play',id:81});
  assert.equal(r.exact,true);
  assert.equal(r.s.me.filter(b=>b.type==='MINION').length,5);
  assert.equal(r.s.me.find(b=>b.type==='HERO').hp,27);
  const {plans}=search(state,actions);
  const i=plans[0].steps.findIndex(m=>m.id===81),j=plans[0].steps.findIndex(m=>m.id===80);
  assert.ok(i>=0&&j>i,'the Fiend is played before the buff');
});

test('summons for the opponent or per-something stay unmodelled',async()=>{
  const {cardModel}=await import('../src/sim.mjs');
  const m=t=>cardModel({type:'MINION',text:t});
  assert.equal(m('Battlecry: Summon three 1/1 Huntresses for your opponent.'),null);
  assert.equal(m('Battlecry: Summon a 2/2 Gryphon for each player.'),null);
  assert.deepEqual(m('Battlecry: Summon two 1/2 Mechs with Taunt and Divine Shield.').summon,{n:2,atk:1,hp:2,with:'taunt and divine shield'});
});

test('a buff that discards a draw-only payoff still plans the swings after it',()=>{
  // Live 2026-09-24: Whispers would discard Hand of Gul'dan, so it could only be a last step and
  // the minions attacked unbuffed.
  const {state,actions}=board({mana:5,
    mine:[{name:'A',ATK:2,HEALTH:5},{name:'B',ATK:1,HEALTH:3}],
    hand:[{name:'Wicked Whispers',CARDTYPE:'SPELL',COST:1,text:'Discard your lowest Cost card. Give your minions +1/+1.'},
          {name:"Hand of Gul'dan",CARDTYPE:'SPELL',COST:6,text:'When you play\nor discard this,\ndraw 3 cards.'}]});
  const {plans}=search(state,actions);
  assert.equal(plans[0].steps[0].kind,'play');
  assert.ok(plans[0].steps.slice(1).some(m=>m.kind==='attack'));
});

test('a buff plan names the minions it would miss',async()=>{
  const {narrate}=await import('../src/plan.mjs');
  const {state,actions}=board({mana:3,mine:[{name:'A',ATK:1,HEALTH:1}],
    hand:[{name:'Entropic Continuity',CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'},
          {name:'Odd Minion',CARDTYPE:'MINION',COST:2,ATK:2,HEALTH:2,text:'Battlecry: Draw a card.'}]});
  const {start,plans}=search(state,actions);
  const p=plans.find(p=>p.steps[0].id===80);
  assert.match(narrate(start,p),/still affordable before it: Odd Minion \(2\)/);
});

test('the hero never swings into a minion that kills it',()=>{
  // 5 Health, 4 Attack into a 7/4 Void Terror: the trade looked fine and ended the game.
  const {state,actions}=board({myHp:5,theirs:[{name:'Void Terror',ATK:7,HEALTH:4}]});
  Object.assign(state.me.board[0],{ATK:4});
  actions.push({id:'o9t0',type:'POWER',entityId:1,targetId:50});
  const {plans}=search(state,actions);
  assert.ok(plans.every(p=>p.steps.every(s=>s.id!==1)),'no plan attacks with the hero');
});

test('Deathrattle text a card gives away is not its own',()=>{
  // 2026-09-25: Braingill's Battlecry hands Murlocs "Deathrattle: Draw a card."; killing it ended every plan.
  const {state,actions}=board({mine:[{name:'A',ATK:3,HEALTH:3}],
    theirs:[{name:'Braingill',ATK:2,HEALTH:1,text:'<b>Battlecry:</b> Give your other Murlocs "<b>Deathrattle:</b> Draw a card."'}]});
  const {start,plans}=search(state,actions);
  const kill=plans.find(p=>p.steps[0].targetId===50);
  assert.equal(apply(start,kill.steps[0]).exact,true);
});

test('healthy, the weapon takes the big hit and the minion the small one',()=>{
  // 2026-09-25: 25 Health and Chronoclaws, yet the 3/6 Taunt traded into the 3/2 and dropped to 3/3.
  const {state,actions}=board({myHp:25,mine:[{name:'Occultist',ATK:3,HEALTH:6}],
    theirs:[{name:'Puddlestomper',ATK:3,HEALTH:2},{name:'Minnow',ATK:1,HEALTH:1}],
    hand:[{name:'Cheap',COST:1,text:''},{name:'Dear',COST:2,text:''}],mana:0});
  Object.assign(state.me.board[0],{ATK:4});
  state.me.board.push({entityId:5,CARDTYPE:'WEAPON',name:'Chronoclaws',text:'After your hero attacks, discard your highest Cost card.'});
  actions.push({id:'o9t0',type:'POWER',entityId:1,targetId:50},{id:'o9t1',type:'POWER',entityId:1,targetId:51});
  const {start,plans}=search(state,actions);
  const best=plans[0];
  assert.ok(best.steps.some(s=>s.id===1&&s.targetId===50),'the hero hits the 3-Attack minion');
  const swing=best.steps.find(s=>s.id===1);
  assert.equal(swing.exact,true,'a known discard does not end the plan');
  assert.deepEqual(best.steps.reduce((s,m)=>apply(s,m).s,start).hand.map(c=>c.name),['Cheap']);
});

// User ruling (2026-09-26, game 13, turn 4): Platysaur 2/2 chipped a Risen Footman 1/3 that Walking
// Dead 3/3 then killed alone; Platysaur's swing was wasted.
test('no swing is spent chipping a minion that a later attacker kills alone',()=>{
  const {state,actions}=board({
    mine:[{name:'Platysaur',ATK:2,HEALTH:2},{name:'Walking Dead',ATK:3,HEALTH:3,TAUNT:1}],
    theirs:[{name:'Risen Footman',ATK:1,HEALTH:3,TAUNT:1},{name:'Necromancer',ATK:2,HEALTH:2}]});
  const {plans}=search(state,actions);
  const chips=p=>p.steps.some((m,i)=>m.id===10&&m.targetId===50&&p.steps.slice(i+1).some(n=>n.id===11&&n.targetId===50));
  assert.ok(plans.length);
  assert.ok(!plans.some(chips));
});
