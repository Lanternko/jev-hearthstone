import {appendFile,mkdir,readFile} from 'node:fs/promises';
import {basename,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fromState} from './sim.mjs';
import {encode,obsSize,actSize} from './selfplay-encode.mjs';
import {loadList,rawCard,cardDb} from './selfplay.mjs';
import {deckName} from './deck.mjs';
import {tapFirst} from './net-guards.mjs';

export const SHADOW_LOG=new URL('../runtime/shadow.jsonl',import.meta.url);
// One network per deck; a deck without one is not shadowed and not followed. JEV_NET_MODEL names a file instead.
export const MODELS={'warlock-discard':'warlock-discard-v5','warlock-zoo':'warlock-zoo-v9','warlock-zakajz':'warlock-zoo-0.2.0'};
const runtimes=new Map();
let shadowWarned=false;

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
    // The Shreds of Time that Entropic Continuity, Twilight Timehopper and Tachyon Barrage shuffle in sit in the deck
    // face down; the simulator holds them there too.
    if(e.tags?.ZONE==='DECK'){if(e.generatedByContinuity||e.generatedShred)shreds++;continue}
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

// The zoo deck's picks are tokens made on the spot: C'Thun's abilities, Kazakus' effects and trials. The simulator
// names them by card id, so the live option does too (encoder thing()). The game offers a trial as CAP_405tb3b and
// puts CAP_405tb3 in hand, so the trailing b is dropped.
const PICK=/^(BE_013t[1-5]|CAP_405t[1-9]|CAP_405tb[1-3])b?$/;
const pickId=e=>PICK.exec(e?.cardId??'')?.[1]??null;

function choiceView(state,s,notes){
  if(state.choice?.type!=='GENERAL')return null;
  const options=state.choice.entities.map(e=>e.entityId);
  if(!options.length)return null;
  if(state.choice.entities.every(pickId)){
    const ids=state.choice.entities.map(pickId);
    return {kind:ids[0].startsWith('BE_013')?'cthun':ids[0].startsWith('CAP_405tb')?'kaz3':'kaz1',options:ids};
  }
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
  if(action.type==='CHOICE')return {kind:'choose',id:pickId(state.choice?.entities?.find(e=>e.entityId===action.entityId))??action.entityId};
  const c=boardCard(state,action.entityId),e=entity(parsed,action.entityId);
  const kind=handHas(state,action.entityId)?'play'
    :c?.CARDTYPE==='HERO_POWER'||e?.tags?.CARDTYPE==='HERO_POWER'?'power'
    :c?.CARDTYPE==='LOCATION'||e?.tags?.CARDTYPE==='LOCATION'?'use'
    :'attack';
  return {kind,id:action.entityId,...(action.targetId!=null?{targetId:action.targetId}:{})};
}

// Ritual of Summoning (BE_085) and Ritual of C'Thun (BE_726) fire at the start of their owner's second turn after the
// play, the simulator's `left` counting down at each such turn start. A play and the turn it is read both carry the
// engine's TURN tag, so the owner's turns are 2 apart and the opponent's are 1 off.
const RITUALS={BE_085:'summon',BE_726:'cthun'};
export function ritualTimers(plays,playerId,turn){
  const out=[];
  for(const p of plays??[]){
    const effect=RITUALS[p.cardId];
    if(!effect||p.playerId!==playerId||p.engineTurn>turn)continue;
    const left=2-Math.floor((turn-p.engineTurn)/2);
    if(left>0)out.push({left,effect});
  }
  return out;
}

// Godfather Kazakus' trials, by the card the game puts in hand: how many of their owner's turn starts until they fire.
const TRIAL_TURNS={CAP_405tb1:0,CAP_405tb2:1,CAP_405tb3:4};
const isTrial=e=>Object.hasOwn(TRIAL_TURNS,e?.cardId);

