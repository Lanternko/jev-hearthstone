import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePower,createParser,publicState,candidates} from '../src/power.mjs';
const power=s=>s.split('\n').map(x=>`D 00:00:00 GameState.DebugPrintPower() - ${x}`).join('\n');
const fixture=power(`CREATE_GAME
GameEntity EntityID=1
tag=STATE value=RUNNING
tag=STEP value=MAIN_ACTION
Player EntityID=2 PlayerID=1
tag=CONTROLLER value=1
tag=CURRENT_PLAYER value=1
tag=RESOURCES value=3
tag=RESOURCES_USED value=1
Player EntityID=3 PlayerID=2
tag=CONTROLLER value=2
FULL_ENTITY - Creating ID=4 CardID=MY_CARD
tag=CONTROLLER value=1
tag=ZONE value=HAND
tag=CARDTYPE value=MINION
FULL_ENTITY - Creating ID=5 CardID=OP_SECRET
tag=CONTROLLER value=2
tag=ZONE value=HAND
FULL_ENTITY - Creating ID=6 CardID=DECK_SECRET
tag=CONTROLLER value=1
tag=ZONE value=DECK
FULL_ENTITY - Creating ID=7 CardID=OP_HERO
tag=CONTROLLER value=2
tag=ZONE value=PLAY
tag=CARDTYPE value=HERO`);
test('no opponent hand identity or deck order is exported',()=>{
 const s=publicState(parsePower(fixture),1);assert.equal(s.me.mana,2);assert.equal(s.opponent.handCount,1);assert.equal(s.me.deckCount,1);assert.doesNotMatch(JSON.stringify(s),/OP_SECRET|DECK_SECRET/);
});
test('only supported valid options and targets survive',()=>{
 const options=['id=4','option 0 type=END_TURN mainEntity= error=INVALID','option 1 type=POWER mainEntity=4 error=NONE','target 0 entity=7 error=NONE','target 1 entity=5 error=REQ_ENEMY_TARGET','option 2 type=POWER mainEntity=4 error=REQ_ENOUGH_MANA','option 3 type=POWER mainEntity=6 error=NONE'].map(s=>`GameState.DebugPrintOptions() - ${s}`).join('\n');
 const p=parsePower(fixture+'\n'+options),s=publicState(p,1);assert.deepEqual(candidates(p,s).map(a=>a.id),['o0','o1t0']);
 p.game.tags.STATE='COMPLETE';assert.deepEqual(candidates(p,publicState(p,1)),[]);
});
test('a new turn voids the last menu until its own options are printed',()=>{
 // 2026-09-25: read ~120ms after TURN changed, the leftover END-only menu ended our turn.
 const opts=(id,...items)=>[`id=${id}`,...items].map(s=>`D 00:00:00 GameState.DebugPrintOptions() - ${s}`).join('\n');
 const p=createParser().feed(fixture+'\n'+opts(4,'option 0 type=END_TURN mainEntity= error=NONE'));
 p.feed(power('TAG_CHANGE Entity=GameEntity tag=TURN value=3'));
 const r=p.result();assert.deepEqual(candidates(r,publicState(r,1)),[]);
 p.feed(opts(5,'option 0 type=END_TURN mainEntity= error=NONE','option 1 type=POWER mainEntity=4 error=NONE'));
 const q=p.result();assert.deepEqual(candidates(q,publicState(q,1)).map(a=>a.id),['o0','o1']);
});
test('new game resets entities and delayed duplicate stream is ignored',()=>{
 const p=parsePower(fixture+'\nPowerTaskList.DebugPrintPower() - CREATE_GAME\n'+power('CREATE_GAME\nGameEntity EntityID=1'));
 assert.equal(p.gameNumber,2);assert.equal(p.entities.size,1);
});
test('local player inference ignores unknown opponent name and choice',()=>{
 const p=parsePower(fixture+'\nGameState.DebugPrintGame() - PlayerID=1, PlayerName=Local#1234\nGameState.DebugPrintGame() - PlayerID=2, PlayerName=UNKNOWN HUMAN PLAYER\n'+power('TAG_CHANGE Entity=Opponent#5678 tag=RESOURCES value=6')+'\nGameState.DebugPrintEntityChoices() - id=2 Player=Opponent#5678 TaskList= ChoiceType=MULLIGAN CountMin=0 CountMax=3');
 assert.equal(p.localPlayer,1);assert.equal(publicState(p,1).opponent.maxMana,6);
});
test('own choices survive opponent choice packets, then clear on submission',()=>{
 const lines='\nGameState.DebugPrintGame() - PlayerID=1, PlayerName=Local#1234\nGameState.DebugPrintGame() - PlayerID=2, PlayerName=UNKNOWN HUMAN PLAYER\nGameState.DebugPrintEntityChoices() - id=1 Player=Local#1234 TaskList= ChoiceType=GENERAL CountMin=1 CountMax=1\nGameState.DebugPrintEntityChoices() - Entities[0]=4\nGameState.DebugPrintEntityChoices() - id=2 Player=UNKNOWN HUMAN PLAYER TaskList= ChoiceType=GENERAL CountMin=1 CountMax=1\nGameState.DebugPrintEntityChoices() - Entities[0]=5';
 let p=parsePower(fixture+lines),s=publicState(p,1);assert.equal(s.choice.id,1);assert.equal(candidates(p,s)[0].entityId,4);assert.doesNotMatch(JSON.stringify(s),/OP_SECRET/);
 p=parsePower(fixture+lines+'\nGameState.SendChoices() - id=1 ChoiceType=GENERAL');assert.equal(publicState(p,1).choice,undefined);
});
// snapshot() now parses only the bytes appended since the last read. Feeding the same log in
// pieces must land on exactly the same state, revision counter included.
test('feeding the log line by line equals parsing it whole',()=>{
 const text=fixture+'\nGameState.DebugPrintOptions() - id=4\nGameState.DebugPrintOptions() - option 0 type=END_TURN mainEntity= error=NONE\n';
 const whole=parsePower(text),p=createParser();
 for(const line of text.split('\n').slice(0,-1))p.feed(line+'\n');
 const inc=p.result();
 assert.equal(inc.revision,whole.revision);
 assert.deepEqual(publicState(inc,1),publicState(whole,1));
 assert.deepEqual(candidates(inc,publicState(inc,1)),candidates(whole,publicState(whole,1)));
});
test('a choice carries the card that opened it; GameEntity is not a source',()=>{
 const lines='\nGameState.DebugPrintGame() - PlayerID=1, PlayerName=Local#1234\nGameState.DebugPrintEntityChoices() - id=3 Player=Local#1234 TaskList=118 ChoiceType=GENERAL CountMin=1 CountMax=1\nGameState.DebugPrintEntityChoices() -   Source=[entityName=詛咒的墓穴 id=6 zone=PLAY zonePos=0 cardId=DECK_SECRET player=1]\nGameState.DebugPrintEntityChoices() -   Entities[0]=4';
 const s=publicState(parsePower(fixture+lines),1,{DECK_SECRET:{name:'Cursed Catacombs',text:'Make it Temporary.'}});
 assert.equal(s.choice.source.name,'Cursed Catacombs');assert.equal(s.choice.entities[0].entityId,4);
 const m=publicState(parsePower(fixture+lines.replace(/Source=\[.*?\]/,'Source=GameEntity')),1);
 assert.equal(m.choice.source,undefined);
});

