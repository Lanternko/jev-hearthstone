import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawImpact,drawRiskText} from '../src/draw-risk.mjs';
import {constrainActions,overdraws,worstDraw} from '../src/policy.mjs';
import {fromState,apply} from '../src/sim.mjs';
import {createParser,publicState} from '../src/power.mjs';
const recorded=JSON.parse(readFileSync(new URL('./fixtures/user-rulings/game46-draw-risk.json',import.meta.url)));
const state=(deck,hazards=[],hand=9,fatigue=0)=>({me:{deckCount:deck,drawHazards:hazards,fatigue,hand:Array.from({length:hand},(_,i)=>({entityId:i+100}))}});

test('game 46: two auto-casts give no hand card and cause six damage plus first fatigue',()=>{
 const r=drawImpact(recorded.state,1);
 assert.equal(r.cardsMax,0);assert.equal(r.damageMin,7);assert.equal(r.fatigueDraws,1);
 const tap=recorded.state.me.board.find(c=>c.CARDTYPE==='HERO_POWER');
 assert.ok(recorded.options.some(a=>a.entityId===tap.entityId));
 assert.ok(!constrainActions(recorded.state,recorded.options).some(a=>a.entityId===tap.entityId));
 const s=fromState(recorded.state,recorded.options),a=apply(s,{kind:'power'});
 assert.equal(a.s.drawnUnknown,0);assert.equal(a.s.me.find(b=>b.type==='HERO').hp,10);
 assert.equal(a.exact,false);
 assert.match(drawRiskText(recorded.state,1),/at most 0 new hand card/);
});

test('mixed ordinary cards and auto-casts expose bounds without assuming order',()=>{
 const r=drawImpact(state(4,[3,3],7),1);
 assert.equal(r.usable,2);assert.equal(r.cardsMax,1);assert.equal(r.damageMin,0);assert.equal(r.damageMax,6);
 const exhausted=drawImpact(state(4,[3,3],7),3);
 assert.equal(exhausted.cardsMax,2);assert.equal(exhausted.damageMin,7);
 const filling=drawImpact(state(4,[3,3],9),3);
 assert.equal(filling.damageMin,0,'ordinary cards can fill the hand before later Shreds burn');
 assert.equal(filling.damageMax,7,'Shreds drawn first still expose seven damage');
});

test('fatigue continues from the current counter and cannot masquerade as resources',()=>{
 const r=drawImpact(state(0,[],8,3),2);
 assert.equal(r.damageMin,9);assert.equal(r.cardsMax,0);
 assert.equal(worstDraw(state(0,[],8,3),2),9);
});

test('hand capacity deducts a cast card, respects unknown deck size, and handles full-hand burning',()=>{
 const s=state(8,[],9);assert.equal(drawImpact(s,3,{played:true}).burnMax,1);
 assert.equal(drawImpact(s,1).burnMax,0);
 assert.equal(drawImpact(state(8,[],10),1).burnMax,1);
 assert.equal(drawImpact(state(null),1).usable,null);
 assert.equal(overdraws(state(2,[3,3]),{text:'Draw a card.'},false),true);
 assert.equal(drawImpact(state(2,[3,3],10),1).damageMin,0,'do not guarantee auto-casts from a full hand');
});

test('a fatal draw cannot return through fallback when it is the only printed action',()=>{
 const s=structuredClone(recorded.state),tap=s.me.board.find(c=>c.CARDTYPE==='HERO_POWER');
 s.me.board.find(c=>c.CARDTYPE==='HERO').DAMAGE=22;
 assert.deepEqual(constrainActions(s,[{id:'tap',entityId:tap.entityId}]),[]);
});

test('generated hidden Shreds are known from the visible Continuity source; fatigue is public',()=>{
 const p=createParser();
 const feed=lines=>p.feed(lines.map(s=>'GameState.DebugPrintPower() - '+s).join('\n'));
 feed(['CREATE_GAME','GameEntity EntityID=1','Player EntityID=2 PlayerID=1','tag=CONTROLLER value=1','tag=FATIGUE value=3',
  'Player EntityID=3 PlayerID=2','tag=CONTROLLER value=2',
  'BLOCK_START BlockType=POWER Entity=[id=10 cardId=TIME_026 player=1]',
  'FULL_ENTITY - Creating ID=20 CardID=','tag=CONTROLLER value=1','tag=ZONE value=DECK',
  'FULL_ENTITY - Creating ID=21 CardID=','tag=CONTROLLER value=1','tag=ZONE value=DECK','BLOCK_END',
  'FULL_ENTITY - Creating ID=22 CardID=','tag=CONTROLLER value=1','tag=ZONE value=DECK']);
 const s=publicState(p.result(),1);
 assert.deepEqual(s.me.drawHazards,[3,3]);assert.equal(s.me.fatigue,3);
 assert.equal(s.me.deckCount,3,'unknown cards outside Continuity are not identified as Shreds');
 assert.equal(s.opponent.drawHazards,undefined);
 feed(['TAG_CHANGE Entity=20 tag=ZONE value=GRAVEYARD']);assert.deepEqual(publicState(p.result(),1).me.drawHazards,[3]);
 feed(['CREATE_GAME']);assert.deepEqual(publicState(p.result(),1).me.drawHazards,[]);
});
