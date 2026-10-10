import fs from 'node:fs';
import readline from 'node:readline';
import {createParser,publicState,candidates} from '../src/power.mjs';
const defs=Object.fromEntries(JSON.parse(fs.readFileSync('data/cards.enUS.json','utf8')).map(c=>[c.id,c]));
const p=createParser();
const file='D:/遊戲/Hearthstone/Logs/Hearthstone_2026_10_01_02_28_59/Power_old.log';
for await(const line of readline.createInterface({input:fs.createReadStream(file)})){
 if(line.includes('06:46:')&&line.includes('BLOCK_START BlockType=ATTACK')&&line.includes('cardId=CATA_493')){
  const parsed=p.result(),state=publicState(parsed,2,defs),options=candidates(parsed,state);
  const source={batchGame:137,ownTurn:4,engineTurn:state.turn,log:file,attackLine:line,replayUrl:'https://hsreplay.net/uploads/upload/REDACTED/'};
  fs.writeFileSync('test/fixtures/user-rulings/game137-ongoing-effect-trade.json',JSON.stringify({source,state,options},null,2)+'\n');
  console.log(JSON.stringify({source,mine:state.me.board.map(c=>[c.name,c.ATK,c.HEALTH,c.DAMAGE]),enemy:state.opponent.board.map(c=>[c.name,c.ATK,c.HEALTH]),options:options.length}));break;
 }
 p.feed(line);
}

