// F-881 category exam (regression bank, type B). Promoted from runtime/f881/lib.mjs + run.mjs (E-280).
//
// F-881: with Tachyon Barrage castable (Coin counted) on own turn 1-3, an empty enemy board, and a best non-Tachyon
// line that plays only Coin / Life Tap / end ("DRY", E-280), does the zoo network cast Tachyon?  E-280 measured
// 361 of 1076 DRY positions for warlock-zoo-0.2.0 (r=0).
//
// The positions come from games between a fixed GENERATOR network and a fixed opponent, on seeds from
// EXAM_SEED_BASE up.  EXAM ONLY -- NEVER USE THESE SEEDS FOR TRAINING, evaluation or tuning (train/ppo.py uses small
// seeds, audit 700M, duel 800M, evaluate 900M+n; E-280 used 700000+g).  A tracked index (eval/regress/f881-index.json)
// lists the DRY positions as (deck, g, ownTurn) so an exam replays a few dozen games, not thousands; the replay is
// deterministic (greedy nets, fixed seed), and a position that no longer holds (sim change) is counted as stale.
import {moves,apply,costOf} from './sim.mjs';
import {newGame,loadList} from './selfplay.mjs';
import {loadNet} from './selfplay-net.mjs';
import {eggGuard} from './egg-guard.mjs';
import {describeMove} from './selfplay-replay.mjs';

export const EXAM_SEED_BASE=1_500_000_000;
export const MAXSTEPS=1500;
// deck -> the network that generates (and classifies) its positions, and the fixed opponent.  Decks without Tachyon
// Barrage (warlock-discard, priest-egg-hsr) have no F-881 category.
export const F881_DECKS={
  'warlock-zoo':{generator:'warlock-zoo-v9'},
  'warlock-zakajz':{generator:'warlock-zoo-0.2.0'}
};
export const OPPONENT={model:'priest-egg-0.1.0',deck:'priest-egg-hsr',guard:true};
export const NOTPLAY=/^(結束回合|The Coin|英雄能力 Life Tap)$/;
export const MAX_OWN_TURN=3;

export const cloneState=s=>{const {game,...rest}=s;const c=structuredClone(rest);c.game=game;return c};
export const isMinion=b=>b.type==='MINION'&&b.hp>0;
const nameOf=(s,m)=>m.kind==='play'?s.hand.find(c=>c.id===m.id)?.name:null;
export const isTach=(s,m)=>nameOf(s,m)==='Tachyon Barrage';
export const isCoin=(s,m)=>nameOf(s,m)==='The Coin';

// {needCoin,hasCoin,cost} when Tachyon Barrage is castable now (hand + mana, the Coin counted); null otherwise.
export function tachyonState(s){
  const t=s.hand.find(c=>c.name==='Tachyon Barrage');
  if(!t)return null;
  const hasCoin=s.hand.some(c=>c.name==='The Coin');
  const c=costOf(s,t);
  if(c<=s.mana)return {needCoin:false,hasCoin,cost:c};
  if(hasCoin&&c<=s.mana+1)return {needCoin:true,hasCoin,cost:c};
  return null;
}

// The seat `me` plays the rest of its turn (turn0) greedily with net `net`; `mask(s,m)` removes moves.
// Returns the move descriptions.  The opponent's guard is not applied: this is only our own turn.
export function playTurn(s,net,me,mask=null){
  const turn0=s.turn,line=[];
  for(let n=0;n<MAXSTEPS;n++){
    if(s.seat!==me||s.turn!==turn0)break;
    const legal=moves(s);if(!legal.length)break;
    let ask=legal;
    if(mask){const f=legal.filter(m=>!mask(s,m));if(f.length)ask=f}
    const mv=net.rank(s,ask).steps[0].move;
    line.push(describeMove(s,mv));
    s=apply(s,mv).s;
  }
  return line;
}

// DRY under `net`: its best line with Tachyon removed plays nothing but Coin / Life Tap / end.
export function isDry(s0,net,me){
  const line=playTurn(cloneState(s0),net,me,(x,m)=>isTach(x,m));
  return !line.some(m=>!NOTPLAY.test(m));
}

