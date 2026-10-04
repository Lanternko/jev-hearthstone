import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewTimeline} from '../src/replay-review.mjs';
const cards={hero:{id:'hero',name:'Hero',type:'HERO',health:30},weapon:{id:'weapon',name:'Chronoclaws',type:'WEAPON',cost:4,attack:4,durability:3},
  material:{id:'material',name:'Silverware Golem',type:'MINION',cost:3,attack:3,health:4},secret:{id:'secret',name:'Opponent hidden card',type:'SPELL'}};
const power=s=>s.split('\n').map(l=>`D 00:00:00 GameState.DebugPrintPower() - ${l}`).join('\n');
const setup=turn=>`CREATE_GAME
GameEntity EntityID=1
Player EntityID=2 PlayerID=1
Player EntityID=3 PlayerID=2
tag=CONTROLLER value=2
tag=RESOURCES value=5
FULL_ENTITY - Creating ID=4 CardID=hero
tag=CONTROLLER value=2
tag=CARDTYPE value=HERO
tag=ZONE value=PLAY
tag=HEALTH value=30
tag=ATK value=4
FULL_ENTITY - Creating ID=5 CardID=hero
tag=CONTROLLER value=1
tag=CARDTYPE value=HERO
tag=ZONE value=PLAY
tag=HEALTH value=30
tag=DAMAGE value=10
FULL_ENTITY - Creating ID=6 CardID=weapon
tag=CONTROLLER value=2
tag=CARDTYPE value=WEAPON
tag=ZONE value=PLAY
tag=DURABILITY value=2
tag=DAMAGE value=3
FULL_ENTITY - Creating ID=7 CardID=material
tag=CONTROLLER value=2
tag=CARDTYPE value=MINION
tag=ZONE value=HAND
FULL_ENTITY - Creating ID=8 CardID=secret
tag=CONTROLLER value=1
tag=CARDTYPE value=SPELL
tag=ZONE value=HAND
TAG_CHANGE Entity=GameEntity tag=TURN value=${turn}
TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION`;
test('review separates weapon combat from its later discard trigger without exposing opponent hand',()=>{
  const text=power(`${setup(10)}
BLOCK_START BlockType=ATTACK Entity=[id=4 player=2] Target=[id=5 player=1]
TAG_CHANGE Entity=5 tag=DAMAGE value=14
BLOCK_END
BLOCK_START BlockType=TRIGGER Entity=[id=6 player=2]
TAG_CHANGE Entity=7 tag=ZONE value=GRAVEYARD
BLOCK_END`);
  const t=reviewTimeline(text,{friendlyPlayerId:2,coin:true,cards}),a=t.actions[0];
  assert.equal(a.before.own.weapons[0].durability,2);assert.equal(a.after.opponent.health,16);
  assert.deepEqual(a.handToGraveyard,[]); // The trigger occurs after the ATTACK block has ended.
  assert.equal(t.handTransitions[0].card.name,'Silverware Golem');
  assert.equal(t.handTransitions[0].sources[0].name,'Chronoclaws');
  assert.equal(t.turnStarts[0].turn,5);assert.equal(t.turnStarts[0].side,'own');
  assert.doesNotMatch(JSON.stringify(t),/Opponent hidden card/);
});
test('own fifth-turn eligibility follows initiative, not round number or chronological end alone',()=>{
  for(const coin of [false,true]){
    const own=coin?10:9,opponent=coin?9:10;
    const a=reviewTimeline(power(setup(own)),{friendlyPlayerId:2,coin,cards});
    const b=reviewTimeline(power(setup(opponent)),{friendlyPlayerId:2,coin,cards});
    assert.equal(a.turnStarts[0].side,'own');assert.equal(a.turnStarts[0].turn,5);
    assert.equal(b.turnStarts[0].side,'opponent');assert.equal(b.turnStarts[0].turn,5);
    const unfinished=reviewTimeline(power(setup(own).replace('tag=STEP value=MAIN_ACTION','tag=STEP value=MAIN_READY')),{friendlyPlayerId:2,coin,cards});
    assert.equal(unfinished.turnStarts.length,0);
  }
});
test('a discard during Ocular root resolution is attached to that play',()=>{
  const localCards={...cards,ocular:{id:'ocular',name:'Ocular Occultist',type:'MINION',cost:3,attack:3,health:6}};
  const text=power(`${setup(6)}
FULL_ENTITY - Creating ID=9 CardID=ocular
tag=CONTROLLER value=2
tag=CARDTYPE value=MINION
tag=ZONE value=HAND
BLOCK_START BlockType=PLAY Entity=[id=9 player=2]
TAG_CHANGE Entity=9 tag=ZONE value=PLAY
TAG_CHANGE Entity=7 tag=ZONE value=GRAVEYARD
BLOCK_END`);
  const t=reviewTimeline(text,{friendlyPlayerId:2,coin:true,cards:localCards});
  assert.equal(t.actions[0].turn,3);assert.equal(t.actions[0].handToGraveyard[0].name,'Silverware Golem');
});
test('hand entry records draw turn and resolves a card revealed after its zone change',()=>{
  const text=power(`${setup(4)}
FULL_ENTITY - Creating ID=10 CardID=
tag=CONTROLLER value=2
tag=CARDTYPE value=MINION
tag=ZONE value=DECK
TAG_CHANGE Entity=10 tag=ZONE value=HAND
SHOW_ENTITY - Updating Entity=10 CardID=material`);
  const t=reviewTimeline(text,{friendlyPlayerId:2,coin:true,cards});
  const entries=t.handEntries.filter(e=>e.entityId===10);
  assert.equal(entries.length,1);assert.equal(entries[0].turn,2);
  assert.equal(entries[0].from,'DECK');assert.equal(entries[0].card.name,'Silverware Golem');
});
test('SHOW_ENTITY tag blocks record new hand entry once, without counting a repeated reveal',()=>{
  const text=power(`${setup(4)}
FULL_ENTITY - Creating ID=10 CardID=
tag=CONTROLLER value=2
tag=CARDTYPE value=MINION
tag=ZONE value=DECK
SHOW_ENTITY - Updating Entity=10 CardID=material
tag=CONTROLLER value=2
tag=ZONE value=HAND
SHOW_ENTITY - Updating Entity=10 CardID=material
tag=CONTROLLER value=2
tag=ZONE value=HAND`);
  const t=reviewTimeline(text,{friendlyPlayerId:2,coin:true,cards});
  const entries=t.handEntries.filter(e=>e.entityId===10);
  assert.equal(entries.length,1);assert.equal(entries[0].from,'DECK');
  assert.equal(entries[0].card.name,'Silverware Golem');
});
