import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cardDb,loadList,rawCard} from '../src/selfplay.mjs';
import {loadNet} from '../src/selfplay-net.mjs';
import {parsePower} from '../src/power.mjs';
import {assertEncoded,recordShadowDecision,shadowRow,shadowView} from '../src/selfplay-shadow.mjs';

const cards=cardDb(),list=loadList('warlock-discard'),net=loadNet();
const C=(id,entityId,extra={})=>({...rawCard(cards[id],entityId),...extra});
const player=(id,first=false)=>({id:100+id,playerId:id,tags:{CONTROLLER:String(id),RESOURCES:'3',FATIGUE:'0',...(first?{FIRST_PLAYER:'1'}:{})}});
const parsed=entities=>({entities:new Map(entities.map(e=>[e.id,e])),gameNumber:12});
const ent=(c,playerId,zone)=>({id:c.entityId,cardId:c.cardId,playerId:undefined,tags:{CONTROLLER:String(playerId),ZONE:zone,CARDTYPE:c.CARDTYPE}});

function fixture(){
  const hero=C('HERO_07',1,{HEALTH:30}),oppHero=C('HERO_07',2,{HEALTH:30});
  const power=C('HERO_07bp',3,{CARDTYPE:'HERO_POWER',EXHAUSTED:0});
  const site=C('WON_103',4,{CARDTYPE:'LOCATION',HEALTH:2,DAMAGE:0});
  const hand=[C('KAR_205',41),C('EX1_308',42),C('WON_103',43)];
  const board=[hero,power,site,C('SCH_147',44,{EXHAUSTED:0})];
  const oppBoard=[oppHero,C('TLC_603',51,{EXHAUSTED:1})];
  const state={gameNumber:12,status:'RUNNING',step:'MAIN_ACTION',turn:7,me:{playerId:1,current:true,mana:3,maxMana:3,fatigue:1,handCount:3,deckCount:24,hand,board,heroClass:'WARLOCK'},opponent:{playerId:2,mana:3,maxMana:3,handCount:5,deckCount:22,board:oppBoard,heroClass:'WARLOCK'}};
  const actions=[
    {id:'end',type:'END_TURN',option:0},
    {id:'play',type:'PLAY',option:1,entityId:41},
    {id:'spell',type:'PLAY',option:2,entityId:42,targetId:2},
    {id:'power',type:'POWER',option:3,entityId:3},
    {id:'use',type:'POWER',option:4,entityId:4},
    {id:'attack',type:'ATTACK',option:5,entityId:44,targetId:51}
  ];
  const p=parsed([player(1,true),player(2),...board.map(c=>ent(c,1,'PLAY')),...hand.map(c=>ent(c,1,'HAND')),...oppBoard.map(c=>ent(c,2,'PLAY'))]);
  return {parsed:p,state,actions};
}

test('shadow view encodes to the network sizes with finite numbers',()=>{
  const f=fixture(),view=shadowView(f.parsed,f.state,f.actions,{cards,list});
  const e=assertEncoded(view,net);
  assert.equal(e.obs.length,208);
  assert.ok(e.acts.every(a=>a.length===56));
});

test('legal moves mirror the action list and classify kinds',()=>{
  const f=fixture(),view=shadowView(f.parsed,f.state,f.actions,{cards,list});
  assert.deepEqual(view.legal.map(m=>m.kind),['end','play','play','power','use','attack']);
  assert.deepEqual([...view.byAction.entries()].map(([id,i])=>[id,i]),f.actions.map((a,i)=>[a.id,i]));
});

test('deck is reduced by seen own cards and padded or trimmed to deckCount',()=>{
  const f=fixture(),view=shadowView(f.parsed,f.state,f.actions,{cards,list});
  assert.equal(view.s.deck.length,24);
  assert.equal(view.s.deck.filter(c=>c.cardId==='KAR_205').length,0);
  assert.ok(view.notes.some(n=>n.includes('deck')));
});

test('seat and opponent hidden counts enter the state',()=>{
  const f=fixture(),view=shadowView(f.parsed,f.state,f.actions,{cards,list});
  assert.equal(view.s.seat,0);
  assert.equal(view.s.them.hand.length,5);
  assert.equal(view.s.them.deck.length,22);
  assert.equal(view.s.them.fatigue,0);
});

test('mulligan and empty action menus do not shadow',()=>{
  const f=fixture();
  assert.equal(shadowView(f.parsed,f.state,[{id:'m0',type:'MULLIGAN'}],{cards,list}),null);
  assert.equal(shadowView(f.parsed,f.state,[],{cards,list}),null);
});

test('row records top, jev rank and agreement without throwing',()=>{
  const f=fixture(),view=shadowView(f.parsed,f.state,f.actions,{cards,list});
  const row=shadowRow(net,view,{action:f.actions[1],source:'test',state:f.state});
  assert.equal(row.model,'warlock-discard-v5');
  assert.ok(row.top.length>0&&row.top.length<=3);
  assert.equal(row.jev.source,'test');
  assert.equal(typeof row.agree,'boolean');
});

test('safe recorder swallows network errors',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'shadow-'));
  const out=new URL(`file:///${join(dir,'shadow.jsonl').replace(/\\/g,'/')}`);
  const f=fixture();
  const old=process.env.JEV_SHADOW;
  process.env.JEV_SHADOW='1';
  const row=await recordShadowDecision({...f,action:f.actions[1],source:'test',out});
  if(old==null)delete process.env.JEV_SHADOW;
  else process.env.JEV_SHADOW=old;
  assert.ok(row);
  const text=await readFile(out,'utf8');
  assert.equal(text.trim().split('\n').length,1);
  await rm(dir,{recursive:true,force:true});
});

test('the parser counts cards discarded from hand, not cards played',()=>{
  const L=s=>'D 00:00:00.0000000 GameState.DebugPrintPower() - '+s;
  const E=id=>`[entityName=x id=${id} zone=HAND zonePos=1 cardId=X player=1]`;
  const card=(id,controller)=>[L(`FULL_ENTITY - Creating ID=${id} CardID=X`),L(`    tag=CONTROLLER value=${controller}`),L('    tag=ZONE value=HAND')];
  const p=parsePower([L('CREATE_GAME'),...card(5,1),...card(6,1),...card(7,2),
    L(`BLOCK_START BlockType=PLAY Entity=${E(6)} EffectCardId=x EffectIndex=0 Target=0 SubOption=-1`),
    L(`TAG_CHANGE Entity=${E(6)} tag=ZONE value=GRAVEYARD`),          // the spell itself: played
    L(`TAG_CHANGE Entity=${E(5)} tag=ZONE value=GRAVEYARD`),          // thrown away by it
    L(`SHOW_ENTITY - Updating Entity=${E(7)} CardID=Y`),L('    tag=ZONE value=GRAVEYARD'),   // a hidden card shown as it goes
    L('BLOCK_END')].join('\n'));
  assert.equal(p.discards.get(1),1);
  assert.equal(p.discards.get(2),1);
});

test('counted discards reach the network state; a parse without them is noted',()=>{
  const f=fixture(),with_=shadowView({...f.parsed,discards:new Map([[1,3],[2,2]])},f.state,f.actions,{cards,list});
  assert.equal(with_.s.discardCount,3);assert.equal(with_.s.them.discardCount,2);
  assert.ok(!with_.notes.includes('discardCount unknown'));
  assert.ok(shadowView(f.parsed,f.state,f.actions,{cards,list}).notes.includes('discardCount unknown'));
});