export function loadExamNets(deck,{dir=new URL('../models/selfplay/',import.meta.url)}={}){
  const cfg=F881_DECKS[deck];
  if(!cfg)throw Error(`no F-881 category for deck ${deck}`);
  const f=n=>new URL(`${n}.json`,dir).pathname.replace(/^\/([A-Za-z]:)/,'$1');
  return {
    generator:loadNet(decodeURIComponent(f(cfg.generator))),
    opponent:loadNet(decodeURIComponent(f(OPPONENT.model))),
    lists:{mine:loadList(deck),theirs:loadList(OPPONENT.deck)}
  };
}

// Play game g (seed EXAM_SEED_BASE+g, seat order alternates with g) with the generator net and the opponent, up to
// the zoo seat's MAX_OWN_TURN-th own turn; yield each Tachyon-castable empty-board turn start.
//   visit({s0,ownTurn,ts}) may return true to stop early.
export function* gamePositions(g,nets){
  const first=g%2,order=first===0?[0,1]:[1,0];      // order[seat] = 0: our deck, 1: the opponent
  const lists=order.map(k=>k===0?nets.lists.mine:nets.lists.theirs);
  let s=newGame({lists,seed:EXAM_SEED_BASE+g});
  const me=order.indexOf(0),pilots=order.map(k=>k===0?nets.generator:nets.opponent);
  let ownTurn=0,lastTurn=-1;
  for(let n=0;n<MAXSTEPS;n++){
    const legal=moves(s);if(!legal.length)return;
    if(s.seat===me&&s.turn!==lastTurn&&!s.choice){
      lastTurn=s.turn;ownTurn++;
      if(ownTurn>MAX_OWN_TURN)return;
      if(!s.opp.some(isMinion)){
        const ts=tachyonState(s);
        if(ts)yield {s0:cloneState(s),ownTurn,ts,me,first};
      }
    }
    const eg=s.seat!==me?eggGuard(s,legal):null;
    s=apply(s,pilots[s.seat].rank(s,eg?[eg]:legal).steps[0].move).s;
  }
}

// Find the DRY positions in games g0..g0+games-1.  [{g,ownTurn,turn}], classified by the generator net.
export function buildIndex(deck,{g0=0,games=1000,nets=loadExamNets(deck),onProgress=null}={}){
  const out=[];
  for(let g=g0;g<g0+games;g++){
    for(const p of gamePositions(g,nets)){
      if(isDry(p.s0,nets.generator,p.me))out.push({g,ownTurn:p.ownTurn,turn:p.s0.turn});
    }
    onProgress?.(g);
  }
  return out;
}

// Rebuild one indexed position; null if the game no longer reaches it (the sim moved).
export function replayPosition(entry,nets){
  for(const p of gamePositions(entry.g,nets))if(p.ownTurn===entry.ownTurn)return p;
  return null;
}

// Grade `net` on indexed positions.  Per position: tach = its greedy line casts Tachyon; pTach = probability mass it
// puts on casting Tachyon at the first decision of the turn (on The Coin when the Coin must come first).
export function gradeF881(deck,net,index,{nets=loadExamNets(deck)}={}){
  let dry=0,tach=0,stale=0,pSum=0;
  const rows=[];
  for(const e of index){
    const p=replayPosition(e,nets);
    if(!p||!isDry(p.s0,nets.generator,p.me)||p.s0.turn!==e.turn){stale++;continue}
    dry++;
    const s=p.s0;
    const line=playTurn(cloneState(s),net,p.me);
    const castsTach=line.includes('Tachyon Barrage');
    const r=net.rank(s,moves(s));
    const want=p.ts.needCoin?isCoin:isTach;
    const pT=r.steps.filter(x=>want(s,x.move)).reduce((a,x)=>a+x.p,0);
    if(castsTach)tach++;
    pSum+=pT;
    rows.push({g:e.g,ownTurn:e.ownTurn,needCoin:p.ts.needCoin,tach:castsTach,pTach:+pT.toFixed(4),line});
  }
  return {dry,tach,stale,rate:dry?tach/dry:null,meanPTach:dry?pSum/dry:null,rows};
}
