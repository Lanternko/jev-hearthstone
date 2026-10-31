import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cardDb,loadList,rawCard} from '../src/selfplay.mjs';
import {apply,moves} from '../src/sim.mjs';
import {MODELS,modelFile,shadowView} from '../src/selfplay-shadow.mjs';
import {gameContext,simRoot} from '../src/net-search.mjs';
import {plan} from '../src/execute.mjs';
import {contentBox} from '../src/layout.mjs';
import {deckArg,checkModel,DEFAULT_DECK} from '../src/game-zoo.mjs';
import {loadDeck} from '../src/deck.mjs';

// Live play with warlock-zakajz (JEV_DECK=warlock-zakajz): the deck's own network, and the two cards the list
// swapped in for the zoo version. Glacial Shard needs a target on the board; Zakajz's battlecry has none.
const cards=cardDb(),list=loadList('warlock-zakajz');
const C=(id,entityId,extra={})=>({...rawCard(cards[id],entityId),...extra});
const player=(id,first=false)=>({id:100+id,playerId:id,tags:{CONTROLLER:String(id),RESOURCES:'4',FATIGUE:'0',...(first?{FIRST_PLAYER:'1'}:{})}});
const ent=(c,playerId,zone)=>({id:c.entityId,cardId:c.cardId,tags:{CONTROLLER:String(playerId),ZONE:zone,CARDTYPE:c.CARDTYPE}});
const withEnv=async(env,f)=>{
  const old={};
  for(const k of Object.keys(env)){old[k]=process.env[k];if(env[k]==null)delete process.env[k];else process.env[k]=env[k]}
  try{return await f()}finally{for(const k of Object.keys(env))old[k]==null?delete process.env[k]:process.env[k]=old[k]}
};

const SHARD=41,ZAK=42,FOE=51;
function fixture(){
  const hero=C('HERO_07',1,{HEALTH:30}),oppHero=C('HERO_07',2,{HEALTH:30});
  const hand=[C('CORE_UNG_205',SHARD),C('BE_728',ZAK)];
  const board=[hero];
  const oppBoard=[oppHero,C('CS2_231',FOE)];                                 // an enemy minion (Wisp) to freeze
  const state={gameNumber:4,status:'RUNNING',step:'MAIN_ACTION',turn:4,me:{playerId:1,current:true,mana:4,maxMana:4,fatigue:0,handCount:2,deckCount:20,hand,board,heroClass:'WARLOCK'},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:oppBoard,heroClass:'WARLOCK'}};
  const actions=[{id:'end',type:'END_TURN',option:0},
    {id:'shard',type:'POWER',option:1,entityId:SHARD,targetId:FOE},
    {id:'zak',type:'POWER',option:2,entityId:ZAK}];
  const parsed={entities:new Map([player(1,true),player(2),...board.map(c=>ent(c,1,'PLAY')),...hand.map(c=>ent(c,1,'HAND')),...oppBoard.map(c=>ent(c,2,'PLAY'))].map(e=>[e.id,e])),gameNumber:4,publicPlays:[]};
  return {parsed,state,actions};
}
const view=f=>shadowView(f.parsed,f.state,f.actions,{cards,list});

test('game-zoo takes the deck from its argument, warlock-zoo by default',()=>{
  assert.equal(DEFAULT_DECK,'warlock-zoo');
  assert.equal(deckArg([]),'warlock-zoo');
  assert.equal(deckArg(['warlock-zakajz']),'warlock-zakajz');
  assert.equal(deckArg(['--dry']),'warlock-zoo');
});

test('warlock-zakajz maps to zoo 0.2.0 (R-151), named in the MODELS table',async()=>{
  await withEnv({JEV_NET_MODEL:null},()=>{
    assert.equal(MODELS['warlock-zakajz'],'warlock-zoo-0.2.0');
    assert.match(modelFile('warlock-zakajz'),/models[\\/]selfplay[\\/]warlock-zoo-0\.2\.0\.json$/);
    // The log's first line takes its network name from this table.
    const zoo=checkModel('warlock-zoo');
    assert.equal(zoo.ok,true);
    assert.equal(zoo.name,'warlock-zoo-v9');
  });
});

test('a missing network file is caught before a game starts, naming the file',async()=>{
  await withEnv({JEV_NET_MODEL:'models/selfplay/not-built-yet.json'},()=>{
    const check=checkModel('warlock-zakajz');
    assert.equal(check.ok,false);
    assert.equal(check.name,'not-built-yet');
    assert.match(check.error,/not found/);
    assert.ok(check.error.includes(check.file),check.error);
  });
  await withEnv({JEV_NET_MODEL:null},()=>{
    const check=checkModel('no-such-deck');
    assert.equal(check.ok,false);
    assert.match(check.error,/no network for deck 'no-such-deck'/);
  });
});

test('Glacial Shard is offered with a target and planned as a play onto that enemy',()=>{
  const f=fixture(),v=view(f);
  assert.deepEqual(v.legal[1],{kind:'play',id:SHARD,targetId:FOE});
  assert.deepEqual(v.legal[2],{kind:'play',id:ZAK});
  const steps=plan(contentBox(2560,1440),f.state,f.actions[1]);
  assert.deepEqual(steps.map(s=>s.what).slice(0,2),['select Glacial Shard','drop into slot 1']);
  assert.match(steps.at(-1).what,/^target /);
  assert.match(steps.at(-1).what,/Wisp$/);
});

test('Zakajz is planned as a plain play with no target',()=>{
  const f=fixture();
  const steps=plan(contentBox(2560,1440),f.state,f.actions[2]);
  assert.deepEqual(steps.map(s=>s.what),['select Zakajz the Corruptor','drop into slot 1']);
});