test('shownTurn follows the playback copy of the log, not the server',()=>{
  const p=createParser();
  p.feed(['D 15:10:12.86 GameState.DebugPrintPower() -     TAG_CHANGE Entity=GameEntity tag=TURN value=3 ',
          'D 15:10:12.86 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=GameEntity tag=TURN value=2 '].join('\n'));
  assert.equal(p.result().shownTurn,2);
  p.feed('D 15:10:16.30 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=GameEntity tag=TURN value=3 ');
  assert.equal(p.result().shownTurn,3);
});

test('a Shred of Time in our deck is carried as its damage only',async()=>{
 const {drawnSelfDamage}=await import('../src/power.mjs');
 assert.equal(drawnSelfDamage({text:'<b>Casts When Drawn</b>\nDeal $3 damage to your hero.'}),3);
 assert.equal(drawnSelfDamage({text:'Draw a card.'}),0);
});

// Game 13, turn 4: Platysaur drew Walking Dead; the enchantment on Platysaur names it.
test('the card a friendly deathrattle will discard is marked doomed',()=>{
 const cards={PLATY:{text:'<b>Battlecry:</b> Draw a card.\n<b>Deathrattle:</b> Discard it.'},OTHER:{text:''}};
 const log=fixture+'\n'+power(`FULL_ENTITY - Creating ID=20 CardID=PLATY
tag=CONTROLLER value=1
tag=ZONE value=PLAY
tag=CARDTYPE value=MINION
FULL_ENTITY - Creating ID=21 CardID=OTHER
tag=CONTROLLER value=1
tag=ZONE value=HAND
tag=CARDTYPE value=MINION
FULL_ENTITY - Creating ID=22 CardID=PLATYe
tag=CONTROLLER value=1
tag=CARDTYPE value=ENCHANTMENT
tag=ATTACHED value=20
tag=ZONE value=PLAY
TAG_CHANGE Entity=22 tag=TAG_SCRIPT_DATA_NUM_1 value=21`);
 const hand=s=>s.me.hand.map(c=>[c.entityId,!!c.doomed]);
 assert.deepEqual(hand(publicState(parsePower(log),1,cards)),[[4,false],[21,true]]);
 // Once Platysaur has died, the discard has happened (or can no longer happen).
 assert.deepEqual(hand(publicState(parsePower(log+'\n'+power('TAG_CHANGE Entity=20 tag=ZONE value=GRAVEYARD')),1,cards)),[[4,false],[21,false]]);
});