// A trial in play sits in the SECRET zone and counts the turn starts of its owner in QUEST_PROGRESS; the simulator's `left`
// is what remains of that (it fires when the count reaches the trial's length). Without the tag, count them like
// ritualTimers does, from the turn it was played. Effects the log never showed (the opponent's picks are hidden, or the
// bot joined late) come out as [] and are reported through `unknown`.
export function trialTimers(parsed,playerId,turn){
  const out=[];
  for(const e of parsed?.entities?.values()??[]){
    if(!isTrial(e)||Number(e.tags?.CONTROLLER)!==playerId||e.tags?.ZONE!=='SECRET')continue;
    const turns=TRIAL_TURNS[e.cardId];
    const play=parsed.publicPlays?.find(p=>p.entityId===e.id);
    const progress=e.tags.QUEST_PROGRESS!=null?Number(e.tags.QUEST_PROGRESS):play?Math.floor((turn-play.engineTurn)/2):0;
    const left=turns-progress;
    if(left>0)out.push({left,effect:'trial',effects:e.trialEffects??[],unknown:!e.trialEffects});
  }
  return out;
}

// What the encoder reads of a Kazakus: the picks made so far by one under way (s.kaz), and the length and effects of each
// trial in hand (c.trial). The trial timers are in trialTimers. Anything that cannot be rebuilt adds a note.
export function kazakusState(parsed,state,s,notes){
  const run=parsed?.kazRuns?.get(ownPlayer(state))??[];
  // The log offers the first and the second effect alike (choiceView calls both kaz1); the run says which one this is.
  const kind=s.choice?.kind;
  if(kind==='kaz1'||kind==='kaz3'){
    const made=kind==='kaz3'?2:run.length;
    if(kind==='kaz3'?run.length>=2:run.length<=1){
      if(made>=1)s.kaz={first:run[0],...(made===2?{second:run[1]}:{})};
      if(made===1)s.choice.kind='kaz2';
    }else notes.push('kazakus picks not reconstructed');
  }
  for(const c of s.hand){
    if(!isTrial(c.raw))continue;
    const effects=parsed?.entities?.get(c.id)?.trialEffects;
    if(effects?.length===2)c.trial={turns:TRIAL_TURNS[c.raw.cardId],effects};
    else notes.push('kazakus picks not reconstructed');
  }
}

export function shadowView(parsed,state,actions,{cards=cardDb(),list=loadList(deckName(state))}={}){
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
    timers:[...ritualTimers(parsed?.publicPlays,ownPlayer(state),num(state.turn)),...trialTimers(parsed,ownPlayer(state),num(state.turn))],
    them:{
      timers:[...ritualTimers(parsed?.publicPlays,oppPlayer(state),num(state.turn)),...trialTimers(parsed,oppPlayer(state),num(state.turn))],
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
  // The live state marks a temporary card `temporary` (power.mjs); the simulator the network learned in
  // says `temp`. Unmapped, the network was told "no temporary cards in hand" in every live game.
  for(const c of s.hand)if(c.raw?.temporary)c.temp=true;
  if(mine.note)notes.push(mine.note);
  s.choice=choiceView(state,s,notes);
  kazakusState(parsed,state,s,notes);
  for(const x of s.timers)if(x.unknown){notes.push('kazakus picks not reconstructed');break}
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
    createdAt,model:net.modelName??'warlock-discard-v5',gameNumber:state?.gameNumber,turn:state?.turn,
    mirror:state?.opponent?.heroClass==='WARLOCK',opponentClass:state?.opponent?.heroClass??null,
    value:ranked.value,legal:view.legal.length,top:ranked.steps.slice(0,3).map(x=>withNames(view.s,x)),
    jev:picked?{...withNames(view.s,picked),rank:jevStep,source}:null,
    agree:!!picked&&ranked.steps[0]?.move===picked.move,
    unknown:unknownCards(net,view.s),
    notes:view.notes
  };
}

