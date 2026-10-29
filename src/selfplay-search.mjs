// A look ahead to the end of the acting seat's own turn, for a policy whose value network lives in
// another process (train/ppo.py). The policy alone picks one step at a time and learns the order of
// a turn only from the final result; here every order the beam keeps is played out in the simulator
// and judged by the position it hands over.
//
// What the acting player cannot know is dealt afresh for each sample (redeal), so a line is never
// chosen for the card the real deck happens to hold next. Each sample runs a beam over the steps of
// this turn: positions the network cannot tell apart are one node, a line is finished
// when the turn is handed over or the game is won, and the rest are ranked by the network's value.
// A first step scores the best finished line that starts with it, averaged over the samples.
// (Every beam finishes a line: 'end' is always a step.)
//
// Lines that differ only in the order of their steps are not left to the network. Its values for two
// such ends differ by more than the order is worth, in either direction, so the search used to pick
// an order at random and the policy trained on it learned to swing before the buff. Two rules:
//   - in the beam, among lines of the same steps that leave the same hand, only those that leave
//     the most on the board are kept (keepBestOrder);
//   - a finished line counts for its first step only if no later step of it, played first instead,
//     leaves more on the board (reordered). The beam may never have held that better order; it is
//     played out here, and its first step is credited with at least the value of the line it beats.
//
// With turns=2 the search looks one turn further for the first steps that score best: the other
// side's next turn is played out from the position each of them hands over, by another network's
// policy (`reply`, as loadNet in src/selfplay-net.mjs gives it) along its `replies` best first steps
// and greedily after them, and the step scores the worst of what those leave us, by our network.
//
// A position where the other side is to play is valued, by default, from its chair (the network's
// value for the seat to act, with the sign turned). With `ownValue` it is valued from ours instead
// (seatView: the same position seen from our chair, the sign kept): a network trained only against
// other networks (train/ppo.py --opp) has learned to value its own chair, not theirs (F-882).
import {moves,apply,roll,handCard,hpOf,flip} from './sim.mjs';
import {winner,cardDb,rawCard} from './selfplay.mjs';
import {encode} from './selfplay-encode.mjs';
import {discardGrowth} from './discard-model.mjs';
import {shape,beaten} from './selfplay-dominance.mjs';

// The same position with the hidden half dealt afresh from `seed`: the order of both decks, and
// which of the other side's own cards sit in its hand rather than its deck. The Coin and other
// made cards stay where they are; a drawn card grows by its side's discards as a real draw does.
export function redeal(s,seed,cards=cardDb()){
  const dice={seed:seed|0},th=s.them;
  const mix=list=>{
    const a=[...list];
    for(let i=a.length-1;i>0;i--){const j=roll(dice,i+1);[a[i],a[j]]=[a[j],a[i]]}
    return a;
  };
  const hidden=th.hand.filter(c=>c.id>0&&!c.temp);
  const pool=mix([...hidden.map(c=>rawCard(cards[c.raw.cardId],c.id)),...th.deck]);
  const drawn=pool.slice(0,hidden.length).map(raw=>{
    const c=handCard(raw,true),g=discardGrowth(c)*(th.discardCount??0);
    if(g){c.atk+=g;c.hp+=g;c.raw={...c.raw,ATK:c.atk,HEALTH:c.hp}}
    return c;
  });
  return {...s,seed:roll(dice,0x7fffffff),deck:mix(s.deck),
    them:{...th,hand:[...th.hand.filter(c=>!hidden.includes(c)),...drawn],deck:pool.slice(hidden.length)}};
}

// Two positions are one node when the network is shown the same thing: the encoding names cards,
// not entities, so the two copies of a card do not split a line in two. A turn handed over is seen
// from the other chair, where our own hand and deck are only counts, so those are named beside it.
const names=cs=>cs.map(c=>c.name).sort().join();

