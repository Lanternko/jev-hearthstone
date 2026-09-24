import test from 'node:test';
import assert from 'node:assert/strict';
import {plan} from '../src/execute.mjs';
import {contentBox,handGrab} from '../src/layout.mjs';

test('a Battlecry that picks a hand card finds it in the hand left after the play',()=>{
  // Live 2026-09-24: Ocular Occultist clicked where Soul Barrage sat in a 3-card hand; with the
  // Occultist on the board the hand was 2 cards and that spot was empty. Eight dead clicks.
  const box=contentBox(2560,1440);
  const hand=[{entityId:21,name:'Ocular Occultist',CARDTYPE:'MINION',text:'<b>Battlecry:</b> Choose a card in your hand to discard.'},
    {entityId:24,name:'Ocular Occultist',CARDTYPE:'MINION'},{entityId:28,name:'Soul Barrage',CARDTYPE:'SPELL'}];
  const state={me:{hand,board:[{entityId:1,CARDTYPE:'HERO'}]},opponent:{board:[{entityId:2,CARDTYPE:'HERO'}]}};
  const steps=plan(box,state,{type:'POWER',entityId:21,targetId:28});
  const want=handGrab(box,1,2);
  assert.equal(Math.round(steps.at(-1).x),Math.round(want.x));
});
