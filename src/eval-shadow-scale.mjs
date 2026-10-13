// Two measures of the self-play network on real positions that do not lean on what Jev played:
//   rulings  the user's own answers in eval/labels.json: 1 for a best action, 0.5 for an acceptable
//            one, beside what Jev played at the time on the same positions;
//   value    whether the network's estimate tells a game we went on to win from one we lost, over
//            the archived games in runtime/ranked-*, beside a plain count of health and stats
//            on the same turns, and how far the answers move once the discards so far are counted
//            (the live hook sent 0 until the parser learned to count them).
//   npm run shadow-scale            both
//   npm run shadow-scale -- rulings | value
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createParser,publicState,candidates} from './power.mjs';
import {loadNet} from './selfplay-net.mjs';
import {cardDb,loadList} from './selfplay.mjs';
import {shadowView} from './selfplay-shadow.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const cards=cardDb(),list=loadList('warlock-discard'),net=loadNet();
const pct=(a,b)=>b?`${(100*a/b).toFixed(0)}%`:'-';

// A stored position has no parse of the log, so the little shadowView reads from one is rebuilt:
// our cards that have left the deck, and who went first (we are asked on our own turn, and the
// first player's turns are the odd ones).
function parsedOf(state){
  const me=state.me.playerId,entities=new Map();
  for(const [zone,cs] of [['HAND',state.me.hand??[]],['PLAY',state.me.board??[]]])
    for(const c of cs)entities.set(c.entityId,{id:c.entityId,cardId:c.cardId,tags:{CONTROLLER:String(me),ZONE:zone,CARDTYPE:c.CARDTYPE}});
  entities.set(-1,{id:-1,playerId:me,tags:{CONTROLLER:String(me),FIRST_PLAYER:state.turn%2?'1':'0'}});
  return {entities};
}

async function rulings(){
  const positions=JSON.parse(await readFile(new URL('../eval/positions.json',import.meta.url),'utf8'));
  const labels=JSON.parse(await readFile(new URL('../eval/labels.json',import.meta.url),'utf8'));
  const set=positions.filter(p=>labels[p.id]&&!labels[p.id].skip&&labels[p.id].best.length);
  const points=(l,id)=>l.best.includes(id)?1:l.ok.includes(id)?0.5:0;
  const name=(p,id)=>p.options.find(o=>o.id===id)?.label??id;
  let n=0,net1=0,jev=0,skipped=0;
  const lines=[];
  for(const p of set){
    const l=labels[p.id],acts=p.options.map(({label,description,...a})=>a);
    const view=shadowView(parsedOf(p.state),p.state,acts,{cards,list});
    if(!view){skipped++;continue}
    const r=net.rank(view.s,view.legal),ids=r.steps.map(x=>acts[view.legal.indexOf(x.move)].id);
    const got=points(l,ids[0]),then=points(l,p.then.choice),at=ids.findIndex(id=>l.best.includes(id));
    n++;net1+=got;jev+=then;
    lines.push(`  ${got===1?'o':got?'~':'x'} ${p.id} [${p.tags}] ${p.state.opponent.heroClass} t${p.state.turn}  net: ${name(p,ids[0])} (${r.steps[0].p.toFixed(2)})`
      +(got<1?`  | best: ${l.best.map(id=>name(p,id)).join(' / ')} (net rank ${at+1} of ${ids.length})`:'')+`  | Jev then: ${then}`);
  }
  console.log(`rulings: ${n} position(s) scored, ${skipped} skipped (mulligan or no menu)`);
  console.log(`  network ${net1}/${n} (${pct(net1,n)})   Jev at the time ${jev}/${n} (${pct(jev,n)})`);
  for(const x of lines)console.log(x);
}

// The chance that a position from a won game is valued above one from a lost game (0.5 = no better than a coin).
function auc(rows){
  const s=[...rows].sort((a,b)=>a.v-b.v);
  let rank=0,won=0;
  for(let i=0;i<s.length;){
    let j=i;while(j<s.length&&s[j].v===s[i].v)j++;
    const mid=(i+j+1)/2;
    for(let k=i;k<j;k++)if(s[k].won){rank+=mid;won++}
    i=j;
  }
  const lost=s.length-won;
  return won&&lost?(rank-won*(won+1)/2)/(won*lost):NaN;
}