// A position where the other side is to play, seen from the chair that just handed the turn over
// (or, in a turn of two, the chair whose turn will come back): flip of src/sim.mjs swaps every field
// of the seat (hand, deck, mana, clocks, the Slime 'em! pile, Blessing of the Moon...) and the two
// boards. Three things belong to the acting chair rather than a seat and are put back for ours: a
// pick under way (choice) and a Kazakus pair (kaz) are the other side's, so there is none; and the
// turn counter goes back to the turn we played, so that seat and turn agree as in every position
// the network was trained on in its own chair.
// The turn is over, so nothing of it is left to spend: no mana, nobody on our side ready to attack
// (the hero too), no location ready. Shown as they were left, unspent mana and minions that never
// attacked read to the network as the start of a turn still to play, and the look ahead then
// prefers to end the turn early (F-882, 2026-10-29: plain swap 0.2.0 15/60 and v10 18/60 vs egg 0.1.0,
// seed 3000001; with the turn spent 36 and 34). The next turn's refresh is the beginTurn of that
// seat, which this does not play.
export function seatView(s){
  const v={...flip(s),choice:null,kaz:null,turn:(s.turn??0)-1};
  return {...v,mana:0,me:v.me.map(b=>({...b,canAttack:false})),sites:(v.sites??[]).map(x=>({...x,ready:false}))};
}
// What the network is shown of a position t to value, and the sign of its answer for `seat`.
export const valueAsk=(t,seat,vocab,own)=>t.seat===seat||!own?{obs:encode(t,[],vocab).obs,sign:t.seat===seat?1:-1}:{obs:encode(seatView(t),[],vocab).obs,sign:1};
const key=(s,obs,handed)=>obs.join()+(handed?`|${names(s.them.hand)}|${names(s.them.deck)}`:`|${s.choice?.options.length??''}`);

// A step by the names of what it moves, so that the same steps in another order read the same.
function stepName(s,m){
  const all=[...s.me,...s.opp,...s.hand],name=id=>id==null?'':all.find(c=>c.id===id)?.name??id;
  return `${m.kind} ${name(m.id)}>${name(m.targetId)}`;
}

// What a line leaves standing, for the seat that played it: its own hero and minions less the other
// side's. A minion counts its Attack and its Health, a hero its Health.
function standing(s,handed){
  const sum=side=>side.reduce((n,b)=>b.type==='HERO'?n+hpOf(b):b.hp>0?n+b.atk+hpOf(b):n,0);
  return handed?sum(s.opp)-sum(s.me):sum(s.me)-sum(s.opp);
}

// Drop every line that another line of the same steps, leaving the same hand, beats on the board.
// The line that stays is worth at least what any it replaces was guessed to be.
export function keepBestOrder(nodes){
  const groups=new Map();
  for(const n of nodes)if(n.order!=null)(groups.get(n.order)??groups.set(n.order,[]).get(n.order)).push(n);
  const gone=new Set();
  for(const g of groups.values()){
    const top=Math.max(...g.map(n=>n.board)),lost=g.filter(n=>n.board<top);
    if(!lost.length)continue;
    const lift=Math.max(...lost.map(n=>n.v));
    for(const n of g)if(n.board<top)gone.add(n);else if(n.v<lift)n.v=lift;
  }
  return gone.size?nodes.filter(n=>!gone.has(n)):nodes;
}

// With `dominance`: drop every finished line that hands over a position another finished line plainly
// beats (src/selfplay-dominance.mjs), whatever their steps. Two lines are compared only when they
// part after the last dice either rolled (the same `anchor`): a better random outcome is not a
// better line. The line that stays is worth at least what any it replaces was guessed to be.
export function keepPlain(lines){
  const lost=beaten(lines.map(n=>{const x=shape(n.s);x.rest=`${n.anchor}|${x.rest}`;return x}));
  if(!lost.length)return lines;
  const gone=new Set();
  for(const [i,j] of lost){gone.add(lines[i]);if(lines[j].v<lines[i].v)lines[j].v=lines[i].v}
  return lines.filter(n=>!gone.has(n));
}

const sameStep=(a,b)=>a.kind===b.kind&&a.id===b.id&&a.targetId===b.targetId;

