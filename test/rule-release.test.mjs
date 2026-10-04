import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../src/policy.mjs';
import {search} from '../src/plan.mjs';
import {fromState,moves,apply,drawMinionModel} from '../src/sim.mjs';
import {loadDecisionEngine} from '../src/planner-version.mjs';
const load=(dir,n)=>JSON.parse(readFileSync(new URL(`./fixtures/${dir}/${n}.json`,import.meta.url),'utf8'));
const egg=()=>load('rule-release','g0925-runic-egg-before-claws');      // decisions.jsonl 2026-09-25T16:58:10Z
const fiend=()=>load('rule-release','g0929-continuity-before-fiend');   // decisions.jsonl 2026-09-29T19:04:05Z
const run=(P,{state,options})=>{const trace={};const a=P.constrainActions(state,options,{trace});
 const b=a.length?P.spendFirst(state,a,{admission:trace.admission,trace}):a;return {ids:b.map(x=>x.id),releases:trace.ruleReleases??[]};};
const now={constrainActions,spendFirst};

test('a battlecry-draw minion is modelled; anything else in its text is not',()=>{
 const m=(text)=>drawMinionModel({type:'MINION',text});
 assert.deepEqual(m('Battlecry: Draw a card. Deathrattle: Discard it.'),{kind:'minion',draw:1});
 assert.deepEqual(m('Taunt. Battlecry: Draw two cards.'),{kind:'minion',draw:2});
 assert.equal(m('Battlecry: Deal 2 damage.'),null);
 assert.equal(m('Battlecry: Draw a card. Summon a 1/1.'),null);
 assert.equal(drawMinionModel({type:'SPELL',text:'Battlecry: Draw a card.'}),null);
});

test('game 4 turn 4: the release search plays past Platysaur, and the ruling still stands',()=>{
 const g=load('user-rulings','g4-body-before-buff');
 const lead=p=>p.steps[0].id===39;
 assert.ok(!search(g.state,g.options).plans.some(p=>lead(p)&&p.steps.length>1),'the menu search still stops at the draw');
 const past=search(g.state,g.options,{pastAdditive:true}).plans.find(lead);
 assert.deepEqual(past.steps.map(s=>[s.id,s.exact]),[[39,false],[47,true]],'Platysaur, then Entropic Continuity');
 const {ids,releases}=run(now,{state:g.state,options:[...g.options,{id:'o0',type:'END_TURN'}]});
 assert.deepEqual(releases,[]);assert.ok(ids.includes('o2')&&!ids.includes('o1'),'Platysaur first, the buff waits');
});

test('a discard after an unknown draw no longer pretends to know the card',()=>{
 const {state,options}=egg(),s=fromState(state,options),swing=moves(s).find(m=>m.kind==='attack'&&m.id===66);
 assert.equal(apply(s,swing).exact,true,'Chronoclaws on a known hand: Reliquary Prime goes');
 s.drawnUnknown=1;const r=apply(s,swing);
 assert.equal(r.exact,false);assert.deepEqual(r.s.uncertainDiscard,[{unknown:true}]);
});

test('weaponFirst gives way when the swing would discard Reliquary Prime (2026-09-25)',()=>{
 const r=run(now,egg());
 assert.deepEqual(r.releases.map(x=>[x.rule,x.actionId]),[['weaponFirst','o2t1']]);
 assert.ok(r.ids.includes('o2t1'),'Runic Egg may trade into Necrotic Mortician first');
 assert.ok(r.releases[0].score>r.releases[0].rivalScore);
});

test('weaponFirst holds when the swing costs nothing or its discard ends the plan',()=>{
 const empty=egg();empty.state.me.hand=[];
 const barrage=egg();barrage.state.me.hand=barrage.state.me.hand.filter(c=>c.name!=='Reliquary Prime');
 for(const c of [empty,barrage]){const r=run(now,c);assert.deepEqual(r.releases,[]);assert.ok(!r.ids.includes('o2t1'));}
});

test('bodyBeforeBuff gives way when Party Fiend\'s 3 self-damage loses to their board (2026-09-29)',()=>{
 const r=run(now,fiend());
 assert.deepEqual(r.releases.map(x=>[x.rule,x.actionId]),[['bodyBeforeBuff','o2']]);
 assert.deepEqual(r.ids,['o1','o2']);
 assert.ok(r.releases[0].rivalScore<-30&&r.releases[0].score>0,'Fiend first is lethal; the buff and a trade survive');
 const healthy=fiend();healthy.state.me.board.find(c=>c.CARDTYPE==='HERO').DAMAGE=0;
 const h=run(now,healthy);assert.deepEqual(h.releases,[]);assert.deepEqual(h.ids,['o1'],'at 30 Health the body still goes first');
});

test('fodder-hold engine is frozen; current version adds the rule releases',async()=>{
 const previous=await loadDecisionEngine('silverfish-v1-fodder-hold-v1'),current=await loadDecisionEngine();
 assert.equal(current.version,'silverfish-v1-veto-audit-v1');assert.notEqual(previous.constrainActions,current.constrainActions);
 assert.deepEqual(run(previous,fiend()).ids,['o1']);
 assert.ok(!run(previous,egg()).ids.includes('o2t1'));
 assert.deepEqual(run(current,fiend()).ids,['o1','o2']);
});
