// Prints the latest ranked game HDT recorded: "<startTime> <result> <starLevelAfter> <starsAfter> <legendRank>".
// StarLevel: Diamond 10 = 41 ... Diamond 1 = 50, Legend = 51. Exit 0 when we are Legend.
import {readFile} from 'node:fs/promises';
const dir=process.env.APPDATA+'/HearthstoneDeckTracker/';
let games=[];
for(const f of ['DeckStats.xml','DefaultDeckStats.xml']){
 const x=await readFile(dir+f,'utf8').catch(()=>'');
 for(const m of x.matchAll(/<Game>([\s\S]*?)<\/Game>/g)){
  const g={};for(const t of m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g))g[t[1]]=t[2];
  if(g.GameMode==='Ranked')games.push(g);
 }
}
games.sort((a,b)=>a.StartTime<b.StartTime?-1:1);
const g=games.at(-1);
const lvl=Number(g.StarLevelAfter||g.StarLevel),legend=Number(g.LegendRankAfter||g.LegendRank||0);
console.log(`${g.StartTime.slice(0,16)} ${g.Result} level ${lvl} stars ${g.StarsAfter||g.Stars} legend ${legend||'-'}`);
process.exit(lvl>=51||legend>0?0:1);
