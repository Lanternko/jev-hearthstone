import test from 'node:test';
import assert from 'node:assert/strict';
import {extractEvidence,cardSignals,matchupSignals} from '../src/history-matchup.mjs';
const power=s=>s.split('\n').map(l=>`D 00:00:00 GameState.DebugPrintPower() - ${l}`).join('\n');
test('historical replay evidence uses setup-adjusted health and only public opponent cards',()=>{
  const cards={hero:{name:'Hero',health:30,type:'HERO'},secret:{name:'Hidden',type:'MINION',cost:1,attack:9,health:9},body:{name:'Body',type:'MINION',cost:1,attack:3,health:2}};
  const text=power(`CREATE_GAME
GameEntity EntityID=1
Player EntityID=2 PlayerID=1
tag=CONTROLLER value=1
Player EntityID=3 PlayerID=2
tag=CONTROLLER value=2
FULL_ENTITY - Creating ID=4 CardID=hero
tag=CONTROLLER value=2
tag=CARDTYPE value=HERO
tag=ZONE value=PLAY
tag=HEALTH value=30
FULL_ENTITY - Creating ID=5 CardID=secret
tag=CONTROLLER value=2
tag=CARDTYPE value=MINION
tag=ZONE value=HAND
FULL_ENTITY - Creating ID=6 CardID=
tag=CONTROLLER value=2
tag=CARDTYPE value=MINION
tag=ZONE value=HAND
TAG_CHANGE Entity=GameEntity tag=TURN value=1
TAG_CHANGE Entity=4 tag=HEALTH value=40
TAG_CHANGE Entity=GameEntity tag=TURN value=2
BLOCK_START BlockType=PLAY Entity=[entityName=unknown id=6 zone=HAND zonePos=1 cardId= player=2]
SHOW_ENTITY - Updating Entity=6 CardID=body
tag=CONTROLLER value=2
tag=CARDTYPE value=MINION
tag=ZONE value=PLAY
BLOCK_END
TAG_CHANGE Entity=4 tag=HEALTH value=50
TAG_CHANGE Entity=GameEntity tag=TURN value=3`);
  const e=extractEvidence(text,{cards,friendlyPlayerId:1,coin:false});
  assert.equal(e.initialHealth,40);assert.equal(e.plays.length,1);assert.equal(e.plays[0].name,'Body');
  assert.equal(e.plays[0].turn,1);assert.doesNotMatch(JSON.stringify(e),/Hidden/);
  assert.equal(matchupSignals(e).strongBodies.length,1);
});
test('Coin and random missiles are not control ramp or board-clear signals',()=>{
  assert.equal(cardSignals({name:'The Coin',type:'SPELL',text:'Gain 1 Mana Crystal this turn only.'}).ramp,false);
  assert.equal(cardSignals({name:'Arcane Missiles',type:'SPELL',text:'Deal 3 damage randomly split among all enemies.'}).aoe,false);
  assert.equal(cardSignals({type:'SPELL',text:'Deal 3 damage to all minions.'}).aoe,true);
  assert.equal(cardSignals({type:'SPELL',text:'Gain an empty Mana Crystal.'}).ramp,true);
  assert.equal(cardSignals({type:'SPELL',text:'Draw 2 cards.'}).draw,true);
});
test('post-mulligan snapshot excludes Coin and the turn-one draw for both initiatives',()=>{
  for(const coin of [false,true]){
    const cards={A:{name:'A',type:'MINION'},B:{name:'B',type:'MINION'},C:{name:'C',type:'MINION'},D:{name:'D',type:'MINION'},draw:{name:'First draw',type:'MINION'},GAME_005:{name:'The Coin',type:'SPELL'}};
    const ids=coin?['A','B','C','D','GAME_005']:['A','B','C'];
    const setup=ids.map((c,i)=>`FULL_ENTITY - Creating ID=${i+10} CardID=${c}\ntag=CONTROLLER value=1\ntag=ZONE value=HAND`).join('\n');
    const text=power(`CREATE_GAME\nGameEntity EntityID=1\n${setup}\nTAG_CHANGE Entity=GameEntity tag=TURN value=1\nTAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_READY\nFULL_ENTITY - Creating ID=20 CardID=draw\ntag=CONTROLLER value=1\ntag=ZONE value=HAND\nTAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION`);
    const e=extractEvidence(text,{cards,friendlyPlayerId:1,coin});
    assert.equal(e.finalOpening.complete,true);assert.equal(e.finalOpening.cards.length,coin?4:3);
    assert.doesNotMatch(JSON.stringify(e.finalOpening),/First draw|The Coin/);
  }
});
