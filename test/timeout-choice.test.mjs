// 2026-10-05 batch game 48: the turn timer ran out with a Discover open; the server picked for us.
// No SendChoices of ours follows, yet the choice is closed -- it must not be clicked again.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePower} from '../src/power.mjs';

const P='D 09:40:26.0468118 GameState.';
const lines=(...l)=>l.map(x=>x+'\n').join('');
const offer=lines(
 'D 09:35:15.0181931 GameState.DebugPrintPower() - CREATE_GAME',
 P+'DebugPrintEntityChoices() - id=3 Player=Me#1 TaskList=373 ChoiceType=GENERAL CountMin=1 CountMax=1',
 P+'DebugPrintEntityChoices() -   Entities[0]=[entityName=Soul Barrage id=113 zone=SETASIDE zonePos=0 cardId=RLK_534 player=2]',
);
const chosen=lines(
 P+'DebugPrintEntitiesChosen() - id=3 Player=Me#1 EntitiesCount=1',
 P+'DebugPrintEntitiesChosen() -   Entities[0]=[entityName=Soul Barrage id=113 zone=SETASIDE zonePos=0 cardId=RLK_534 player=2]',
);

test('an offered choice is open until the server resolves it',()=>{
 assert.ok(parsePower(offer).choices.has(3));
});

test('the server resolving a choice closes it without a SendChoices of ours',()=>{
 const p=parsePower(offer+chosen);
 assert.ok(!p.choices.has(3));
 assert.equal(p.chosenResults.get(3).count,1);
});
