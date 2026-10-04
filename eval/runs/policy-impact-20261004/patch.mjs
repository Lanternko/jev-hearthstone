import {readFileSync,writeFileSync} from 'node:fs';
const f=process.argv[2];let t=readFileSync(f,'utf8').split(String.fromCharCode(13)).join('');
const start=t.indexOf('export function constrainActions(');const end=t.indexOf('\n}\n',start);
let body=t.slice(start,end);
// [marker inserted BEFORE, label of the stage that just finished, variable]
const marks=[
 ['const saferCopies=','temporaryDiscard','actions'],
 ['let out=freezeThreatFirst','handRetentionCopy','actions'],
 ['if(deadCoin(state)||passiveEggCoin(state)){','freezeThreatFirst','out'],
 [' {\n  const board=state.me.board??[];','deadCoin','out'],
 [' // Game 16 (2026-09-29), turn 20','selfDamageTap','out'],
 [' const dies=suicide(state);','occultistBeforeSwing','out'],
 [' const burn=wastedBurn','suicide','out'],
 [' const split=splitToFace','wastedBurn','out'],
 [' {const od=overdrawWaits','splitToFace','out'],
 [' {const dk=drawKills','overdrawWaits','out'],
 [' {const rest=locationResting','drawKills','out'],
 [' if(!isDH(state))out=weaponFirst','locationResting','out'],
 [' const wasted=wastedFodder','weaponFirst','out'],
 [' out=occultistPick(','wastedFodder','out'],
 [' out=counterFirst(','discardPicks','out'],
 [' {const kept=out.filter(a=>!overflowWaits','counterFirst','out'],
 [' const held=id=>','overflowWaits','out'],
 [' {const menu=out;out=out.filter(a=>!whispersWaits','deadWhispers','out'],
 [' {const menu=out;const kept=out.filter(a=>!whispersEatsPlayable','whispersWaits','out'],
 [' // Only while the buff is still on the table','whispersEatsPlayable','out'],
 [" // Warlock's historical rulings",'whispersWorthCasting','out'],
 [' // An earlier fallback must never resurrect a tap','buffBeforeTap','out'],
 [' // No fallback may resurrect a lethal draw','tapExposesLethal','out'],
 [' if(passiveEggCoin(state))out=out.filter','fatalOrDeadDraw','out'],
 [' const hand=state.me.hand??[];\n const tap=','passiveEggCoin','out'],
 [' if(trace){trace.admission=admission;','safeGate','safe'],
];
for(const [m,l,v] of marks){const i=body.indexOf(m);if(i<0||body.indexOf(m,i+1)>=0)throw Error('marker '+m);
 body=body.slice(0,i)+` globalThis.__S?.(${JSON.stringify(l)},${v});\n`+body.slice(i);}
body=body.replace("if(state.choice)return discardPick(","if(state.choice)return globalThis.__S?.('choicePick',null),discardPick(");
body=body.replace(" const comboFirst=admittedFirstIds(admission);"," globalThis.__S?.('raw',actions);\n const comboFirst=admittedFirstIds(admission);");
t=t.slice(0,start)+body+t.slice(end);writeFileSync(f,t);console.log('patched');
