// Hover over every element the clicker can target. Moves the cursor only; never clicks.
// Watch the game and adjust the constants in src/layout.mjs until each stop lands.
import * as win from './win.mjs';
import * as X from './layout.mjs';
import {readFileSync} from 'node:fs';
import {snapshot,mulliganCards} from './power.mjs';
import {contentBox} from './layout.mjs';

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const g=await win.geometry();
const box=contentBox(g.width,g.height);
console.log(`client ${g.width}x${g.height} at ${g.originX},${g.originY} | 16:9 box ${Math.round(box.w)}x${Math.round(box.h)} offset ${Math.round(box.x)},${Math.round(box.y)}`);
if(!g.focused){console.log('focusing Hearthstone...');await win.focus()}

const stops=[];
if(process.argv.includes('--live')){
  const cards=Object.fromEntries(JSON.parse(readFileSync(new URL('../data/cards.enUS.json',import.meta.url),'utf8')).map(c=>[c.id,c]));
  const s=(await snapshot(undefined,cards)).state;
  const mine=(s.me.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE));
  const theirs=(s.opponent.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE));
  // During the mulligan the cards sit centred on screen, not in the hand fan, so those stops would mislead.
  const mull=s.choice?.type==='MULLIGAN';
  if(!mull)(s.me.hand??[]).forEach((c,i,a)=>stops.push([`hand ${i+1}/${a.length} ${c.name??c.entityId}`,X.handGrab(box,i,a.length)]));
  mine.forEach((c,i)=>stops.push([`my board ${i+1}/${mine.length} ${c.name??c.entityId}`,X.board(box,i,mine.length,'me')]));
  theirs.forEach((c,i)=>stops.push([`enemy board ${i+1}/${theirs.length} ${c.name??c.entityId}`,X.board(box,i,theirs.length,'you')]));
  const shown=s.choice?.type==='MULLIGAN'?mulliganCards(s.choice.entities):(s.choice?.entities??[]);
  shown.forEach((c,i,a)=>stops.push([`choice ${i+1}/${a.length} ${c.name??c.entityId}`,
    s.choice.type==='MULLIGAN'?X.mulligan(box,i,a.length):X.discover(box,i,a.length)]));
}else{
  for(const n of [3,7,10])for(let i=0;i<n;i++)stops.push([`hand ${i+1}/${n}`,X.handGrab(box,i,n)]);
  for(const n of [1,4,7])for(let i=0;i<n;i++)stops.push([`my board ${i+1}/${n}`,X.board(box,i,n,'me')]);
  for(const n of [1,4,7])for(let i=0;i<n;i++)stops.push([`enemy board ${i+1}/${n}`,X.board(box,i,n,'you')]);
  for(let i=0;i<4;i++)stops.push([`mulligan ${i+1}/4`,X.mulligan(box,i,4)]);
  for(let i=0;i<3;i++)stops.push([`discover ${i+1}/3`,X.discover(box,i,3)]);
}
stops.push(['my hero',X.hero(box,'me')],['enemy hero',X.hero(box,'you')],
  ['my hero power',X.heroPower(box,'me')],['enemy hero power',X.heroPower(box,'you')],
  ['mulligan confirm',X.mulliganConfirm(box)],['end turn',X.endTurn(box)]);

for(const [label,p] of stops){
  await win.move(p.x,p.y);
  console.log(`${label.padEnd(28)} -> ${Math.round(p.x)},${Math.round(p.y)}`);
  await wait(650);
}
win.stop();