// Health and stats on the table, ours less theirs: what the estimate has to beat to be worth having.
function material(state){
  const side=x=>x.board.reduce((n,c)=>c.CARDTYPE==='HERO'?n+(c.HEALTH??0)-(c.DAMAGE??0)+(c.ARMOR??0)
    :c.CARDTYPE==='MINION'?n+(c.ATK??0)+(c.HEALTH??0)-(c.DAMAGE??0):n,0);
  return side(state.me)-side(state.opponent);
}

async function value(){
  const rows=[];
  const dirs=(await readdir(join(root,'runtime'),{withFileTypes:true}).catch(()=>[])).filter(d=>d.isDirectory()&&d.name.startsWith('ranked-')).map(d=>d.name).sort();
  let games=0,undecided=0;
  for(const d of dirs)for(const f of (await readdir(join(root,'runtime',d))).filter(f=>/^game-\d+-Power\.log$/.test(f)).sort()){
    const text=await readFile(join(root,'runtime',d,f),'utf8');
    if(!text.includes('GameState.DebugPrintPower() - CREATE_GAME'))continue;
    const p=createParser(),mine=[];
    let me,turn=-1;
    for(const line of text.split(/\r?\n/)){
      const s=line.match(/GameState\.DebugPrintPower\(\) -\s*(.*)/)?.[1];
      // One reading a turn, at our first move of it: the estimate before we have done anything.
      if(s&&/^BLOCK_START BlockType=(PLAY|ATTACK)/.test(s)){
        const parsed=p.result();me=parsed.localPlayer;
        if([1,2].includes(me)){
          const state=publicState(parsed,me,cards);
          if(state.me.current&&state.turn!==turn){
            const view=shadowView(parsed,state,candidates(parsed,state),{cards,list});
            if(view){
              turn=state.turn;
              const r=net.rank(view.s,view.legal),d=[view.s.discardCount,view.s.them.discardCount];
              // What the hook sent before the parser counted discards.
              view.s.discardCount=view.s.them.discardCount=0;
              const k=net.rank(view.s,view.legal);
              mine.push({v:r.value,blind:k.value,moved:k.steps[0].move!==r.steps[0].move,d,m:material(state),turn,mirror:state.opponent.heroClass==='WARLOCK'});
            }
          }
        }
      }
      p.feed(line);
    }
    const end=[1,2].includes(me)?publicState(p.result(),me,cards).me.playstate:null;
    if(end!=='WON'&&end!=='LOST'){undecided++;continue}
    games++;
    for(const r of mine)rows.push({...r,won:end==='WON'});
  }
  console.log(`value: ${games} decided game(s), ${undecided} without a result, ${rows.length} turn(s)`);
  const mean=rs=>rs.length?(rs.reduce((n,r)=>n+r.v,0)/rs.length).toFixed(2):'-';
  const line=(title,rs)=>{
    const w=rs.filter(r=>r.won),l=rs.filter(r=>!r.won);
    console.log(`  ${title.padEnd(22)} turns ${String(rs.length).padStart(5)}  won ${pct(w.length,rs.length).padStart(4)}  mean value in won ${mean(w)} / lost ${mean(l)}  AUC ${auc(rs).toFixed(3)}`
      +`  health and stats ${auc(rs.map(r=>({v:r.m,won:r.won}))).toFixed(3)}  without discards ${auc(rs.map(r=>({v:r.blind,won:r.won}))).toFixed(3)}`);
  };
  line('all',rows);
  for(const m of [true,false]){
    const rs=rows.filter(r=>r.mirror===m);
    line(m?'mirror':'other classes',rs);
    for(const [a,b] of [[1,6],[7,12],[13,99]])line(`  turns ${a}-${b===99?'':b}`,rs.filter(r=>r.turn>=a&&r.turn<=b));
  }

  const some=rows.filter(r=>r.d[0]||r.d[1]);
  console.log(`discards: ${some.length} of ${rows.length} turn(s) come after a discard (ours up to ${Math.max(0,...rows.map(r=>r.d[0]))}, theirs up to ${Math.max(0,...rows.map(r=>r.d[1]))})`);
  console.log(`  counting them changes the first choice on ${some.filter(r=>r.moved).length} (${pct(some.filter(r=>r.moved).length,some.length)}) and moves the value by ${(some.reduce((n,r)=>n+Math.abs(r.blind-r.v),0)/(some.length||1)).toFixed(3)} on average`);
}

const which=process.argv[2];
if(which!=='value')await rulings();
if(which!=='rulings')await value();
