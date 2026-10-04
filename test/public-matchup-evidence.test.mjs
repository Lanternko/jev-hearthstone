import test from 'node:test';
import assert from 'node:assert/strict';
import {createParser,publicState,parsePower} from '../src/power.mjs';
const power=s=>s.split('\n').map(x=>`D 00:00:00 GameState.DebugPrintPower() - ${x}`).join('\n')+'\n';
const initial=power(`CREATE_GAME
GameEntity EntityID=1
tag=STATE value=RUNNING
Player EntityID=2 PlayerID=1
tag=CONTROLLER value=1
Player EntityID=3 PlayerID=2
tag=CONTROLLER value=2
FULL_ENTITY - Creating ID=7 CardID=HERO1
tag=CONTROLLER value=1
tag=CARDTYPE value=HERO
tag=ZONE value=PLAY
tag=HEALTH value=30
FULL_ENTITY - Creating ID=8 CardID=HERO2
tag=CONTROLLER value=2
tag=CARDTYPE value=HERO
tag=ZONE value=PLAY
tag=HEALTH value=40
FULL_ENTITY - Creating ID=4 CardID=
tag=CONTROLLER value=2
tag=CARDTYPE value=SPELL
tag=ZONE value=HAND
FULL_ENTITY - Creating ID=5 CardID=PRIVATE_QUEST
tag=CONTROLLER value=2
tag=CARDTYPE value=SPELL
tag=ZONE value=HAND
FULL_ENTITY - Creating ID=6 CardID=PRIVATE_SECRET
tag=CONTROLLER value=2
tag=CARDTYPE value=SPELL
tag=ZONE value=HAND
TAG_CHANGE Entity=GameEntity tag=TURN value=1
TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_READY
TAG_CHANGE Entity=GameEntity tag=TURN value=2`);
const draw=power(`BLOCK_START BlockType=PLAY Entity=[entityName=UNKNOWN id=4 zone=HAND zonePos=1 cardId= player=2] EffectCardId= EffectIndex=0 Target=0
SHOW_ENTITY - Updating Entity=[id=4] CardID=PUBLIC_DRAW
tag=ZONE value=PLAY
TAG_CHANGE Entity=4 tag=ZONE value=GRAVEYARD
BLOCK_END`);
const secret=power(`BLOCK_START BlockType=PLAY Entity=[id=6 zone=HAND cardId=PRIVATE_SECRET player=2] EffectCardId= EffectIndex=0 Target=0
TAG_CHANGE Entity=6 tag=ZONE value=SECRET
BLOCK_END`);
const cards={HERO1:{cardClass:'WARLOCK'},HERO2:{cardClass:'PRIEST'},
 PRIVATE_QUEST:{name:'The Demon Seed',type:'SPELL',text:'Private quest text'},
 PRIVATE_SECRET:{name:'Private secret name',type:'SPELL',text:'Private secret text',mechanics:['SECRET']},
 PUBLIC_DRAW:{name:'Observed draw',type:'SPELL',cost:2,text:'Draw two cards.'}};

test('actual nested UNKNOWN ENTITY descriptor records public plays after reveal',()=>{
 const nested=draw.replace('entityName=UNKNOWN id=4','entityName=UNKNOWN ENTITY [cardType=INVALID] id=4');
 const s=publicState(parsePower(initial+nested),1,cards);
 assert.deepEqual(s.opponent.publicPlays.map(c=>c.name),['Observed draw']);
 assert.equal(s.opponent.publicPlays[0].engineTurn,2);
});

test('only public played/revealed cards enter live evidence; private hand/deck/secret identities stay hidden',()=>{
 const p=createParser().feed(initial),before=publicState(p.result(),1,cards);
 assert.deepEqual(before.opponent.publicPlays,[]);assert.equal(before.opponent.initialHealth,40);
 p.feed(draw+secret);const s=publicState(p.result(),1,cards);
 assert.deepEqual(s.opponent.publicPlays.map(c=>c.name),['Observed draw']);
 assert.equal(s.opponent.publicPlays[0].engineTurn,2);assert.equal(s.opponent.secretCount,1);
 assert.doesNotMatch(JSON.stringify(s),/PRIVATE_QUEST|The Demon Seed|PRIVATE_SECRET|Private secret/);
});

test('first public Health and played-card identity are fixed; later transformations do not rewrite history',()=>{
 const p=createParser().feed(initial+draw);
 p.feed(power('CHANGE_ENTITY - Updating Entity=[id=4] CardID=PRIVATE_QUEST\nTAG_CHANGE Entity=8 tag=HEALTH value=50'));
 const s=publicState(p.result(),1,cards);
 assert.equal(s.opponent.initialHealth,40);assert.equal(s.opponent.board[0].HEALTH,50);
 assert.equal(s.opponent.publicPlays[0].cardId,'PUBLIC_DRAW');
 p.feed(power('CREATE_GAME'));
 assert.deepEqual(p.result().publicPlays,[]);assert.equal(p.result().initialHeroHealth.size,0);
});

test('incremental parsing equals whole parsing and newly public evidence changes the material fingerprint',()=>{
 const text=initial+draw+secret,whole=publicState(parsePower(text),1,cards),p=createParser();
 for(const line of text.trimEnd().split('\n'))p.feed(line+'\n');
 assert.deepEqual(publicState(p.result(),1,cards),whole);
 const before=publicState(parsePower(initial),1,cards);
 assert.notEqual(before.decisionFingerprint,whole.decisionFingerprint);
});

test('no future evidence is backdated when an unresolved card is revealed on another turn',()=>{
 const unresolved=power(`BLOCK_START BlockType=PLAY Entity=[id=4 zone=HAND cardId= player=2]
BLOCK_END
TAG_CHANGE Entity=GameEntity tag=TURN value=3
SHOW_ENTITY - Updating Entity=[id=4] CardID=PUBLIC_DRAW`);
 const s=publicState(parsePower(initial+unresolved),1,cards);
 assert.deepEqual(s.opponent.publicPlays,[]);
});
