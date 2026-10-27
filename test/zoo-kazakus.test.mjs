import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cardDb,loadList,rawCard} from '../src/selfplay.mjs';
import {parsePower} from '../src/power.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {assertEncoded,shadowView,trialTimers} from '../src/selfplay-shadow.mjs';

// The 13:40 game of 2026-10-25 (Power.log of the first live zoo-v4 game): Godfather Kazakus is played, picks Spurious
// Shiv (CAP_405t5), then Conviction (CAP_405t2), then the Unending Trial (offered as CAP_405tb3b, in hand as CAP_405tb3);
// the trial is played on turn 7 and has counted one of its owner's turn starts at turn 9. The fixture holds only the lines
// of the choices, the trial's entity and the turn counter.
const cards=cardDb(),list=loadList('warlock-zoo'),net=loadNet(new URL('../models/selfplay/warlock-zoo-v4.json',import.meta.url));
const LOG=readFileSync(new URL('./fixtures/kazakus-power.log',import.meta.url),'utf8').split('\n');
const upto=re=>parsePower(LOG.slice(0,LOG.findIndex(l=>re.test(l))+1).join('\n'));
const after=id=>upto(new RegExp('EntitiesChosen.*cardId='+id+' '));
const parsedAfter=re=>upto(re);

const offered=ids=>ids.map(([entityId,cardId])=>({entityId,cardId,name:cardId,CARDTYPE:'SPELL'}));
function stateOf({parsed,turn=9,hand=[],choice=null}){
  const hero=rawCard(cards.HERO_07,1),oppHero=rawCard(cards.HERO_07,2);
  const state={gameNumber:1,status:'RUNNING',step:'MAIN_ACTION',turn,
    me:{playerId:1,current:true,mana:4,maxMana:7,fatigue:0,handCount:hand.length,deckCount:20,hand,board:[{...hero,HEALTH:30}],heroClass:'WARLOCK'},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:[{...oppHero,HEALTH:30}],heroClass:'WARLOCK'}};
  if(choice)state.choice={type:'GENERAL',entities:choice};
  const actions=choice?choice.map((c,i)=>({id:`c${i}`,type:'CHOICE',entityId:c.entityId})):[{id:'end',type:'END_TURN',option:0}];
  return {parsed,state,actions};
}
const view=f=>shadowView(f.parsed,f.state,f.actions,{cards,list});
const trialCard=()=>({...rawCard(cards.CAP_405tb3??{CARDTYPE:'SPELL',name:'Unending Trial',COST:0},108),entityId:108,cardId:'CAP_405tb3',CARDTYPE:'SPELL'});

test('the Kazakus picks are read off the chosen entities, one run per player, cleared by the trial',()=>{
  assert.deepEqual([...upto(/id=3 Player=.*EntitiesCount/).kazRuns],[]);
  assert.deepEqual([...after('CAP_405t5').kazRuns].filter(([,r])=>r.length),[[1,['CAP_405t5']]]);
  assert.deepEqual([...after('CAP_405t2').kazRuns],[[1,['CAP_405t5','CAP_405t2']]]);
  assert.deepEqual([...after('CAP_405tb3b').kazRuns],[[1,[]]]);
});

test('second pick: the first effect is in s.kaz; third pick: both',()=>{
  const second=stateOf({parsed:after('CAP_405t5'),choice:offered([[102,'CAP_405t6'],[103,'CAP_405t3'],[104,'CAP_405t2']])});
  let v=view(second);
  assert.equal(v.s.choice.kind,'kaz2');
  assert.equal(v.s.kaz.first,'CAP_405t5');
  assert.equal(v.s.kaz.second,undefined);
  assert.ok(!v.notes.includes('kazakus picks not reconstructed'));
  const third=stateOf({parsed:after('CAP_405t2'),choice:offered([[105,'CAP_405tb3b'],[106,'CAP_405tb2b'],[107,'CAP_405tb1b']])});
  v=view(third);
  assert.equal(v.s.choice.kind,'kaz3');
  assert.deepEqual(v.s.kaz,{first:'CAP_405t5',second:'CAP_405t2'});
  assert.ok(!v.notes.includes('kazakus picks not reconstructed'));
});

