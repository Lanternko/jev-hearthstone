import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cardDb,loadList,rawCard} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {parsePower} from '../src/power.mjs';
import {deckName,loadDeck} from '../src/deck.mjs';
import {mulliganVerdict} from '../src/policy.mjs';
import {assertEncoded,netPick,recordShadowDecision,ritualTimers,shadowRow,shadowView} from '../src/selfplay-shadow.mjs';

// Live games with the zoo Warlock (JEV_DECK=warlock-zoo): the network, its clocks and the picks it is offered.
const cards=cardDb(),list=loadList('warlock-zoo'),net=loadNet(new URL('../models/selfplay/warlock-zoo-v4.json',import.meta.url));
const C=(id,entityId,extra={})=>({...rawCard(cards[id],entityId),...extra});
const player=(id,first=false)=>({id:100+id,playerId:id,tags:{CONTROLLER:String(id),RESOURCES:'4',FATIGUE:'0',...(first?{FIRST_PLAYER:'1'}:{})}});
const ent=(c,playerId,zone)=>({id:c.entityId,cardId:c.cardId,tags:{CONTROLLER:String(playerId),ZONE:zone,CARDTYPE:c.CARDTYPE}});
const withEnv=async(env,f)=>{
  const old={};
  for(const k of Object.keys(env)){old[k]=process.env[k];process.env[k]=env[k]}
  try{return await f()}finally{for(const k of Object.keys(env))old[k]==null?delete process.env[k]:process.env[k]=old[k]}
};

function fixture({publicPlays=[],deckCount=20,choice=null}={}){
  const hero=C('HERO_07',1,{HEALTH:30}),oppHero=C('HERO_07',2,{HEALTH:30});
  const hand=[C('BE_085',41),C('BE_726',42),C('TIME_025',43),C('BE_729',44)];
  const board=[hero,C('TLC_603',45,{EXHAUSTED:0})];
  const oppBoard=[oppHero,C('TLC_603',51,{EXHAUSTED:1})];
  const state={gameNumber:3,status:'RUNNING',step:'MAIN_ACTION',turn:5,me:{playerId:1,current:true,mana:4,maxMana:4,fatigue:0,handCount:4,deckCount,hand,board,heroClass:'WARLOCK'},
    opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:oppBoard,heroClass:'WARLOCK'}};
  const actions=choice?choice.map((c,i)=>({id:`c${i}`,type:'CHOICE',entityId:c.entityId})):[
    {id:'end',type:'END_TURN',option:0},
    ...hand.map((c,i)=>({id:`p${i}`,type:'PLAY',option:1+i,entityId:c.entityId})),
    {id:'attack',type:'ATTACK',option:9,entityId:45,targetId:51}];
  if(choice)state.choice={type:'GENERAL',entities:choice};
  const parsed={entities:new Map([player(1,true),player(2),...board.map(c=>ent(c,1,'PLAY')),...hand.map(c=>ent(c,1,'HAND')),...oppBoard.map(c=>ent(c,2,'PLAY'))].map(e=>[e.id,e])),gameNumber:3,publicPlays};
  return {parsed,state,actions};
}
const play=(playerId,engineTurn,cardId)=>({entityId:900+engineTurn,playerId,engineTurn,cardId,originZone:'HAND'});
const view=f=>shadowView(f.parsed,f.state,f.actions,{cards,list});

test('a Ritual played on turn T has 2 turns left at T, 1 at T+2 and is gone at T+4',()=>{
  const plays=[play(1,3,'BE_085')];
  assert.deepEqual(ritualTimers(plays,1,3),[{left:2,effect:'summon'}]);
  assert.deepEqual(ritualTimers(plays,1,4),[{left:2,effect:'summon'}]);      // the other chair's turn: still the same clock
  assert.deepEqual(ritualTimers(plays,1,5),[{left:1,effect:'summon'}]);
  assert.deepEqual(ritualTimers(plays,1,7),[]);                              // it fired at the start of turn 7
});

