// Do the "plainly better" ends really win more? Both ends of a pair are played on by the same scripted players with the same dice.
import {readFileSync} from 'node:fs';
import {loadList,rushPolicy,playout,winner} from '../../src/selfplay.mjs';
import {turnTree,replay} from '../../src/selfplay-quiz.mjs';
const data=JSON.parse(readFileSync(process.argv[2])),lists=data.decks.map(loadList),N=+process.argv[3]||150,K=+process.argv[4]||30;
const acc={};
const play=(s,seat,k)=>{const t={...structuredClone({...s,game:undefined}),game:s.game};t.seed=(s.seed^Math.imul(k+1,2654435761))>>>0;const r=playout(t,rushPolicy(k));const w=winner(r.s??r);return w===seat?1:w==='draw'?.5:0};
let done=0;
for(const q of data.bank.slice(0,N)){
  const root=replay(lists,q),tree=turnTree(root);if(!tree)continue;
  const spread=(xs,n)=>xs.filter((_,i,a)=>i%Math.ceil(a.length/n)===0).slice(0,n);
  const pick=[...spread(tree.pairs.filter(p=>p.what==='hero'),2),...spread(tree.pairs.filter(p=>p.what!=='hero'),4)];
  for(const p of pick){
    let g=0,b=0;
    for(let k=0;k<K;k++){g+=play(p.good.s,root.seat,k);b+=play(p.bad.s,root.seat,k)}
    const d=(g-b)/K,a=acc[p.what]??={n:0,sum:0,sq:0,g:0,b:0};
    a.n++;a.sum+=d;a.sq+=d*d;a.g+=g/K;a.b+=b/K;
  }
  if(++done%30===0)console.error(done);
}
for(const [k,a] of Object.entries(acc)){const m=a.sum/a.n,se=Math.sqrt((a.sq/a.n-m*m)/a.n);
  console.log(`${k}: ${a.n} pairs, better end wins ${(100*a.g/a.n).toFixed(1)}%, worse end ${(100*a.b/a.n).toFixed(1)}%, difference ${(100*m).toFixed(2)} ± ${(100*se).toFixed(2)} pp`)}
