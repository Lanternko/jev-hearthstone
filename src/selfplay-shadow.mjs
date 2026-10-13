import {appendFile,mkdir,readFile} from 'node:fs/promises';
import {fromState} from './sim.mjs';
import {encode} from './selfplay-encode.mjs';
import {loadList,rawCard,cardDb} from './selfplay.mjs';

export const SHADOW_LOG=new URL('../runtime/shadow.jsonl',import.meta.url);
const MODEL_NAME='warlock-discard-v5';
let shadowRuntime=null,shadowWarned=false;

const num=v=>Number(v??0);
const tag=(parsed,id,name)=>parsed?.entities?.get(id)?.tags?.[name];
const entity=(parsed,id)=>parsed?.entities?.get(id);
const ownPlayer=state=>state?.me?.playerId;
const oppPlayer=state=>state?.opponent?.playerId;
const handHas=(state,id)=>(state.me.hand??[]).some(c=>c.entityId===id);
const boardCard=(state,id)=>(state.me.board??[]).find(c=>c.entityId===id);
const anyName=(s,id)=>[...s.hand,...s.me,...s.opp,...(s.sites??[])].find(x=>x.id===id)?.name
  ??s.deck?.find(x=>x.entityId===id)?.name??null;

function playerEntity(parsed,playerId){
  return [...(parsed?.entities?.values()??[])].find(e=>e.playerId===playerId)
    ??[...(parsed?.entities?.values()??[])].find(e=>Number(e.tags?.CONTROLLER)===playerId&&e.tags?.CARDTYPE==='PLAYER');
}

function firstPlayerSeat(parsed,state){
  const e=playerEntity(parsed,ownPlayer(state));
  return e?.tags?.FIRST_PLAYER==='1'?0:1;
}

// The parser counts them (power.mjs); a parse that carries no count leaves the network with 0.
function knownDiscardCount(parsed,playerId){
  return parsed?.discards?{value:num(parsed.discards.get(playerId))}:{value:0,note:'discardCount unknown'};
}

function hiddenDeck(parsed,state,{cards,list},notes){
  const counts=new Map(Object.entries(list.cards));
  const player=ownPlayer(state);
  let shreds=0;
  for(const e of parsed?.entities?.values()??[]){
    if(Number(e.tags?.CONTROLLER)!==player)continue;
    // Entropic Continuity's two Shreds of Time sit in the deck face down; the simulator holds them there too.
    if(e.tags?.ZONE==='DECK'){if(e.generatedByContinuity)shreds++;continue}
    // 2026-10-13 live game 1: Catacombs' discover copies and a re-made Egg were counted as cards
    // gone from the deck, and the deck was padded with more blanks every turn (24->26 up to 13->19).
    if(e.created||!counts.has(e.cardId))continue;
    counts.set(e.cardId,Math.max(0,counts.get(e.cardId)-1));
  }
  let next=900000,deck=[];
  for(const [id,n] of counts)for(let i=0;i<n;i++)deck.push(rawCard(cards[id],next++));
  for(let i=0;i<shreds&&cards.TIME_025t;i++)deck.push(rawCard(cards.TIME_025t,next++));
  const want=num(state.me.deckCount);
  if(deck.length>want){notes.push(`deck trimmed ${deck.length}->${want}`);deck=deck.slice(0,want)}
  if(deck.length<want)notes.push(`deck padded ${deck.length}->${want}`);
  while(deck.length<want){
    deck.push({entityId:next++,cardId:'UNKNOWN_SHADOW',CARDTYPE:'MINION',name:`Unknown shadow card ${deck.length+1}`,text:'',COST:0,ATK:0,HEALTH:1});
  }
  return deck;
}

function choiceView(state,s,notes){
  if(state.choice?.type!=='GENERAL')return null;
  const options=state.choice.entities.map(e=>e.entityId);
  if(!options.length)return null;
  if(options.every(id=>s.hand.some(c=>c.id===id)))return {kind:'site',options};
  for(const id of options){
    const offered=state.choice.entities.find(e=>e.entityId===id);
    const card=s.deck.find(c=>c.name&&c.name===offered?.name);
    if(card)card.entityId=id;
    else notes.push(`discover option not in deck: ${offered?.name??id}`);
  }
  return {kind:'discover',options};
}

function opponentWeapon(state){
  const w=(state.opponent.board??[]).find(c=>c.CARDTYPE==='WEAPON');
  if(!w)return null;
  return {atk:num(w.ATK??w.baseAttack),durability:w.HEALTH!=null||w.baseHealth!=null?num(w.HEALTH??w.baseHealth)-num(w.DAMAGE):num(w.DURABILITY)};
}

function legalMove(parsed,state,action){
  if(action.type==='END_TURN')return {kind:'end'};
  if(action.type==='CHOICE')return {kind:'choose',id:action.entityId};
  const c=boardCard(state,action.entityId),e=entity(parsed,action.entityId);
  const kind=handHas(state,action.entityId)?'play'
    :c?.CARDTYPE==='HERO_POWER'||e?.tags?.CARDTYPE==='HERO_POWER'?'power'
    :c?.CARDTYPE==='LOCATION'||e?.tags?.CARDTYPE==='LOCATION'?'use'
    :'attack';
  return {kind,id:action.entityId,...(action.targetId!=null?{targetId:action.targetId}:{})};
}

