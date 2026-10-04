import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combinationAdmission} from '../src/combo-admission.mjs';
import {constrainActions,spendFirst} from '../src/policy.mjs';
import {prepare,resolve,rulePick} from '../src/choose.mjs';
import {menu} from '../src/plan.mjs';
import {fromState,apply,moves} from '../src/sim.mjs';
import {position,claws} from '../eval/silverfish-cases.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';

const buff={name:'Different named buff',CARDTYPE:'SPELL',COST:1,text:'Give your minions +1/+1.'};
const payload={name:'Different named payload',CARDTYPE:'SPELL',COST:2,text:'When you play or discard this, summon two random 1-Cost minions.'};
const coin={name:'The Coin',CARDTYPE:'SPELL',COST:0,text:'Gain 1 Mana Crystal this turn only.'};
const pipeline=c=>{const trace={},actions=constrainActions(c.state,c.actions,{trace});
 return {actions,trace,p:prepare(c.state,actions,{admission:trace.admission})};};

test('original game18 raw options: candidates, weapon prefix and conditional buff reach the live pipeline',()=>{
 const c=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game18-combo-input.json',import.meta.url)));
 const {actions,trace,p}=pipeline(c);
 assert.ok(c.actions.some(a=>a.entityId===48),'original Power options really offered the direct summon');
 assert.ok(actions.some(a=>a.entityId===48));
 const line=trace.admission.lines.find(l=>l.steps[0].id===59&&l.steps.at(-1).id===70);
 assert.ok(line);assert.equal(line.followup.manaAfterBuff,0);
 assert.equal(line.development.possibleAdded,2);assert.equal(line.steps.at(-1).exact,false);
 assert.ok(!line.steps.some(m=>m.id===57),'never queue buff through random summon');
 assert.equal(p.forced.action.entityId,59,'coexisting user-authorized weapon ruling');
 assert.ok(p.combinationEvidence.lines.some(l=>l.firstActionId===p.forced.action.id));
});

test('unnamed attack-discard payoff becomes a selectable whole intent, rather than a forced single-card setup',()=>{
 const c=position({mana:5,mine:[{name:'Body',ATK:2,HEALTH:3,EXHAUSTED:1}],hand:[claws,
  {...payload,text:'When you play or discard this, summon three random 1-Cost minions.'},buff]});
 const {p,trace,actions}=pipeline(c);
 assert.ok(!p.forced&&!p.lethal);
 const ids=Object.keys(p.plans).filter(id=>id.startsWith('combo'));
 assert.ok(ids.length>=2,'both direct summon and weapon-discard lines are offered');
 const weapon=ids.find(id=>p.plans[id][0].id===80);
 assert.ok(weapon);assert.equal(resolve(p,weapon).action.entityId,80);
 assert.equal(p.plans[weapon].at(-1).exact,false);
 assert.match(p.crit[weapon].description,/NOT queued/);
 assert.match(p.crit[weapon].description,/up to 3 additional/);
 assert.ok(!p.plans[weapon].some(m=>m.id===82));
 assert.ok(trace.evidence.lines.length);assert.ok(actions.some(a=>a.entityId===81));
 assert.ok(p.plans[rulePick(p)],'offline fallback can select a proved complete intent');
});

test('equipped weapon setup attack survives spend-first while unrelated attacks do not gain the exemption',()=>{
 const c=position({mana:1,mine:[{name:'Body',ATK:2,HEALTH:2}],hand:[payload,buff],weapon:claws});
 const admission=combinationAdmission(c.state,c.actions),spent=spendFirst(c.state,c.actions,{admission});
 assert.ok(admission.lines.some(l=>l.steps[0].kind==='attack'));
 assert.ok(spent.some(a=>a.entityId===1));
 const m=menu(c.state,c.actions,{}, {admission});
 const id=Object.keys(m.plans).find(k=>k.startsWith('combo')&&m.plans[k][0].id===1);
 assert.ok(id);assert.equal(m.plans[id].length,1);assert.equal(m.plans[id][0].exact,false);
 assert.ok(!m.plans[id].some(x=>x.id===81));
});

test('complete buff lines generalize across costs, empty boards, summons and available slots',()=>{
 let cases=0;
 for(const count of [1,2,3])for(let n=0;n<=6;n++)for(const cost of [1,2,3]){
  const summon={...payload,COST:cost,text:`When you play or discard this, summon ${count} random 1-Cost minions.`};
  const c=position({mana:cost+1,mine:Array.from({length:n},()=>({ATK:1,HEALTH:2,EXHAUSTED:1})),hand:[summon,buff]});
  const {p,trace}=pipeline(c),lines=trace.admission.lines.filter(l=>l.steps[0].id===80);
  assert.equal(lines.length>0,n+count<=7,`board=${n} summons=${count} cost=${cost}`);
  if(lines.length){
   assert.equal(lines[0].followup.manaAfterBuff,0);
   assert.ok(p.combinationEvidence.lines.some(l=>l.firstActionId==='c80'));
   assert.ok(Object.values(p.plans??{}).some(steps=>steps[0].id===80)||p.forced?.action.entityId===80);
  }
  c.state.me.mana=cost;
  assert.equal(combinationAdmission(c.state,c.actions).lines.length,0,'must reserve buff mana');cases++;
 }
 assert.equal(cases,63);
});