test("each side's Rituals go to that side; C'Thun's is told apart; other plays are ignored",()=>{
  const plays=[play(2,2,'BE_726'),play(1,3,'BE_085'),play(1,3,'TLC_603')];
  assert.deepEqual(ritualTimers(plays,2,3),[{left:2,effect:'cthun'}]);
  assert.deepEqual(ritualTimers(plays,2,4),[{left:1,effect:'cthun'}]);
  assert.deepEqual(ritualTimers(plays,2,6),[]);
  assert.deepEqual(ritualTimers(plays,1,3),[{left:2,effect:'summon'}]);
  assert.deepEqual(ritualTimers(undefined,1,3),[]);
  assert.deepEqual(ritualTimers([play(1,9,'BE_085')],1,5),[]);               // a play from a later turn is not one of ours yet
});

test('the clocks reach both sides of the network state',()=>{
  const v=view(fixture({publicPlays:[play(1,3,'BE_085'),play(2,4,'BE_726')]}));
  assert.deepEqual(v.s.timers,[{left:1,effect:'summon'}]);
  assert.deepEqual(v.s.them.timers,[{left:2,effect:'cthun'}]);
});

test('Shreds shuffled in by Timehopper and Tachyon Barrage are flagged, without becoming Continuity Shreds',()=>{
  const L=s=>'D 00:00:00.0000000 GameState.DebugPrintPower() - '+s;
  const E=(id,cardId)=>`[entityName=x id=${id} zone=HAND zonePos=1 cardId=${cardId} player=1]`;
  const shred=id=>[L(`FULL_ENTITY - Creating ID=${id} CardID=TIME_025t`),L('    tag=CONTROLLER value=1'),L('    tag=ZONE value=DECK')];
  const block=(id,cardId,body)=>[L(`BLOCK_START BlockType=PLAY Entity=${E(id,cardId)} EffectCardId=x EffectIndex=0 Target=0 SubOption=-1`),...body,L('BLOCK_END')];
  const p=parsePower([L('CREATE_GAME'),
    ...block(5,'TIME_025',shred(8)),...block(6,'TIME_027',shred(9)),...block(7,'TIME_026',shred(10)),...shred(11)].join('\n'));
  const e=id=>p.entities.get(id);
  assert.ok(e(8).generatedShred&&e(9).generatedShred&&e(10).generatedShred);
  assert.ok(!e(8).generatedByContinuity&&!e(9).generatedByContinuity);        // drawHazards reads this one
  assert.ok(e(10).generatedByContinuity);
  assert.ok(!e(11).generatedShred);
});

test('the hidden deck holds a Shred for each one shuffled in',()=>{
  const f=fixture({deckCount:40});
  const shreds=()=>view(f).s.deck.filter(c=>c.cardId==='TIME_025t').length;
  const none=shreds();
  for(const id of [901,902])f.parsed.entities.set(id,{id,cardId:'TIME_025t',tags:{CONTROLLER:'1',ZONE:'DECK'},generatedShred:true});
  assert.equal(shreds()-none,2);
});

test('zoo-v4 reads a zoo state at its own size and answers with a legal action',async()=>{
  const f=fixture({publicPlays:[play(1,3,'BE_085')]});
  const v=view(f);
  const e=assertEncoded(v,net);
  assert.equal(e.obs.length,377);
  assert.ok(e.obs.every(Number.isFinite));
  assert.ok(shadowRow(net,v,{action:f.actions[1],source:'test',state:f.state}).top.length>0);
  await withEnv({JEV_DECK:'warlock-zoo'},async()=>{
    const pick=await netPick(f);
    assert.ok(pick&&f.actions.includes(pick.action));
  });
});

