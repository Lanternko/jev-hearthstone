// The opening mulligan in the simulator (2026-10-29, the user's mulligan study). src/selfplay.mjs deals
// three cards to the first seat and four plus The Coin to the second and plays on with no mulligan;
// withMulligan takes a game fresh from newGame and lets each seat throw cards back first, as the client
// does: the replacements come off the top of the deck, then the cards thrown back are shuffled in, so a
// card never comes straight back. The first seat's turn-one draw is put back before its mulligan and
// drawn again after. A seat whose policy throws nothing back consumes no dice, so keeping everything
// plays the very game newGame deals (the simulator version does not change: this file is outside it).
//
// A policy is ({hand,first,coin}) -> ids to throw back; hand is the sim's hand cards without The Coin.
//   keepAll     today's simulator
//   oldPolicy   the live rule of src/policy.mjs for decks/warlock-zakajz (forced keeps and tosses, combos,
//               4+ cost only beside a cheap body), with its free band kept, as Jev kept it live (69 games)
//   randomPolicy(seed)  each card back with probability 1/2, its own dice (the exploration data)
//   huntPolicy(opt)     the user's rule: keep the three core cards, throw all without one, else fill the curve
//   tablePolicy(doc)    a learned scorer (train/fit_mulligan.py): the subset of cards kept with the best score
//
//   node src/selfplay-mulligan.mjs <model> <opponent> [games=200] [seed=1] --decks A B [--policy all|old|random|hunt0|hunt1|hunt2|hunt1c|<file>]
//       [--guard egg] [--out games.jsonl] [--json]
//       plays `games` games with the model first and as many second, the policy on the model's side only;
//       --out writes one line per game: seed, first, the cards offered, those thrown back, the result.
import {pathToFileURL} from 'node:url';
import {appendFileSync,readFileSync} from 'node:fs';
import {moves,apply,handCard,flip,roll,drawCards} from './sim.mjs';
import {newGame,loadList,winner} from './selfplay.mjs';
import {loadNet} from './selfplay-net.mjs';
import {eggGuard} from './egg-guard.mjs';
import {features,CORE,tablePolicy} from './mulligan-table.mjs';
export {features,CORE,tablePolicy};
import {simVersion} from './sim-version.mjs';

const COIN='GAME_005';
const isCoin=c=>(c.raw?.cardId??c.cardId)===COIN;

// One seat's mulligan on the acting side of s (mutated): replacements into the same slots, then the
// thrown-back cards shuffled into the deck at places the game's own dice choose.
function mull(s,ids){
  const out=new Set(ids);
  if(!out.size)return [];
  const back=[];
  s.hand=s.hand.map(c=>{
    if(!out.has(c.id)||isCoin(c))return c;
    back.push(c.raw);
    const [raw,...rest]=s.deck;s.deck=rest;
    return handCard(raw,true);
  });
  for(const raw of back){const i=roll(s,s.deck.length+1);s.deck=[...s.deck.slice(0,i),raw,...s.deck.slice(i)]}
  return back.map(c=>c.name);
}

// s from newGame (seat 0 to act, its turn-one card already drawn); policies[k] for seat k, null keeps all.
// -> {s, thrown:[names of seat 0, names of seat 1]}
export function withMulligan(s,policies=[null,null]){
  const thrown=[[],[]];
  if(policies[0]){
    const d=s.hand.pop();s.deck=[d.raw,...s.deck];
    thrown[0]=mull(s,policies[0]({hand:s.hand.filter(c=>!isCoin(c)),first:true,coin:false}));
    drawCards(s,1);
  }
  if(policies[1]){
    const f=flip(s);
    thrown[1]=mull(f,policies[1]({hand:f.hand.filter(c=>!isCoin(c)),first:false,coin:true}));
    s=flip(f);
  }
  return {s,thrown};
}

export const keepAll=()=>[];

export function randomPolicy(seed=1){
  const dice={seed:seed|0};
  return ({hand})=>hand.filter(()=>roll(dice,2)).map(c=>c.id);
}

// The live rule, read from src/policy.mjs itself so the two cannot drift; JEV_DECK names the deck it reads.
let live;
export async function oldPolicy(deck='warlock-zakajz'){
  process.env.JEV_DECK=deck;
  live??=await import('./policy.mjs');
  const {mulliganVerdict,mulliganCombos}=live;
  const body=c=>c.CARDTYPE==='MINION'&&Number(c.COST)<=2&&Number(c.ATK??0)>0;
  return ({hand,coin})=>{
    const raws=hand.map(c=>c.raw),state={me:{heroClass:'WARLOCK'},choice:{type:'MULLIGAN',
      entities:coin?[...raws,{entityId:-1,cardId:COIN,name:'The Coin',CARDTYPE:'SPELL',COST:0,text:''}]:raws}};
    const combo=mulliganCombos(raws,state);
    const toss=new Set(raws.filter(c=>!combo.has(c.entityId)&&mulliganVerdict(c,state)==='toss').map(c=>c.entityId));
    // keepsLateAlone: a 4+ cost card stays only beside a kept cheap body.
    const kept=raws.filter(c=>!toss.has(c.entityId));
    if(!kept.some(body))for(const c of kept)if(Number(c.COST)>=4&&!combo.has(c.entityId))toss.add(c.entityId);
    return [...toss];
  };
}