test('the live search menu offers both plays, freezes the enemy and applies Zakajz',()=>{
  const f=fixture(),v=view(f),root=simRoot(v.s,'warlock-zakajz'),menu=moves(root);
  const freeze=menu.find(m=>m.kind==='play'&&m.id===SHARD&&m.targetId===FOE);
  assert.ok(freeze,'Glacial Shard can be aimed at the enemy minion');
  const zak=menu.find(m=>m.kind==='play'&&m.id===ZAK);
  assert.ok(zak,'Zakajz is on the menu without a target');
  assert.equal('targetId' in zak,false);
  assert.ok(apply(root,freeze).s.opp.find(b=>b.id===FOE).frozen);
  // Zakajz: the minion left in hand costs (1) less; the spell in the deck costs (1) more.
  const after=apply(root,zak).s;
  assert.equal(after.hand.find(c=>c.id===SHARD).cost,0);
  assert.ok(after.deck.filter(c=>c.CARDTYPE==='SPELL').length>0);
  assert.ok(after.deck.filter(c=>c.CARDTYPE==='SPELL').every(c=>c.COST>=cardDb()[c.cardId].cost));
});

test('the game context is built per deck and holds the same simulator rules',()=>{
  const zoo=gameContext('warlock-zoo'),zak=gameContext('warlock-zakajz');
  assert.ok(zoo.minions&&zak.minions);
  assert.deepEqual(Object.keys(zak.extra).sort(),Object.keys(zoo.extra).sort());
  assert.equal(gameContext('warlock-zakajz'),zak);
});

test('the zakajz deck reads its own strategy and stats without Fatebreaker',()=>{
  const deck=loadDeck('warlock-zakajz');
  assert.match(deck.strategy,/Zakajz the Corruptor/);
  assert.match(deck.strategy,/Glacial Shard/);
  assert.doesNotMatch(deck.strategy,/Fatebreaker/);
  assert.match(deck.mulligan.note,/Glacial Shard/);
  assert.equal(deck.mulligan.cards['Glacial Shard'],undefined);
  assert.equal(deck.mulligan.cards['Zakajz the Corruptor'].mulliganWR,65.8);
});

// 2026-10-29 ranked game 15: Ritual of C'Thun's Glare asks for its enemy minion as a TARGET choice at the start of
// the turn. No option was offered, the loop waited ("not my turn") and the user had to click the target.
test("Glare of C'Thun's TARGET choice is offered, read as the simulator's glare and clicked on the enemy minion",async()=>{
  const {candidates}=await import('../src/power.mjs');
  const f=fixture(),A=52,B=53;
  f.state.opponent.board.push(C('CS2_231',A),C('CS2_231',B));
  f.state.step='MAIN_START_TRIGGERS';
  f.state.choice={id:8,type:'TARGET',min:1,max:1,entities:[f.state.opponent.board[2],f.state.opponent.board[3]],source:C('BE_726',29)};
  const actions=candidates({},f.state);
  assert.deepEqual(actions.map(a=>[a.type,a.entityId]),[['CHOICE',A],['CHOICE',B]]);
  const v=shadowView(f.parsed,f.state,actions,{cards,list});
  assert.equal(v.s.choice.kind,'glare');
  assert.deepEqual(v.legal.map(m=>[m.kind,m.id]),[['choose',A],['choose',B]]);
  assert.ok(v.s.opp.some(b=>b.id===A),'the glare target is an enemy minion of the view');
  const box=contentBox(2560,1440);
  const [step]=plan(box,f.state,actions[0]);
  assert.match(step.what,/^pick /);
  const rival=plan(box,f.state,{type:'POWER',entityId:FOE,option:9})[0];
  assert.ok(step.y<box.y+box.h/2&&Math.abs(step.y-rival.y)<2,'clicked on the enemy board row');
});

// L-: a position question rebuilt from the recording alone graded both 2026-10-29 rulings as passes, while the live
// network had made the mistake (no ritual clocks, Shreds or graveyard in the rebuild). A fixture that records the live
// pick must rebuild the position the network saw: graded with the live network, its top is that pick.
test('zoo position questions with a recorded live pick reproduce it from the fixture',async()=>{
  const {loadQuestions,loadPosition,loadModel,gradePosition,LIVE_MODELS}=await import('../src/regress.mjs');
  const {net}=loadModel(LIVE_MODELS['warlock-zakajz']);
  const qs=loadQuestions().filter(q=>q.deck==='warlock-zakajz'&&q.kind==='position'&&!q.unsupported);
  const withPick=qs.filter(q=>JSON.parse(readFileSync(q.source.file,'utf8')).source?.livePick);
  assert.ok(withPick.length>=2);
  await withEnv({JEV_DECK:'warlock-zakajz'},async()=>{
    for(const q of withPick){
      const live=JSON.parse(readFileSync(q.source.file,'utf8')).source.livePick;
      assert.equal(gradePosition(q,net,{cards,list}).top,live,q.id);
    }
  });
});

// User 2026-10-29: the net-guards are to be turned off once the network learns them. A guard is retired (RETIRED in
// src/net-guards.mjs) for the live model exactly when that model answers every question of the guard (GUARD_QUESTIONS).
test('net-guards are retired for the live zoo model exactly when it passes their questions',async()=>{
  const {runDeck,guardStatus}=await import('../src/regress.mjs');
  await withEnv({JEV_DECK:'warlock-zakajz'},async()=>{
    const rep=runDeck('warlock-zakajz',{f881:false});
    const st=guardStatus(rep);
    assert.ok(st.length>=3);
    for(const g of st)assert.equal(g.retired,g.retirable,`${g.guard}: ${g.pass}/${g.total} pass, retired ${g.retired}`);
  });
});
