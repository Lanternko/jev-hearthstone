// The look ahead of src/selfplay-search.mjs for a live position (JEV_NET_SEARCH=1, read by netPick in
// src/selfplay-shadow.mjs). The network's own pick stays the answer whenever the search has no better one to give:
// no time left, an error, a position the simulator does not offer the game's menu in, a single option.
//
//   JEV_NET_SEARCH=1            on (anything else: off, and this file is not loaded)
//   JEV_NET_SEARCH_SAMPLES=4    deals per decision (what the opponent holds, our deck order)
//   JEV_NET_SEARCH_TURNS=1      1: to the end of our turn; 2: through the opponent's next turn as well
//   JEV_NET_SEARCH_MS=3000      hard cap per decision; over it the greedy pick is played
//   JEV_NET_SEARCH_WIDTH=8, _EXPAND=4, _REPLIES=2   the beam, as src/selfplay-match.mjs --beam/--expand/--replies
import {moves} from './sim.mjs';
import {newGame,loadList,cardDb} from './selfplay.mjs';
import {search} from './selfplay-search.mjs';
import {opponentDealer} from './opponent-hand.mjs';
import {deckName} from './deck.mjs';

const int=(v,d)=>Number.isFinite(Number(v))&&v!==''&&v!=null&&Number(v)>0?Math.floor(Number(v)):d;

export function searchConfig(env=process.env){
  return {samples:int(env.JEV_NET_SEARCH_SAMPLES,4),turns:int(env.JEV_NET_SEARCH_TURNS,1)>1?2:1,ms:int(env.JEV_NET_SEARCH_MS,3000),
    width:int(env.JEV_NET_SEARCH_WIDTH,8),expand:int(env.JEV_NET_SEARCH_EXPAND,4),replies:int(env.JEV_NET_SEARCH_REPLIES,2)};
}

// The simulator plays the game of self-play when its state carries the tokens and rules of newGame (s.game); the live
// view drops them, and this puts them back for the search (and only for it). The game context is built from the card
// database, so the list only has to name a real deck; it is kept per deck (JEV_DECK) as newGame is not free.
const contexts=new Map();
export function gameContext(deck='warlock-zoo'){
  if(!contexts.has(deck))contexts.set(deck,newGame({lists:[loadList(deck),loadList(deck)],seed:1,cards:cardDb()}).game);
  return contexts.get(deck);
}

// The live view fills in what the network is shown and leaves out what only the simulator reads: which seat the
// other side sits in (without it a turn is never seen to be handed over), its mana, sites, taxes and counters.
export function simRoot(s,deck='warlock-zoo'){
  const th=s.them;
  return {spellTax:0,died:0,cthunSeen:[],cthunStart:false,brox:null,studies:0,sites:[],...s,game:gameContext(deck),
    them:{seat:1-s.seat,power:null,mana:0,sites:[],spellTax:0,died:0,cthunSeen:[],cthunStart:false,brox:null,studies:0,weapon:null,...th}};
}

const sameStep=(a,b)=>a.kind===b.kind&&(a.id??null)===(b.id??null)&&(a.targetId??null)===(b.targetId??null);
// What the playing prefers among close scores: the policy's own opinion, as train/ppo.py's think does.
const PRIOR=1e-3;

const describe=(s,m)=>m?{kind:m.kind,id:m.id??null,targetId:m.targetId??null}:null;

// -> {index, ...info}: `index` is the position in view.legal of the step to play, or null to keep the greedy one.
// `ranked` is net.rank(view.s, view.legal). `dealer` and `now` are for tests.
export function searchedPick({net,view,ranked,state,cfg=searchConfig(),now=Date.now,dealer,seed}){
  const t0=now(),info={on:true,samples:cfg.samples,turns:cfg.turns,capMs:cfg.ms};
  const greedy=view.legal.indexOf(ranked.steps[0]?.move);
  info.greedy=describe(view.s,view.legal[greedy]);
  const done=extra=>({index:null,...info,ms:now()-t0,...extra});
  try{
    if(view.legal.length<2||greedy<0)return done({reason:'single'});
    const root=simRoot(view.s,deckName(state)),sm=moves(root),at=view.legal.map(m=>sm.findIndex(x=>sameStep(x,m)));
    if(at[greedy]<0)return done({reason:'greedy step not in the simulator menu'});
    const covered=at.filter(j=>j>=0).length;
    info.covered=`${covered}/${view.legal.length}`;
    const key=seed??Math.imul((state?.gameNumber??0)+1,7919)+Math.imul(state?.turn??0,104729);
    const g=search(root,sm,net.vocab,{samples:cfg.samples,width:cfg.width,turns:cfg.turns,expand:cfg.expand,replies:cfg.replies,
      reply:net,seed:key,deal:dealer??opponentDealer(state)});
    const deadline=t0+cfg.ms;
    let r=g.next();
    while(!r.done){
      if(now()>deadline)return done({timedOut:true,reason:'timeout'});
      r=g.next(r.value.map(net.value));
    }
    if(now()>deadline)return done({timedOut:true,reason:'timeout'});
    const logp=new Map(ranked.steps.map(x=>[x.move,Math.max(-10,Math.log(Math.max(x.p,1e-12)))]));
    let best=-1,bestScore=-Infinity;
    const scores=view.legal.map((m,i)=>{
      if(at[i]<0)return null;
      const v=r.value[at[i]]+PRIOR*logp.get(m);
      if(v>bestScore){best=i;bestScore=v}
      return +r.value[at[i]].toFixed(4);
    });
    info.scores=scores;
    info.pick=describe(view.s,view.legal[best]);
    info.override=best!==greedy;
    return {index:best,...info,ms:now()-t0};
  }catch(e){
    return done({error:e.message});
  }
}
