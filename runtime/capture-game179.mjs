import fs from 'node:fs';
import readline from 'node:readline';
import {createParser,publicState,candidates} from '../src/power.mjs';
const defs=Object.fromEntries(JSON.parse(fs.readFileSync('data/cards.enUS.json','utf8')).map(c=>[c.id,c]));
const p=createParser(),seen=new Set();
const file='D:/遊戲/Hearthstone/Logs/Hearthstone_2026_10_01_14_25_31/Power.log';
for await(const line of readline.createInterface({input:fs.createReadStream(file)})){
 const key=line.includes('18:56:')&&line.includes('cardId=VAC_940')?'discover-first':line.includes('18:57:')&&line.includes('cardId=DMF_119')?'draw-before-whispers':null;
 if(key&&!seen.has(key)&&line.includes('GameState.DebugPrintPower() - BLOCK_START BlockType=PLAY')){
  const parsed=p.result(),state=publicState(parsed,2,defs),options=candidates(parsed,state);
  const source={batchGame:179,ownTurn:Math.ceil(state.turn/2),engineTurn:state.turn,log:file,playLine:line};
  fs.writeFileSync(`test/fixtures/user-rulings/game179-${key}.json`,JSON.stringify({source,state,options},null,2)+'\n');
  console.log(JSON.stringify({source,hand:state.me.hand.map(c=>[c.name,c.COST]),mana:state.me.mana,options:options.length}));seen.add(key);if(seen.size===2)break;
 }
 p.feed(line);
}
