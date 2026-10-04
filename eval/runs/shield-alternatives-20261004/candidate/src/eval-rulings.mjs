// Adds the user's rulings on real games to the evaluation set: each position the user judged is
// taken from runtime/decisions.jsonl, tagged `ruling`, and labelled with the user's own answer.
// These are the positions the hard rules in policy.mjs were written for, so when a rule and a
// ruling disagree, `npm run eval` shows it. Re-running is safe: a position already in the set
// keeps its id, gains the tag, and its label is rewritten from the list below.
//
// A recorded menu is the one Jev saw, after the hard rules had filtered it. When the answer the
// user gave had been filtered out (Life Tap hidden behind a card, Duke of Below hidden behind a
// draw), it is added back as a synthetic option `x…` so the label can name it.
import {readFile,writeFile} from 'node:fs/promises';
import {criteria} from './describe.mjs';
import {label} from './eval-label-text.mjs';

const positionsFile=new URL('../eval/positions.json',import.meta.url);
const labelsFile=new URL('../eval/labels.json',import.meta.url);
const log=(await readFile(new URL('../runtime/decisions.jsonl',import.meta.url),'utf8'))
 .trim().split('\n').map(l=>JSON.parse(l));
const positions=await readFile(positionsFile,'utf8').then(JSON.parse).catch(()=>[]);
const labels=await readFile(labelsFile,'utf8').then(JSON.parse).catch(()=>({}));

// Synthetic options, found in the recorded state by name.
const power=st=>(st.me.board??[]).find(c=>c.CARDTYPE==='HERO_POWER');
const inHand=(st,name)=>(st.me.hand??[]).find(c=>c.name===name);
const enemyHero=st=>(st.opponent.board??[]).find(c=>c.CARDTYPE==='HERO');
const add={
 lifeTap:st=>({id:'xtap',type:'POWER',entityId:power(st).entityId,synthetic:true}),
 play:name=>st=>({id:'xplay',type:'POWER',entityId:inHand(st,name).entityId,synthetic:true}),
 face:name=>st=>({id:'xface',type:'POWER',entityId:inHand(st,name).entityId,targetId:enemyHero(st).entityId,synthetic:true}),
};

// game: the user's own numbering of the day. best/ok: option ids; say: the user's words.
const RULINGS=[
 {row:425,game:'09-25 #6',add:add.face('Soulfire'),best:['xface'],ok:['o0'],
  say:'要攻擊選擇對手的臉 -- a damage spell never aims at our own hero'},
 {row:436,game:'09-25 #7',best:['m6'],ok:['m7'],
  say:'Soul Barrage (kept by 18% of players) is tossed in the mulligan'},
 {row:440,game:'09-25 #7',best:['c3e85'],ok:[],
  say:'應該是要棄掉行尸（因為場面低）'},
 {row:447,game:'09-25 #8',best:['o4','o5'],ok:['o1','o2'],
  say:'應該是打手下，而不是離斬殺很遠還用法術打臉 -- Soul Barrage into an empty board at 30 hp'},
 {row:515,game:'09-26 #10, our turn 4',add:add.lifeTap,best:['xtap','o1','o2','o4'],ok:[],
  say:'應該先抽牌再出牌 or 打 1+3 費'},
 {row:530,game:'09-26 #10',best:['o5'],ok:[],say:'先抽牌才對。白白浪費一個魔眼'},
 {row:534,game:'09-26 #10',best:['o3'],ok:[],say:'一樣要先抽牌再打 buff'},
 {row:560,game:'09-26 #11, our turn 4',best:['o1t0'],ok:[],say:'應該先用武器攻擊，以維持場面的血量'},
 {row:586,game:'09-26 #12, our turn 4',best:['o1'],ok:[],say:'應該打連鎖。因為打完連鎖，最低費變成魔像'},
 {row:616,game:'09-26 #13, our turn 4',best:['o7t6'],ok:[],
  say:'應該棄掉靈魂彈幕，因為 325 本來就會在鴨嘴龍死掉後棄置'},
 {row:621,game:'09-26 #13, our turn 5',best:['o1','o4'],ok:[],say:'先打公爵，確保隨機棄牌不會棄掉有價值的公爵'},
 {row:1187,game:'09-29 #15, our turn 6',add:add.play('Boneweb Egg'),best:['xplay'],ok:[],
  say:'Frozen hero: Chronoclaws cannot discard this turn, so the Eggs are played, not kept'},
 {row:1242,game:'09-29 #16, turn 20',best:['o1'],ok:[],
  say:'遇到聖盾手下，應該先讓低攻擊的人先破盾 -- Occultist before the hero swings into the shield'},
 {row:1308,game:'09-29 #19, turn 10',add:add.play('Duke of Below'),best:['xplay'],ok:[],
  say:'為何一直不打地獄公爵？明明就成長到很大了'},
 {row:1313,game:'09-29 #19, turn 14',best:['o5t0','o8t0'],ok:[],
  say:'沒有自殺 1/1 以打出公爵 / 11 撞掉聖盾 再用公爵衝刺最佳'},
 {row:1359,game:'09-29 #21, turn 8',best:['c4e142'],ok:[],say:'應該棄靈魂彈幕。然後 0 費繼續找牌'},
];

const byFp=new Map(positions.map(p=>[p.fingerprint,p]));
let added=0;
for(const r of RULINGS){
 const rec=log[r.row],st=rec.state;
 const options=[...rec.options,...(r.add?[r.add(st)]:[])];
 for(const id of [...r.best,...r.ok])
  if(!options.some(o=>o.id===id))throw new Error(`row ${r.row}: no option ${id}`);
 let p=byFp.get(st.decisionFingerprint);
 if(!p){
  const desc=criteria(st,options);
  p={id:`g${st.gameNumber}t${st.turn}r${r.row}`,row:r.row,fingerprint:st.decisionFingerprint,tags:[],state:st,
   options:options.map(a=>({...a,label:label(st,a),description:desc[a.id]?.description??''})),
   then:{choice:rec.action.id,plan:rec.plan?.text??null,confidence:rec.metadata?.typesafe?.confidence?.move??null,
    probabilities:rec.answers?.move?.probabilities??null}};
  positions.push(p);byFp.set(p.fingerprint,p);added++;
 }
 if(!p.tags.includes('ruling'))p.tags.push('ruling');
 labels[p.id]={best:r.best,ok:r.ok,skip:false,note:`${r.game}: ${r.say}`};
}
await writeFile(positionsFile,JSON.stringify(positions,null,1));
await writeFile(labelsFile,JSON.stringify(labels,null,1));
console.log(`${RULINGS.length} ruling(s), ${added} new position(s), ${positions.length} in eval/positions.json`);
