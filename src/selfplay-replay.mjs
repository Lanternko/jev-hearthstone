// Replays of self-play games between two networks, step by step, for a person to read: both boards, both
// hands, the step taken, the next steps the network weighed with their shares, and the value it put on the
// position. Played as src/selfplay-cardwin.mjs plays them (greedy, --guard egg as there).
// Sides are named by the deck that plays them, not by the seat, so a game reads the same whoever went first.
//
//   node src/selfplay-replay.mjs <modelA> <modelB> [games=10] [seed=1] [--decks A B] [--guard egg] [--out file]
//
// -> {a,b,decks,seed,sim,games:[{seed,first,winner,steps:[step]}]}, a step being
//   {turn,side,mana,crystals,heroes,boards,hands,decks,move,alts:[[text,p]],p,value,guard}
// with side 0 for A and 1 for B, p the share of the step taken (copies of one card added together), boards/hands/heroes/decks indexed the same way, and value the acting
// network's reading for its own side (about -1 to 1).
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import {moves,apply,costOf} from './sim.mjs';
import {newGame,loadList,winner,cardDb} from './selfplay.mjs';
import {loadNet} from './selfplay-net.mjs';
import {eggGuard} from './egg-guard.mjs';
import {simVersion} from './sim-version.mjs';

const FLAGS=['taunt','ds','stealth','reborn','dormant','frozen','poison','lifesteal','windfury','rush','immune'];
const minion=b=>({id:b.id,name:b.name,cardId:b.cardId??b.raw?.cardId??null,atk:b.atk,hp:b.hp,maxHp:b.maxHp??b.hp,
  flags:FLAGS.filter(f=>b[f]),...(b.canAttack&&!b.exhausted?{ready:true}:{})});
const heroOf=bs=>{const h=bs.find(b=>b.type==='HERO');return h?{name:h.name,hp:h.hp,armor:h.armor??0,atk:h.atk??0}:null};
// the acting side's hand shows what each card costs now (auras such as Mawman Cultist's), the other side's the printed cost
const handOf=(h,s)=>(h??[]).map(c=>({name:c.name,cost:s?costOf(s,c):c.cost,type:c.type}));

// An option of a pick is a card id (C'Thun abilities, Kazakus, trials) or an entity: in the deck, the hand or on the board.
let DB=null;
function optionName(s,id){
  if(typeof id==='string')return (DB??=cardDb())[id]?.name??s.game?.byId?.[id]?.name??id;
  const e=s.deck?.find(d=>d.entityId===id)??s.hand.find(c=>c.id===id)??[...s.me,...s.opp].find(b=>b.id===id);
  return e?.name??String(id);
}
// A step in words, read off the position it is taken in.
export function describeMove(s,m){
  const all=[...s.me,...s.opp],at=id=>{const b=all.find(x=>x.id===id);return b?(b.type==='HERO'?(b.side==='me'?'我方英雄':'敵方英雄'):b.name):`#${id}`};
  const aim=m.targetId!=null?` → ${at(m.targetId)}`:'';
  if(m.kind==='play')return `${s.hand.find(c=>c.id===m.id)?.name??`#${m.id}`}${aim}`;
  if(m.kind==='attack')return `${at(m.id)} 攻擊${aim}`;
  if(m.kind==='power')return `英雄能力 ${s.power?.name??''}${aim}`.trim();
  if(m.kind==='end')return '結束回合';
  if(m.kind==='prepare')return `準備 ${s.hand.find(c=>c.id===m.id)?.name??`#${m.id}`}`;
  if(m.kind==='choose')return `選擇 ${optionName(s,m.id)}（${s.choice?.kind??''}）`;
  return m.kind;
}

// One position, seen from the decks: side 0 is A's deck whichever seat it holds.
export function snapshot(s,side){
  const mine=side,other=1-side,boards=[],hands=[],heroes=[],decks=[],crystals=[];
  boards[mine]=s.me.filter(b=>b.type==='MINION'&&b.hp>0).map(minion);boards[other]=s.opp.filter(b=>b.type==='MINION'&&b.hp>0).map(minion);
  heroes[mine]=heroOf(s.me);heroes[other]=heroOf(s.opp);
  hands[mine]=handOf(s.hand,s);hands[other]=handOf(s.them?.hand);
  decks[mine]=s.deck?.length??0;decks[other]=s.them?.deck?.length??0;
  crystals[mine]=s.crystals??null;crystals[other]=s.them?.crystals??null;
  return {boards,hands,heroes,decks,crystals};
}

export function replayGame(nets,lists,{seed=1,first=0,guard=false,maxSteps=1500,alts=4}={}){
  const order=first===0?[0,1]:[1,0];
  let s=newGame({lists:order.map(k=>lists[k]),seed});
  const steps=[];
  for(let n=0;n<maxSteps;n++){
    const legal=moves(s);
    if(!legal.length)break;
    const side=order[s.seat],egg=guard?eggGuard(s,legal):null,ask=egg?[egg]:legal;
    const r=nets[side].rank(s,ask),pick=r.steps[0];
    // with the guard the network is asked only the guarded step; what it would have weighed is its reading of all of them
    const weigh=egg?nets[side].rank(s,legal):r;
    // two copies of a card are two steps that read the same; their shares are added, so a split vote reads as one
    const share=new Map();
    for(const x of weigh.steps){const t=describeMove(s,x.move);share.set(t,(share.get(t)??0)+x.p)}
    const move=describeMove(s,pick.move);
    steps.push({turn:s.turn,side,mana:s.mana,...snapshot(s,side),move,p:Number(share.get(move).toFixed(3)),value:r.value,guard:!!egg,
      alts:[...share].sort((x,y)=>y[1]-x[1]).slice(0,alts).map(([t,p])=>[t,Number(p.toFixed(3))])});
    s=apply(s,pick.move).s;
  }
  const w=winner(s);
  return {seed,first,winner:w==null?null:order[w],turns:s.turn,steps};
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const args=process.argv.slice(2);
  const gi=args.indexOf('--guard'),guard=gi>=0&&args.splice(gi,2)[1]==='egg';
  const oi=args.indexOf('--out'),out=oi>=0?args.splice(oi,2)[1]:null;
  const di=args.indexOf('--decks'),pair=di<0?[]:args.splice(di,3).slice(1);
  const [a,b,games=10,seed=1]=args;
  if(!a||!b)throw Error('usage: node src/selfplay-replay.mjs <modelA> <modelB> [games] [seed] [--decks A B] [--guard egg] [--out file]');
  const nets=[loadNet(a),loadNet(b)],decks=[pair[0]??nets[0].decks[0],pair[1]??nets[1].decks[0]],lists=decks.map(loadList);
  const list=[];
  for(let g=0;g<Number(games);g++)list.push(replayGame(nets,lists,{seed:Number(seed)+g,first:g%2,guard}));
  const doc=JSON.stringify({a,b,decks,seed:Number(seed),guard:guard?'egg':'',sim:simVersion(),games:list});
  if(out)writeFileSync(out,doc);else console.log(doc);
}