test('the first pick has no run yet; a third pick with no record keeps the note',()=>{
  const first=stateOf({parsed:upto(/id=3 Player=.*EntitiesCount/),choice:offered([[99,'CAP_405t1'],[100,'CAP_405t3'],[101,'CAP_405t5']])});
  const v=view(first);
  assert.equal(v.s.choice.kind,'kaz1');
  assert.ok(!v.s.kaz&&!v.notes.includes('kazakus picks not reconstructed'));
  const blind=stateOf({parsed:{...upto(/id=3 Player=.*EntitiesCount/),kazRuns:new Map()},choice:offered([[105,'CAP_405tb3b'],[106,'CAP_405tb2b'],[107,'CAP_405tb1b']])});
  assert.ok(view(blind).notes.includes('kazakus picks not reconstructed'));
});

test('the trial card in hand carries its length and both effects',()=>{
  const parsed=upto(/Entity=108 tag=ZONE value=HAND/);
  parsed.entities.get(108).tags.ZONE='HAND';
  const v=view(stateOf({parsed,turn:7,hand:[trialCard()]}));
  const c=v.s.hand.find(c=>c.id===108);
  assert.deepEqual(c.trial,{turns:4,effects:['CAP_405t5','CAP_405t2']});
  assertEncoded(v,net);
  assert.deepEqual(v.s.timers,[]);
  assert.ok(!v.notes.includes('kazakus picks not reconstructed'));
});

test('a trial card whose picks were never seen keeps the note',()=>{
  const parsed=upto(/Entity=108 tag=ZONE value=HAND/);
  parsed.entities.get(108).tags.ZONE='HAND';delete parsed.entities.get(108).trialEffects;
  const v=view(stateOf({parsed,turn:7,hand:[trialCard()]}));
  assert.equal(v.s.hand.find(c=>c.id===108).trial,undefined);
  assert.ok(v.notes.includes('kazakus picks not reconstructed'));
});

test('a played trial is a timer with what is left of its length',()=>{
  const parsed=parsedAfter(/QUEST_PROGRESS value=1/);
  assert.equal(parsed.entities.get(108).tags.ZONE,'SECRET');
  const v=view(stateOf({parsed,turn:9}));
  assert.deepEqual(v.s.timers,[{left:3,effect:'trial',effects:['CAP_405t5','CAP_405t2'],unknown:false}]);
  assert.deepEqual(v.s.them.timers,[]);
  assertEncoded(v,net);
  assert.ok(!v.notes.includes('kazakus picks not reconstructed'));
  // The same clock, counted from the turn it was played (turn 7) when the log has no QUEST_PROGRESS.
  delete parsed.entities.get(108).tags.QUEST_PROGRESS;
  assert.equal(trialTimers(parsed,1,9)[0].left,3);
  assert.equal(trialTimers(parsed,1,10)[0].left,3);
  assert.equal(trialTimers(parsed,1,11)[0].left,2);
  assert.deepEqual(trialTimers(parsed,1,15),[]);                       // it fired at the start of turn 15
  assert.deepEqual(trialTimers(parsed,2,9),[]);                        // the other chair has none
});

test('a played trial of unknown effects still gives its clock and the note',()=>{
  const parsed=parsedAfter(/QUEST_PROGRESS value=1/);
  delete parsed.entities.get(108).trialEffects;
  const v=view(stateOf({parsed,turn:9}));
  assert.equal(v.s.timers[0].left,3);
  assert.deepEqual(v.s.timers[0].effects,[]);
  assert.ok(v.notes.includes('kazakus picks not reconstructed'));
});
