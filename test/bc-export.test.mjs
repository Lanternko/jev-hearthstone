import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {cardDb,loadList} from '../src/selfplay.mjs';
import {vocabulary} from '../src/selfplay-encode.mjs';
import {unzipFirst,splitGames,gameFacts,decisions} from '../src/bc-export.mjs';

const cards=cardDb(),list=loadList('warlock-discard'),vocab=vocabulary([list,list]);
const G=(t,s)=>`D 00:00:${t} GameState.DebugPrintPower() - ${s}`;
const opts=(t,id,...items)=>[`id=${id}`,...items].map(s=>`D 00:00:${t} GameState.DebugPrintOptions() - ${s}`);

function zip(name,data){
  const body=deflateRawSync(data),n=Buffer.from(name);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(8,8);
  local.writeUInt32LE(body.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
  const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(8,10);
  dir.writeUInt32LE(body.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(n.length,28);dir.writeUInt32LE(0,42);
  const at=30+n.length+body.length,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+n.length,12);end.writeUInt32LE(at,16);
  return Buffer.concat([local,n,body,dir,n,end]);
}

test('the one file of an HDT replay comes out of its zip',()=>{
  const text=Buffer.from('D 00:00:01 GameState.DebugPrintPower() - CREATE_GAME\n'.repeat(50));
  assert.deepEqual(unzipFirst(zip('output_log.txt',text)),text);
});

test('a log is cut at the server stream\'s CREATE_GAME, not at the client\'s copy of it',()=>{
  const games=splitGames(['junk','D 1 PowerTaskList.DebugPrintPower() -     CREATE_GAME',G('01','CREATE_GAME'),'a',G('02','CREATE_GAME'),'b'].join('\n'));
  assert.deepEqual(games.map(g=>g.length),[2,2]);
});

// Our turn: one card played (with a card it plays nested inside), the turn ended, then a discover.
function game(){
  const ent=(id,card,ctl,zone,type,more='')=>[`FULL_ENTITY - Creating ID=${id} CardID=${card}`,`    tag=CONTROLLER value=${ctl}`,`    tag=ZONE value=${zone}`,`    tag=CARDTYPE value=${type}`,...(more?[more]:[])];
  const setup=['CREATE_GAME','GameEntity EntityID=1','    tag=STATE value=RUNNING','    tag=TURN value=3','    tag=STEP value=MAIN_ACTION',
    'Player EntityID=2 PlayerID=1','    tag=CONTROLLER value=1','    tag=CURRENT_PLAYER value=1','    tag=RESOURCES value=3','    tag=FIRST_PLAYER value=1',
    'Player EntityID=3 PlayerID=2','    tag=CONTROLLER value=2',
    ...ent(4,'HERO_07',1,'PLAY','HERO','    tag=HEALTH value=30'),...ent(5,'HERO_07bp',1,'PLAY','HERO_POWER'),
    ...ent(6,'HERO_08',2,'PLAY','HERO','    tag=HEALTH value=30'),
    ...ent(10,'KAR_205',1,'HAND','MINION','    tag=COST value=3'),...ent(11,'EX1_308',1,'HAND','SPELL','    tag=COST value=1'),
    ...ent(12,'CATA_499',1,'DECK','SPELL'),...ent(13,'BT_300',1,'DECK','SPELL'),...ent(14,'RLK_534',1,'DECK','SPELL')];
  return [
    ...setup.map(s=>G('01',s)),
    'D 00:00:01 GameState.DebugPrintGame() - PlayerID=1, PlayerName=Me#1',
    'D 00:00:01 GameState.DebugPrintGame() - PlayerID=2, PlayerName=Them#2',
    ...opts('02',1,'option 0 type=END_TURN mainEntity= error=NONE','option 1 type=POWER mainEntity=10 error=NONE','option 2 type=POWER mainEntity=5 error=NONE'),
    G('03','BLOCK_START BlockType=PLAY Entity=[entityName=Silverware Golem id=10 zone=HAND zonePos=1 cardId=KAR_205 player=1] EffectCardId= EffectIndex=0 Target=0 SubOption=-1 '),
    G('03','    BLOCK_START BlockType=PLAY Entity=[entityName=Soulfire id=11 zone=HAND zonePos=2 cardId=EX1_308 player=1] EffectCardId= EffectIndex=0 Target=0 SubOption=-1 '),
    G('03','    BLOCK_END'),
    G('03','    TAG_CHANGE Entity=[entityName=Silverware Golem id=10 zone=HAND zonePos=1 cardId=KAR_205 player=1] tag=ZONE value=PLAY '),
    G('03','BLOCK_END'),
    ...opts('04',2,'option 0 type=END_TURN mainEntity= error=NONE','option 1 type=POWER mainEntity=5 error=NONE'),
    G('05','TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_END '),
    G('05','TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION '),
    'D 00:00:06 GameState.DebugPrintEntityChoices() - id=3 Player=Me#1 TaskList=9 ChoiceType=GENERAL CountMin=1 CountMax=1',
    'D 00:00:06 GameState.DebugPrintEntityChoices() -   Entities[0]=[entityName=x id=13 zone=SETASIDE zonePos=0 cardId=BT_300 player=1]',
    'D 00:00:06 GameState.DebugPrintEntityChoices() -   Entities[1]=[entityName=y id=14 zone=SETASIDE zonePos=0 cardId=RLK_534 player=1]',
    'D 00:00:07 GameState.SendChoices() - id=3 ChoiceType=GENERAL',
    'D 00:00:07 GameState.SendChoices() -   m_chosenEntities[0]=[entityName=y id=14 zone=SETASIDE zonePos=0 cardId=RLK_534 player=1]',
    G('08','TAG_CHANGE Entity=Me#1 tag=PLAYSTATE value=WON '),
  ];
}

test('our outermost plays, the end of the turn and a discover pick are the decisions, each with its index',()=>{
  const lines=game();
  const facts=gameFacts(lines,cards,{'warlock-discard':list});
  assert.equal(facts.me,1);assert.equal(facts.result,1);assert.equal(facts.deck,'warlock-discard');
  const rows=decisions(lines,1,{cards,list,vocab});
  assert.deepEqual(rows.map(r=>[r.kind,r.pick,r.legal]),[['play',1,3],['end',0,2],['choose',1,2]]);
  assert.ok(rows.every(r=>r.acts.length===r.legal&&r.obs.length===rows[0].obs.length));
});

test('the same game read from two files has one key',()=>{
  const a=gameFacts(game(),cards,{}),b=gameFacts(['junk',...game()].slice(1),cards,{});
  assert.equal(a.key,b.key);
  assert.notEqual(a.key,gameFacts(game().map(l=>l.replace('00:00:01','00:00:09')),cards,{}).key);
});