// The user's rule (2026-10-29): the three core cards are kept; with none of them everything goes back to dig
// for them; beside one, `cheap` keeps the minions up to that cost to fill the curve, `extra` names other keeps.
export function huntPolicy({cheap=0,extra=[]}={}){
  const also=new Set(extra);
  return ({hand})=>{
    const core=hand.some(c=>CORE.has(c.name));
    return hand.filter(c=>!(CORE.has(c.name)||core&&(also.has(c.name)||c.raw.CARDTYPE==='MINION'&&Number(c.raw.COST)<=cheap))).map(c=>c.id);
  };
}
const HUNT={hunt0:{},hunt1:{cheap:1},hunt2:{cheap:2},hunt1c:{cheap:1,extra:['Cursed Catacombs']}};

// One game line of --out as a row for train/fit_mulligan.py: f the features of what was kept (the policy's part),
// c the controls the keep cannot change (the cards offered, the opponent, the seat).
export function sampleRow(x){
  const left=[...x.thrown],mask=x.offered.map(n=>{const i=left.indexOf(n);if(i<0)return 1;left.splice(i,1);return 0});
  const seat=x.first?'1st':'2nd',c={[`opp:${x.opp}|${seat}`]:1};
  for(const n of x.offered){c[`o:${n}`]=(c[`o:${n}`]??0)+1;c[`o:${n}|${seat}`]=(c[`o:${n}|${seat}`]??0)+1}
  return {f:features(x.offered,mask,x.first),c,won:x.won,opp:x.opp,first:x.first,seed:x.seed};
}

export async function loadPolicy(name,{seed=1,deck='warlock-zakajz'}={}){
  if(name==='all')return keepAll;
  if(HUNT[name])return huntPolicy(HUNT[name]);
  if(name==='old')return oldPolicy(deck);
  if(name==='random')return randomPolicy(seed);
  return tablePolicy(JSON.parse(readFileSync(name,'utf8')));
}

// Games with nets[0] (its policy `policy`) against nets[1] (keeps all); `first` 0 puts nets[0] first.
// onGame sees each game: {seed, first, offered, thrown, won}. -> [our wins, drawn, their wins]
export function mulliganMatch(nets,lists,{games=200,seed=1,first=0,policy=keepAll,guard=false,maxSteps=1500,onGame}={}){
  const tally=[0,0,0];
  for(let g=0;g<games;g++){
    const order=first===0?[0,1]:[1,0];                      // order[seat] = which of ours/theirs sits there
    let s=newGame({lists:order.map(k=>lists[k]),seed:seed+g});
    let offered=null;
    const mine=x=>{offered=x.hand.map(c=>c.name);return policy(x)};
    const r=withMulligan(s,order.map(k=>k===0?mine:null));s=r.s;
    for(let n=0;n<maxSteps;n++){
      const legal=moves(s);
      if(!legal.length)break;
      const egg=guard?eggGuard(s,legal):null;
      s=apply(s,egg??nets[order[s.seat]].rank(s,legal).steps[0].move).s;
    }
    const w=winner(s),ours=order.indexOf(0),won=w==null||w==='draw'?0.5:w===ours?1:0;
    tally[won===1?0:won===0?2:1]++;
    onGame?.({seed:seed+g,first:first===0,offered,thrown:r.thrown[ours],won});
  }
  return tally;
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const args=process.argv.slice(2),flag=(name,dflt)=>{const i=args.indexOf(`--${name}`);return i<0?dflt:args.splice(i,2)[1]};
  const json=args.includes('--json');if(json)args.splice(args.indexOf('--json'),1);
  const pol=flag('policy','all'),guard=flag('guard','')==='egg',out=flag('out',null);
  const named=args.indexOf('--decks'),pair=named<0?[]:args.splice(named,3).slice(1);
  const [a,b,games=200,seed=1]=args;
  if(!a||!b||pair.length!==2)throw Error('usage: node src/selfplay-mulligan.mjs <model> <opponent> [games] [seed] --decks A B [--policy all|old|random|<file>] [--guard egg] [--out file] [--json]');
  const nets=[loadNet(a),loadNet(b)],lists=pair.map(loadList),sim=simVersion();
  const total=[0,0,0],orders=[];
  for(const first of [0,1]){
    const policy=await loadPolicy(pol,{seed:Number(seed)*2+first,deck:pair[0]});
    const t=mulliganMatch(nets,lists,{games:Number(games),seed:Number(seed),first,policy,guard,
      onGame:out&&(x=>appendFileSync(out,JSON.stringify({opp:pair[1],oppModel:b.replace(/^.*[\/]/,''),policy:pol,...x})+'\n'))});
    t.forEach((x,i)=>total[i]+=x);
    orders.push({first:first===0?'a':'b',games:Number(games),a:t[0],drawn:t[1],b:t[2],cut:0});
    console.log(`${pol} ${first===0?'first':'second'} v ${pair[1]}: ${games} games, won ${t[0]}, drawn ${t[1]}, lost ${t[2]}`);
  }
  console.log(`together: ${2*games} games, won ${total[0]} (${(100*total[0]/(2*games)).toFixed(1)}%)`);
  if(json)console.log(JSON.stringify({a,b,deck:pair,policy:pol,look:'',guard:guard?'egg':'',seed:Number(seed),sim,trained:nets.map(x=>x.sim),orders}));
}
