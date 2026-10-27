// Gate G3: compares the --json lines of src/selfplay-match.mjs runs of a base net and a candidate, and
// refuses to when they cannot be compared: a line without a simulator version, lines played in different
// versions, or two sides that did not play the same opponents, decks, seeds, game counts, look and guard.
// Each side may be several runs (several seeds) whose games do not overlap (match plays game g of a run
// from deal seed+g, so seeds 1 and 2 of 1000 games share 999 deals); their games are added up. The share is model A's wins
// over all games, with its Wilson 95% interval.
//
//   node src/selfplay-compare.mjs --base <run...> --cand <run...> [--beat] [--max-drop <points>]
//       a run is a file holding the output of `selfplay-match.mjs ... --json` (its last line starting with {).
//       --beat: pass only when the candidate's lower bound is above the base's share;
//       --max-drop p: pass only when the candidate's share is at most p points below the base's.
//   exit 0 passed (or no test asked), 1 failed, 2 not comparable.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {wilson} from './selfplay-match.mjs';

export function readRun(path){
  const line=readFileSync(path,'utf8').split(/\r?\n/).filter(l=>l.startsWith('{')).pop();
  if(!line)throw Error(`${path}: no --json line of selfplay-match.mjs`);
  return {path,...JSON.parse(line)};
}

// What has to be the same on both sides for their shares to be compared.
const setting=r=>JSON.stringify([r.b,r.deck,r.look,r.guard??'',r.seed,r.orders.map(o=>[o.first,o.games])]);

export function compare(base,cand,{beat=false,maxDrop=null}={}){
  const problems=[];
  for(const r of [...base,...cand])if(!r.sim)problems.push(`${r.path}: no simulator version (run before gate G2)`);
  const sims=new Set([...base,...cand].map(r=>r.sim).filter(Boolean));
  if(sims.size>1)problems.push(`different simulator versions: ${[...base,...cand].map(r=>`${r.path} ${r.sim}`).join(', ')}`);
  // match deals game g of a run from seed+g: two runs of a side whose seeds are closer than their games
  // replay the same games, and adding them up would count those games twice.
  for(const [name,runs] of [['base',base],['cand',cand]]){
    const span=runs.map(r=>[r.seed,r.seed+Math.max(...r.orders.map(o=>o.games)),r]).sort((x,y)=>x[0]-y[0]);
    for(let i=1;i<span.length;i++)if(span[i][0]<span[i-1][1])
      problems.push(`${name}: ${span[i-1][2].path} (games ${span[i-1][0]}–${span[i-1][1]-1}) and ${span[i][2].path} (from ${span[i][0]}) replay the same games; space the seeds by at least the games`);
  }
  const a=base.map(setting).sort(),b=cand.map(setting).sort();
  if(a.join('\n')!==b.join('\n'))problems.push(`the two sides did not play the same matches:\n  base ${a.join('\n       ')}\n  cand ${b.join('\n       ')}`);
  if(problems.length)return {ok:false,comparable:false,problems};
  const side=runs=>{
    const wins=runs.reduce((n,r)=>n+r.orders.reduce((m,o)=>m+o.a,0),0),games=runs.reduce((n,r)=>n+r.orders.reduce((m,o)=>m+o.games,0),0);
    return {wins,games,share:wins/games,interval:wilson(wins,games)};
  };
  const B=side(base),C=side(cand),drop=100*(B.share-C.share),seeds=new Set(base.map(r=>r.seed)).size;
  const fails=[];
  if(beat&&!(C.interval[0]>B.share))fails.push(`lower bound ${(100*C.interval[0]).toFixed(1)}% is not above the base's ${(100*B.share).toFixed(1)}%`);
  if(maxDrop!=null&&drop>maxDrop)fails.push(`${drop.toFixed(1)} points below the base, more than ${maxDrop}`);
  return {ok:!fails.length,comparable:true,sim:[...sims][0],seeds,base:B,cand:C,drop,fails};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const args=process.argv.slice(2),list=name=>{
    const i=args.indexOf(`--${name}`);
    if(i<0)return [];
    let j=i+1;while(j<args.length&&!args[j].startsWith('--'))j++;
    return args.slice(i+1,j);
  };
  const base=list('base'),cand=list('cand'),drop=list('max-drop')[0];
  if(!base.length||!cand.length)throw Error('usage: node src/selfplay-compare.mjs --base <run...> --cand <run...> [--beat] [--max-drop <points>]');
  const r=compare(base.map(readRun),cand.map(readRun),{beat:args.includes('--beat'),maxDrop:drop==null?null:Number(drop)});
  if(!r.comparable){
    console.log(`NOT COMPARABLE (G3)\n${r.problems.join('\n')}`);
    process.exit(2);
  }
  const show=s=>`${s.wins}/${s.games} ${(100*s.share).toFixed(1)}% (${(100*s.interval[0]).toFixed(1)}–${(100*s.interval[1]).toFixed(1)}%)`;
  console.log(`simulator ${r.sim}, ${r.seeds} seed${r.seeds>1?'s':''}${r.seeds>1?'':' (G3 asks for several)'}\nbase ${show(r.base)}\ncand ${show(r.cand)}\nchange ${(-r.drop).toFixed(1)} points`);
  console.log(r.ok?'PASS':`FAIL: ${r.fails.join('; ')}`);
  process.exit(r.ok?0:1);
}