test('the deck decides the network; the log names the file; no network means no answer',async()=>{
  const f=fixture();
  const dir=await mkdtemp(join(tmpdir(),'shadow-zoo-'));
  const out=new URL(`file:///${join(dir,'shadow.jsonl').replace(/\\/g,'/')}`);
  const record=()=>recordShadowDecision({...f,action:f.actions[1],source:'test',out});
  try{
    await withEnv({JEV_DECK:'warlock-zoo',JEV_SHADOW:'1'},async()=>{
      assert.equal(deckName(f.state),'warlock-zoo');
      assert.equal((await record()).model,'warlock-zoo-v9');
      assert.equal(JSON.parse((await readFile(out,'utf8')).trim()).model,'warlock-zoo-v9');
    });
    await withEnv({JEV_DECK:'warlock-discard',JEV_SHADOW:'1'},async()=>{
      assert.equal((await record()).model,'warlock-discard-v5');
    });
    await withEnv({JEV_DECK:'dh-void',JEV_SHADOW:'1'},async()=>{
      assert.equal(await record(),null);
      assert.equal(await netPick(f),null);
    });
    await withEnv({JEV_DECK:'warlock-zoo',JEV_NET_MODEL:'models/selfplay/warlock-zoo-v3.json',JEV_SHADOW:'1'},async()=>{
      assert.equal((await record()).model,'warlock-zoo-v3');
    });
  }finally{await rm(dir,{recursive:true,force:true})}
});

const pickOf=ids=>ids.map((id,i)=>({entityId:100+i,cardId:id,name:cards[id].name}));

test("C'Thun's abilities are offered by card id, and the live action maps back to the entity",()=>{
  const opts=pickOf(['BE_013t1','BE_013t2','BE_013t3','BE_013t4']);
  const v=view(fixture({choice:opts}));
  assert.deepEqual(v.legal.map(m=>m.id),opts.map(o=>o.cardId));
  assert.ok(v.legal.every(m=>m.kind==='choose'));
  assert.deepEqual([...v.byAction.values()],[0,1,2,3]);
  assert.ok(!v.notes.some(n=>n.includes('discover option')||n.includes('kazakus')));
  const e=assertEncoded(v,net);
  assert.equal(new Set(e.acts.map(a=>a.join())).size,4);                      // each ability is its own step
});

test('Kazakus effects and trials are offered by card id',()=>{
  const v=view(fixture({choice:pickOf(['CAP_405t1','CAP_405t5','CAP_405t9'])}));
  assert.deepEqual(v.legal.map(m=>m.id),['CAP_405t1','CAP_405t5','CAP_405t9']);
  // A first pick has nothing to rebuild (zoo-kazakus.test.mjs covers the later picks).
  assert.ok(!v.notes.includes('kazakus picks not reconstructed'));
  assert.ok(!v.notes.some(n=>n.includes('discover option')));
  const trials=view(fixture({choice:pickOf(['CAP_405tb1','CAP_405tb2','CAP_405tb3'])}));
  assert.deepEqual(trials.legal.map(m=>m.id),['CAP_405tb1','CAP_405tb2','CAP_405tb3']);
  // The game offers trials with a trailing b (CAP_405tb3b), as Power.log showed on 2026-10-25.
  const live=view(fixture({choice:pickOf(['CAP_405tb3b','CAP_405tb2b','CAP_405tb1b'])}));
  assert.deepEqual(live.legal.map(m=>m.id),['CAP_405tb3','CAP_405tb2','CAP_405tb1']);
  assert.ok(!live.notes.some(n=>n.includes('discover option')));
});

test('a zoo game loads its strategy and opens its mulligan under JEV_DECK=warlock-zoo',async()=>{
  assert.match(loadDeck('warlock-zoo').strategy,/^# Zoo Warlock/);
  await withEnv({JEV_DECK:'warlock-zoo'},()=>{
    const hand=['BE_085','TLC_603','BE_151','TIME_029'].map((id,i)=>C(id,200+i,{name:cards[id].name}));
    const state={me:{heroClass:'WARLOCK',hand:[]},opponent:{board:[]},choice:{type:'MULLIGAN',entities:hand}};
    for(const c of hand)assert.ok(['keep','free','toss'].includes(mulliganVerdict(c,state)),c.name);
  });
});
