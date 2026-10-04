import test from 'node:test';
import assert from 'node:assert/strict';
import {matchupObjective,resourceDrawWindow,resourceToolAssessments} from '../src/matchup-objective.mjs';
import {prepare,rulePick,resolve} from '../src/choose.mjs';
import {constrainActions} from '../src/policy.mjs';
import {search} from '../src/plan.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
import {state,options,card,coin,buff,dead,aco} from './fixtures/opening-burst-cases.mjs';
import {control,board,visible,combatState,combatOptions,refillState,pairedCases} from './fixtures/matchup-objective-cases.mjs';

test('public combined control evidence and early board pressure select different objectives',()=>{
 assert.equal(matchupObjective(control(combatState())).mode,'pressure_window');
 assert.equal(matchupObjective(board(combatState())).mode,'board_resource');
 const s=combatState();s.opponent.publicPlays=[visible('The Demon Seed',70,2)];
 assert.equal(matchupObjective(s).mode,'pressure_window');assert.equal(matchupObjective(s).deadlineTurn,null);
});

test('class, forty Health, empty turns, future records and historical annotations cannot supply a matchup',()=>{
 const s=combatState();s.opponent.initialHealth=40;s.opponent.heroClass='PRIEST';
 s.historyMatchup='control';s.classification={matchup:'control'};
 assert.equal(matchupObjective(s).mode,'unknown');
 s.opponent.publicPlays=[visible('Defile',70,40),{...visible('The Demon Seed',71,2),public:false}];
 assert.equal(matchupObjective(s).mode,'unknown');
 s.opponent.publicPlays=[visible('Ocular Occultist',72,6),visible('Defile',73,4)];
 assert.equal(matchupObjective(s).mode,'unknown','ambiguous forty-Health early tempo with AOE is not forced into control');
 s.opponent.publicPlays.push(visible('Mind Vision',74,2));
 assert.equal(matchupObjective(s).mode,'pressure_window','public copying plus AOE follows user copying-priest ruling');
 s.me.heroClass='DEMONHUNTER';assert.equal(matchupObjective(s).mode,'unknown');
});

for(const c of pairedCases())test(c.id,()=>{
 const p=prepare(c.state,constrainActions(c.state,c.options));
 if(c.expected){const a=(p.forced??p.lethal)?.action??resolve(p,rulePick(p)).action;assert.ok(c.expected.includes(a.id));}
 const available=(p.forced??p.lethal)?[(p.forced??p.lethal).action.id]:p.acts.map(a=>a.id);
 if(c.requireAvailable)assert.ok(c.requireAvailable.every(id=>available.includes(id)));
 if(c.forbidAvailable)assert.ok(c.forbidAvailable.every(id=>!available.includes(id)));
});

test('identical combat arithmetic ranks face in pressure mode and favorable exchange in resource mode',()=>{
 const a=search(control(combatState()),combatOptions),b=search(board(combatState()),combatOptions);
 assert.equal(a.plans[0].steps[0].targetId,999);assert.equal(b.plans[0].steps[0].targetId,110);
 assert.equal(a.plans[0].s.faceDealt,3);
 assert.ok(!b.plans[0].s.opp.some(c=>c.id===110));
 assert.equal(b.plans[0].s.me.find(c=>c.id===100).hp,3);
});

test('resource refill permission closes with low Health, weak board, many cards or depleted deck',()=>{
 const s=board(refillState());assert.equal(resourceDrawWindow(s),true);
 for(const change of [
  c=>c.me.board[0].HEALTH=3,
  c=>c.opponent.board.find(x=>x.entityId===110).ATK=20,
  c=>c.me.hand.push(coin,dead,aco,card('Soulfire',45)),
  c=>c.me.deckCount=1,
 ]){
  const c=structuredClone(s);change(c);assert.equal(resourceDrawWindow(c),false);
 }
 const fatal=structuredClone(s);fatal.me.drawHazards=[30];fatal.me.deckCount=1;
 assert.ok(!constrainActions(fatal,options(fatal)).some(a=>a.id==='tap'));
});

test('lethal retains priority even when the resource mode makes refill available',()=>{
 const s=board(refillState());s.opponent.board=s.opponent.board.filter(c=>c.CARDTYPE==='HERO');
 s.opponent.board[0].HEALTH=6;
 s.me.board.filter(c=>c.CARDTYPE==='MINION').forEach(c=>c.EXHAUSTED=0);
 const attacks=s.me.board.filter(c=>c.CARDTYPE==='MINION').map(c=>({id:`face${c.entityId}`,type:'POWER',entityId:c.entityId,targetId:999}));
 const p=prepare(s,constrainActions(s,[...options(s),...attacks]));
 assert.ok(p.lethal||p.forced?.source==='forced_lethal');
});

test('Chamber requires a real offered summoning discard and Duke uses actual tags, slots and Rush',()=>{
 const chamber=card('Chamber of Viscidus',20),duke={...card('Duke of Below',21),ATK:8,HEALTH:8};
 const s=board(state(4,4,[chamber,duke,dead,aco]));s.turn=8;
 const tools=resourceToolAssessments(s);
 assert.deepEqual(tools.chamber.possiblePayoffs.map(x=>x.entityId),[dead.entityId,aco.entityId]);
 assert.deepEqual(tools.chamber.offeredPayoffs,[],'not every hand card is a guaranteed location offer');
 s.choice={source:chamber,entities:[duke,dead,buff]};
 assert.deepEqual(resourceToolAssessments(s).chamber.offeredPayoffs,[dead.entityId]);
 delete s.choice;
 assert.equal(tools.duke.attack,8);assert.equal(tools.duke.health,8);assert.equal(tools.duke.boardRoom,6);
 s.opponent.board.push({entityId:110,CARDTYPE:'MINION',ATK:5,HEALTH:5});
 const p=search(s,options(s));
 const dukeLine=p.plans.find(p=>p.steps[0]?.id===duke.entityId&&p.steps.some(m=>m.kind==='attack'&&m.id===duke.entityId));
 assert.ok(dukeLine);assert.ok(dukeLine.steps.filter(m=>m.kind==='attack'&&m.id===duke.entityId).every(m=>m.targetId!==999));
});

test('previous version loads its own policy; new default labels matchup objective distinctly',async()=>{
 const current=await loadDecisionEngine(),old=await loadDecisionEngine('silverfish-v1-opening-burst-v1');
 assert.equal(current.version,'silverfish-v1-weapon-replacement-v1');
 const s=board(refillState()),acts=options(s);
 assert.ok(current.constrainActions(s,acts).some(a=>a.id==='tap'));
 assert.ok(!old.constrainActions(s,acts).some(a=>a.id==='tap'));
});