export function shadowView(parsed,state,actions,{cards=cardDb(),list=loadList('warlock-discard')}={}){
  if(!state||state.status!=='RUNNING'||!actions?.length||actions.some(a=>a.type==='MULLIGAN'))return null;
  const notes=[];
  const s=fromState(state,actions,{full:true});
  const mine=knownDiscardCount(parsed,ownPlayer(state)),theirs=knownDiscardCount(parsed,oppPlayer(state));
  const opp=playerEntity(parsed,oppPlayer(state));
  Object.assign(s,{
    crystals:num(state.me.maxMana),
    fatigue:num(state.me.fatigue),
    seat:firstPlayerSeat(parsed,state),
    turn:num(state.turn),
    discardCount:mine.value,
    deck:hiddenDeck(parsed,state,{cards,list},notes),
    them:{
      crystals:num(state.opponent.maxMana),
      hand:Array.from({length:num(state.opponent.handCount)},()=>({})),
      deck:Array.from({length:num(state.opponent.deckCount)},()=>({})),
      fatigue:num(opp?.tags?.FATIGUE),
      discardCount:theirs.value,
      weapon:opponentWeapon(state),
      locations:(state.opponent.board??[]).filter(c=>c.CARDTYPE==='LOCATION').length
    }
  });
  // The simulator the network learned in calls the Boneweb Egg token 'Spider'; the game says 'Boneweb Spider'.
  for(const b of [...s.me,...s.opp])if(b.name==='Boneweb Spider')b.name='Spider';
  if(mine.note)notes.push(mine.note);
  s.choice=choiceView(state,s,notes);
  delete s.game;
  const legal=actions.map(a=>legalMove(parsed,state,a));
  const byAction=new Map(actions.map((a,i)=>[a.id,i]));
  return {s,legal,byAction,notes};
}

function unknownCards(net,s){
  const names=new Set();
  const add=c=>{if(c?.name&&!net.vocab.index.has(c.name))names.add(c.name)};
  for(const c of s.hand)add(c);
  for(const b of [...s.me,...s.opp])if(b.type!=='HERO')add(b);
  return [...names].sort();
}

const withNames=(s,step)=>({
  kind:step.move.kind,
  id:step.move.id??null,
  name:step.move.id!=null?anyName(s,step.move.id):null,
  targetId:step.move.targetId??null,
  targetName:step.move.targetId!=null?anyName(s,step.move.targetId):null,
  p:step.p
});

export function shadowRow(net,view,{action,source,state,createdAt=new Date().toISOString()}={}){
  const ranked=net.rank(view.s,view.legal);
  const actionIndex=action?view.byAction.get(action.id):null;
  const jevStep=actionIndex!=null?ranked.steps.findIndex(x=>x.move===view.legal[actionIndex]):-1;
  const picked=jevStep>=0?ranked.steps[jevStep]:null;
  return {
    createdAt,model:MODEL_NAME,gameNumber:state?.gameNumber,turn:state?.turn,
    mirror:state?.opponent?.heroClass==='WARLOCK',opponentClass:state?.opponent?.heroClass??null,
    value:ranked.value,legal:view.legal.length,top:ranked.steps.slice(0,3).map(x=>withNames(view.s,x)),
    jev:picked?{...withNames(view.s,picked),rank:jevStep,source}:null,
    agree:!!picked&&ranked.steps[0]?.move===picked.move,
    unknown:unknownCards(net,view.s),
    notes:view.notes
  };
}

async function runtime(){
  if(!shadowRuntime){
    const [{loadNet}]=await Promise.all([import('./selfplay-net.mjs')]);
    const cards=cardDb(),list=loadList('warlock-discard'),net=loadNet();
    shadowRuntime={cards,list,net};
  }
  return shadowRuntime;
}

export async function recordShadowDecision({parsed,state,actions,action,source,out=SHADOW_LOG}){
  if(process.env.JEV_SHADOW==='0'||!action)return null;
  try{
    const rt=await runtime();
    const view=shadowView(parsed,state,actions,rt);
    if(!view)return null;
    const row=shadowRow(rt.net,view,{action,source,state});
    await mkdir(new URL('../runtime/',import.meta.url),{recursive:true});
    await appendFile(out,JSON.stringify(row)+'\n');
    return row;
  }catch(e){
    if(!shadowWarned){shadowWarned=true;console.warn(`shadow disabled for this decision: ${e.message}`)}
    return null;
  }
}

// JEV_FOLLOW_NET=1 (bridge.mjs): the network's first choice among the same options the shadow log ranks.
// null when it has no view of the position (mulligan, not running) or anything goes wrong.
export async function netPick({parsed,state,actions}){
  try{
    const rt=await runtime();
    const view=shadowView(parsed,state,actions,rt);
    if(!view)return null;
    const ranked=rt.net.rank(view.s,view.legal);
    const i=view.legal.indexOf(ranked.steps[0]?.move);
    if(i<0)return null;
    return {action:actions[i],value:ranked.value,unknown:unknownCards(rt.net,view.s),top:ranked.steps.slice(0,3).map(x=>withNames(view.s,x))};
  }catch(e){
    console.warn(`network pick failed: ${e.message}`);
    return null;
  }
}

export function assertEncoded(view,net){
  const e=encode(view.s,view.legal,net.vocab);
  if(e.obs.length!==208)throw Error(`obs length ${e.obs.length}`);
  for(const [i,a] of e.acts.entries())if(a.length!==56)throw Error(`act ${i} length ${a.length}`);
  const bad=e.obs.findIndex(x=>!Number.isFinite(x));
  if(bad>=0)throw Error(`obs ${bad} is not finite`);
  for(const [i,a] of e.acts.entries()){
    const j=a.findIndex(x=>!Number.isFinite(x));
    if(j>=0)throw Error(`act ${i}.${j} is not finite`);
  }
  return e;
}

export async function readShadowRows(path=SHADOW_LOG){
  const text=await readFile(path,'utf8').catch(e=>e.code==='ENOENT'?'':Promise.reject(e));
  return text.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
}