test('Coin can enable a future affordable body and buff; only the offered first step is executed',()=>{
 const c=position({mana:1,mine:[],hand:[coin,{name:'Plain body',CARDTYPE:'MINION',COST:2,ATK:2,HEALTH:3,text:''},{...buff,COST:0}]});
 const a=combinationAdmission(c.state,c.actions),l=a.lines.find(l=>l.steps[0].id===80&&l.steps.some(m=>m.id===81));
 assert.ok(l);assert.equal(l.followup.manaAfterBuff,0);
 assert.ok(!c.actions.some(x=>x.entityId===81),'future body was not initially offered');
 assert.equal(l.steps.at(-1).id,82);assert.ok(l.steps.every(m=>m.exact));
 const {p}=pipeline(c);assert.ok(Object.values(p.plans).some(steps=>steps[0].id===80));
 const after=apply(fromState(c.state,c.actions),l.steps[0]);
 assert.ok(moves(after.s).some(m=>m.id===81));
});

test('ties, unsafe attacks, frozen heroes, secrets, engine triggers and clipped summons do not get weapon proofs',()=>{
 const make=()=>position({mana:1,hand:[payload,buff],weapon:claws});
 const changes=[
  c=>c.state.me.hand.push({...payload,entityId:999,name:'Highest-cost tie'}),
  c=>c.state.me.board[0].FROZEN=1,
  c=>c.state.me.board[0].EXHAUSTED=1,
  c=>c.state.me.board[0].NUM_ATTACKS_THIS_TURN=1,
  c=>c.state.opponent.secretCount=1,
  c=>c.state.me.board.push({entityId:999,CARDTYPE:'MINION',ATK:1,HEALTH:2,text:'After you summon a minion, deal 1 damage to a random enemy.'}),
  c=>{while(c.state.me.board.filter(x=>x.CARDTYPE==='MINION').length<6)c.state.me.board.push({entityId:900+c.state.me.board.length,CARDTYPE:'MINION',ATK:1,HEALTH:2});},
 ];
 for(const change of changes){const c=make();change(c);assert.ok(!combinationAdmission(c.state,c.actions).lines.some(l=>l.development.via==='discard'));}
 const c=position({mana:1,myHp:5,enemy:[{ATK:7,HEALTH:4,TAUNT:1}],hand:[payload,buff],weapon:claws});
 assert.equal(combinationAdmission(c.state,c.actions).lines.length,0);
 const x=position({mana:1,myHp:12,enemy:[{ATK:7,HEALTH:4,TAUNT:1,DIVINE_SHIELD:1},{ATK:3,HEALTH:3}],hand:[payload,buff],weapon:claws});
 assert.equal(combinationAdmission(x.state,x.actions).lines.length,0,'a nonfatal swing must not leave visible board lethal relying on unknown Taunts');
});

test('unknown bodies have count bounds, never fabricated statlines, and every inexact prefix stops',()=>{
 const c=position({mana:5,mine:[{ATK:2,HEALTH:3}],hand:[claws,payload,buff]}),original=JSON.stringify(c);
 const a=combinationAdmission(c.state,c.actions);
 for(const l of a.lines){
  assert.ok(!l.s.me.some(b=>b.id<0));
  assert.equal(l.steps.findIndex(x=>!x.exact),l.steps.length-1);
  assert.ok(l.followup.observeBeforeBuff);
 }
 assert.equal(JSON.stringify(c),original);
 const x=combinationAdmission(c.state,c.actions,{maxNodes:1}),y=combinationAdmission(c.state,c.actions,{maxNodes:1});
 assert.equal(x.stats.generated,1);assert.equal(x.stats.nodeLimit,true);assert.deepEqual(x,y);
});

test('fatal direct development and an absent legal first option are never admitted',()=>{
 const c=position({mana:2,myHp:3,hand:[{name:'Unsafe body',CARDTYPE:'MINION',COST:1,ATK:1,HEALTH:1,text:'Battlecry: Summon a 1/1 Helper. Deal 3 damage to your hero.'},buff]});
 assert.equal(combinationAdmission(c.state,c.actions).lines.length,0);
 const x=position({mana:3,hand:[payload,buff]});x.actions=x.actions.filter(a=>a.entityId!==80);
 assert.equal(combinationAdmission(x.state,x.actions).lines.length,0);
});

test('new version is distinct; requesting class-prior replays frozen pre-change policy and simulator',async()=>{
 const old=await loadDecisionEngine('silverfish-v1-class-prior-v1'),current=await loadDecisionEngine();
 assert.equal(current.version,'silverfish-v1-rule-release-v1');
 assert.notEqual(current.prepare,old.prepare);assert.notEqual(current.constrainActions,old.constrainActions);
 const c=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/new50-game18-combo-input.json',import.meta.url)));
 assert.ok(!old.constrainActions(c.state,c.actions).some(a=>a.entityId===48));
 assert.ok(current.constrainActions(c.state,c.actions).some(a=>a.entityId===48));
});

test('confirmed draw-first ruling retains information before an affordable development+buff line',()=>{
 const c=JSON.parse(readFileSync(new URL('../eval/positions.json',import.meta.url))).find(c=>c.id==='g1t13r530');
 const actions=c.options.map(({description,label,...a})=>a),p=prepare(c.state,actions);
 assert.ok(p.plans.combo1&&p.plans.p1,'draw and the complete setup are both visible');
 assert.equal(resolve(p,rulePick(p)).action.entityId,67,'user-ruled Life Tap before committing setup');
});