// The first steps that do better than the first step of this finished line by the line's own steps
// in another order: [index in legal, value]. Two kinds of order are tried, the rest left as it was:
// a later step moved to the front (the buff before the swing), and the first step put off until
// after a later one (the swing held back until the minion and the buff are both down). An order
// counts when it can be played, leaves the same hand and more on the board, or wins the game.
function reordered(root,n,legal,seat){
  const out=[],p=n.path,last=p.length-1;                       // p[last] hands the turn over
  const orders=[];
  for(let j=1;j<last;j++)orders.push([...p.slice(j,j+1),...p.slice(0,j),...p.slice(j+1)]);
  for(let k=2;k<last;k++)orders.push([...p.slice(1,k+1),p[0],...p.slice(k+1)]);
  for(const order of orders){
    const at=legal.findIndex(m=>sameStep(m,order[0]));
    if(at<0)continue;
    let s=root,won=false,ok=true;
    for(const m of order){
      if(!moves(s).some(x=>sameStep(x,m))){ok=false;break}
      s=apply(s,m).s;
      const w=winner(s);
      if(w!=null){won=w===seat;ok=won;break}
    }
    if(!ok)continue;
    if(won)out.push([at,1,s]);
    else if(s.seat!==seat&&`${names(s.them.hand)}|${s.them.deck.length}`===n.left&&standing(s,true)>n.board)out.push([at,n.v,s]);
  }
  return out;
}

// One sample's score for each first step: its best finished line that no other order beats.
// b.at[r] is the position that line hands over.
function settle(b,legal,seat){
  const lines=legal.map(()=>[]),lift=legal.map(()=>[-Infinity,null]);
  for(const n of b.lines)for(const r of n.roots)lines[r].push(n);
  lines.forEach((mine,r)=>{
    for(const n of mine.sort((x,y)=>y.v-x.v)){
      if(n.v<=b.best[r])break;
      const beaten=n.roots[0]===r?reordered(b.root,n,legal,seat):[];
      for(const [at,v,s] of beaten)if(v>lift[at][0])lift[at]=[v,s];
      if(!beaten.length){b.best[r]=n.v;b.at[r]=n.s;break}
    }
  });
  lift.forEach(([v,s],r)=>{if(v>b.best[r]){b.best[r]=v;b.at[r]=s}});
}

// The other side's turn from t, which it is to play: its network's best step, or at the first step
// each of its `k` best -> the positions where each line ends (our turn again, the game over, or cut
// off after `cap` steps).
export function replies(t,net,k,cap=40){
  const pick=(s,legal)=>{
    if(legal.length<2)return [0];
    const {obs,acts}=encode(s,legal,net.vocab);
    const {logits}=net.forward(obs,acts);
    return logits.map((x,i)=>[x,i]).sort((x,y)=>y[0]-x[0]).map(([,i])=>i);
  };
  const seat=t.seat,first=moves(t),out=[];
  for(const i of pick(t,first).slice(0,k)){
    let s=apply(t,first[i]).s;
    for(let n=1;n<cap&&s.seat===seat&&winner(s)==null;n++){
      const legal=moves(s);
      if(!legal.length)break;
      s=apply(s,legal[pick(s,legal)[0]]).s;
    }
    out.push(s);
  }
  return out;
}

// turns=2: the `expand` first steps of each sample that score best, scored again by the worst of the
// other side's replies to the position they hand over. A first step not looked at again moves by the
// mean change of those that were (a guess, so within the bounds of a value), and never above the
// worst of them: it was not seen to survive the reply, and the reply is what tends to bring a score
// down.
function* further(beams,legal,vocab,{expand,replies:k,reply,own=false}){
  const seat=beams[0].root.seat,ends=[];
  for(const b of beams){
    b.top=legal.map((_,r)=>r).filter(r=>Number.isFinite(b.best[r])&&b.at[r]).sort((x,y)=>b.best[y]-b.best[x]).slice(0,expand);
    b.again=new Map();
    for(const r of b.top){
      const t=b.at[r];
      if(winner(t)!=null){b.again.set(r,[b.best[r]]);continue}
      b.again.set(r,replies(t,reply,k).map(s=>{
        const w=winner(s),n={v:null};
        if(w!=null)n.v=w==='draw'?0:w===seat?1:-1;
        else ends.push(Object.assign(n,valueAsk(s,seat,vocab,own)));
        return n;
      }));
    }
  }
  if(ends.length){
    const values=yield ends.map(n=>n.obs);
    ends.forEach((n,i)=>{n.v=n.sign*Math.max(-.98,Math.min(.98,values[i]))});
  }
  for(const b of beams){
    if(!b.again.size)continue;
    const now=new Map([...b.again].map(([r,ns])=>[r,Math.min(...ns.map(n=>n.v??n))]));
    const shift=[...now].reduce((a,[r,v])=>a+v-b.best[r],0)/now.size,low=Math.min(...now.values());
    b.best=b.best.map((v,r)=>now.has(r)?now.get(r):Number.isFinite(v)?Math.max(-.98,Math.min(v+shift,low)):v);
  }
}

