import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createParser} from '../src/power.mjs';

const P='D 10:03:41.9295544 GameState.DebugPrintOptions() - ';
test('a read that ends inside an options block is flagged, so snapshot waits for the rest', () => {
  const p=createParser();
  p.feed(`${P}id=12\n${P}option 0 type=END_TURN mainEntity= error=NONE\n${P}option 1 type=POWER mainEntity=43 error=NONE\n`);
  assert.equal(p.result().optionsOpen,true);
  p.feed(`${P}option 2 type=POWER mainEntity=57 error=NONE\nD 10:03:42.0000000 GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION\n`);
  assert.equal(p.result().optionsOpen,false);
  assert.equal(p.result().options.items.length,3);
});