// The network's name: the file's stem, since JEV_NET_MODEL may point anywhere. null: none for this deck.
export function modelFor(deck){
  if(process.env.JEV_NET_MODEL)return basename(resolve(process.env.JEV_NET_MODEL),'.json');
  return MODELS[deck]??null;
}
// The absolute file of that network, or null for a deck without one. game-zoo checks it before a game.
export function modelFile(deck){
  if(process.env.JEV_NET_MODEL)return resolve(process.env.JEV_NET_MODEL);
  return MODELS[deck]&&fileURLToPath(new URL(`../models/selfplay/${MODELS[deck]}.json`,import.meta.url));
}

// null: no network for this deck.
async function runtime(state){
  const deck=deckName(state),file=modelFile(deck);
  if(!file)return null;
  const key=`${deck}|${file}`;
  if(!runtimes.has(key)){
    const {loadNet}=await import('./selfplay-net.mjs');
    const net=loadNet(file);
    net.modelName=basename(file,'.json');
    runtimes.set(key,{cards:cardDb(),list:loadList(deck),net});
  }
  return runtimes.get(key);
}

export async function recordShadowDecision({parsed,state,actions,action,source,out=SHADOW_LOG}){
  if(process.env.JEV_SHADOW==='0'||!action)return null;
  try{
    const rt=await runtime(state);
    const view=rt&&shadowView(parsed,state,actions,rt);
    if(!view)return null;
    const row=shadowRow(rt.net,view,{action,source,state});
    if(lastSearch?.key===decisionKey(state,actions)){const {index,...info}=lastSearch.info;row.search=info;lastSearch=null}
    await mkdir(new URL('../runtime/',import.meta.url),{recursive:true});
    await appendFile(out,JSON.stringify(row)+'\n');
    return row;
  }catch(e){
    if(!shadowWarned){shadowWarned=true;console.warn(`shadow disabled for this decision: ${e.message}`)}
    return null;
  }
}

// JEV_NET_SEARCH=1 (src/net-search.mjs): the look ahead may overrule the network's first choice; any failure keeps it.
// The shadow row of the same decision carries what the search did (`search`; absent when it is off).
let lastSearch=null;
const decisionKey=(state,actions)=>`${state?.gameNumber}|${state?.turn}|${actions.map(a=>a.id).join()}`;
async function lookAhead(net,view,ranked,state,actions){
  try{
    const {searchedPick}=await import('./net-search.mjs');
    const info=searchedPick({net,view,ranked,state});
    lastSearch={key:decisionKey(state,actions),info};
    return info;
  }catch(e){
    return {on:true,index:null,error:e.message};
  }
}

// JEV_FOLLOW_NET=1 (bridge.mjs): the network's first choice among the same options the shadow log ranks.
// null when it has no view of the position (mulligan, not running) or anything goes wrong.
export async function netPick({parsed,state,actions}){
  try{
    const rt=await runtime(state);
    const view=rt&&shadowView(parsed,state,actions,rt);
    if(!view)return null;
    const ranked=rt.net.rank(view.s,view.legal);
    const greedy=view.legal.indexOf(ranked.steps[0]?.move);
    if(greedy<0)return null;
    const search=process.env.JEV_NET_SEARCH==='1'?await lookAhead(rt.net,view,ranked,state,actions):null;
    const i=search?.index??greedy;
    const tap=search?.override?-1:tapFirst(rt.net,view,i,deckName(state));
    const guard=tap>=0?{action:actions[tap],guard:'tap_before_play',reason:`the network plays ${withNames(view.s,{move:view.legal[i],p:0}).name} and then Life Taps; drawing first`}:null;
    return {action:actions[i],...(guard?{guard}:{}),value:ranked.value,unknown:unknownCards(rt.net,view.s),top:ranked.steps.slice(0,3).map(x=>withNames(view.s,x)),...(search?{search}:{})};
  }catch(e){
    console.warn(`network pick failed: ${e.message}`);
    return null;
  }
}

export function assertEncoded(view,net){
  const e=encode(view.s,view.legal,net.vocab);
  if(e.obs.length!==obsSize(net.vocab))throw Error(`obs length ${e.obs.length}`);
  for(const [i,a] of e.acts.entries())if(a.length!==actSize(net.vocab))throw Error(`act ${i} length ${a.length}`);
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