// A generator: it yields lists of encoded states and is sent back the network's value of each (seen
// from the seat to act in that state), and returns one score per legal step, in the root seat's
// favour. With `ownValue` a state where the other side is to play is sent as seatView shows it, and
// its value is taken as the root seat's. `legal` must be moves(s). `deal(s,seed)` gives each sample its position (redeal; a live view passes
// opponentDealer of src/opponent-hand.mjs, which also deals the cards of the other side's hand).
export function* search(s,legal,vocab,{samples=2,width=8,seed=1,depth=40,orders=true,dominance=false,turns=1,expand=4,replies=2,reply=null,deal=redeal,ownValue=false}={}){
  if(turns>1&&!reply)throw Error('turns=2 needs the network that plays the reply');
  const seat=s.seat,total=legal.map(()=>0);
  if(legal.length<2)return total;
  const beams=Array.from({length:samples},(_,d)=>{
    const root=deal(s,seed+d);
    return {root,best:legal.map(()=>-Infinity),at:legal.map(()=>null),lines:[],open:[{s:root,roots:null,steps:[],path:[]}]};
  });
  let rolls=0;
  for(let layer=0;layer<depth&&beams.some(b=>b.open.length);layer++){
    const ask=[];
    for(const b of beams){
      const next=new Map();
      for(const n of b.open)moves(n.s).forEach((m,i)=>{
        const t=apply(n.s,m).s,roots=n.roots??[i],w=winner(t),over=w!=null,handed=t.seat!==seat;
        // Lines are joined by what the acting chair is shown (key), whichever chair values them.
        const obs=over?null:encode(t,[],vocab).obs,k=over?`over ${w}`:key(t,obs,handed),same=next.get(k);
        if(same){for(const r of roots)if(!same.roots.includes(r))same.roots.push(r);return}
        const node={s:t,obs,roots:[...roots],done:over||handed,v:over?(w==='draw'?0:w===seat?1:-1):null,sign:handed?-1:1,
          steps:[...n.steps,stepName(n.s,m)],path:[...n.path,m],
          anchor:handed||t.seed===n.s.seed?n.anchor??0:++rolls};
        if(orders&&!over){
          const own=handed?t.them:t;
          node.left=`${names(own.hand)}|${own.deck.length}`;
          node.order=`${[...node.steps].sort().join()}|${node.left}`;
          node.board=standing(t,handed);
        }
        if(!over&&handed&&ownValue)Object.assign(node,valueAsk(t,seat,vocab,true));
        if(!over)ask.push(node);
        next.set(k,node);
      });
      b.next=[...next.values()];
    }
    if(ask.length){
      const values=yield ask.map(n=>n.obs);
      // The network's guess has no bounds of its own; a game really won or lost must outrank any guess.
      ask.forEach((n,i)=>{n.v=n.sign*Math.max(-.98,Math.min(.98,values[i]))});
    }
    for(const b of beams){
      if(orders)b.next=keepBestOrder(b.next);
      const open=b.next.filter(n=>!n.done).sort((x,y)=>y.v-x.v);
      for(const n of b.next)if(n.done){
        if(orders&&n.obs)b.lines.push(n);
        else for(const r of n.roots)if(n.v>b.best[r]){b.best[r]=n.v;b.at[r]=n.s}
      }
      b.open=layer+1<depth?open.slice(0,width):[];
    }
  }
  // A first step none of whose lines the beam finished ranks with the worst that was finished: the
  // value of a turn still open is the network's hope of how it goes on, not a line played out, and
  // set beside finished lines it would win on hope alone.
  for(const b of beams){
    if(orders&&dominance)b.lines=keepPlain(b.lines);
    if(orders)settle(b,legal,seat);
  }
  if(turns>1)yield* further(beams,legal,vocab,{expand,replies,reply,own:ownValue});
  for(const b of beams){
    const floor=Math.min(...b.best.filter(Number.isFinite));
    b.best.forEach((v,r)=>{total[r]+=(Number.isFinite(v)?v:floor)/samples});
  }
  return total;
}
