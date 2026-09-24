import {readdir,open,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const LOG_ROOT='D:/遊戲/Hearthstone/Logs';
export async function latestLog(root=LOG_ROOT){
  const dirs=await readdir(root,{withFileTypes:true});
  const files=await Promise.all(dirs.filter(d=>d.isDirectory()).map(async d=>{const p=join(root,d.name,'Power.log');try{return {path:p,stat:await stat(p)}}catch{return null}}));
  const f=files.filter(Boolean).sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs)[0];
  if(!f)throw Error('No Power.log found');return f;
}
// The parser keeps its state between calls so a growing Power.log is parsed once, not once per
// poll. The loop, the bridge and settled() used to re-read the whole file several times per
// action, and one file carries every game of a session, so each read got slower as the night
// went on. feed() takes complete lines only; snapshot() holds back a trailing partial line.
export function createParser(){
  let entities=new Map(),aliases=new Map(),game=null,block=null,options=null,option=null,choice=null,localPlayer=null,revision=0,gameNumber=0;
  let choices=new Map(),shownTurn=0;
  const ensure=id=>{if(!entities.has(id))entities.set(id,{id,cardId:'',tags:{}});return entities.get(id)};
  function resolve(s){
    const id=s.match(/\bid=(\d+)/)?.[1]??(/^\d+$/.test(s)?s:null);
    if(id)return Number(id);if(s==='GameEntity')return game;
    if(!aliases.has(s)&&/#\d+$/.test(s)&&aliases.has('UNKNOWN HUMAN PLAYER')){const unknown=aliases.get('UNKNOWN HUMAN PLAYER');aliases.delete('UNKNOWN HUMAN PLAYER');aliases.set(s,unknown);}
    return aliases.get(s);
  }
  function feed(text){
  // A chunk that ends in a newline would otherwise yield one phantom empty line per call and
  // make `revision` depend on how the file happened to be read.
  const lines=text.split(/\r?\n/);if(lines.length>1&&lines.at(-1)==='')lines.pop();
  for(const line of lines){
    revision++;
    let m=line.match(/GameState\.DebugPrintGame\(\) - PlayerID=(\d+), PlayerName=(.+)/);
    if(m){const p=[...entities.values()].find(e=>e.playerId===Number(m[1]));if(p){aliases.set(m[2].trim(),p.id);if(m[2].trim()!=='UNKNOWN HUMAN PLAYER'&&localPlayer==null)localPlayer=p.playerId;}continue}
    // GameState is the server's view and runs up to 8.5s ahead of the screen: it hands us our
    // turn while the opponent's is still being animated, and clicks then are dropped. The
    // PowerTaskList copy of the same line is written as the client plays it back.
    m=line.match(/PowerTaskList\.DebugPrintPower\(\) -\s*TAG_CHANGE Entity=GameEntity tag=TURN value=(\d+)/);
    if(m){shownTurn=Number(m[1]);continue}
    m=line.match(/GameState\.DebugPrintPower\(\) -\s*(.*)/);
    if(m){const s=m[1];
      if(s==='CREATE_GAME'){shownTurn=0;entities=new Map();aliases=new Map();game=null;block=null;options=null;choice=null;localPlayer=null;choices=new Map();gameNumber++;continue}
      let a=s.match(/GameEntity EntityID=(\d+)/);if(a){game=Number(a[1]);block=ensure(game);continue}
      a=s.match(/Player EntityID=(\d+) PlayerID=(\d+)/);if(a){block=ensure(Number(a[1]));block.playerId=Number(a[2]);continue}
      a=s.match(/FULL_ENTITY - Creating ID=(\d+) CardID=(\S*)/);if(a){block=ensure(Number(a[1]));block.cardId=a[2];continue}
      a=s.match(/(?:SHOW_ENTITY|CHANGE_ENTITY) - Updating Entity=(.+) CardID=(\S*)/);if(a){const id=resolve(a[1]);block=id==null?null:ensure(id);if(block)block.cardId=a[2];continue}
      a=s.match(/TAG_CHANGE Entity=(.+) tag=(\S+) value=(\S+)/);if(a){const id=resolve(a[1]);if(id!=null)ensure(id).tags[a[2]]=a[3];block=null;continue}
      a=s.match(/^tag=(\S+) value=(\S+)/);if(a&&block){block.tags[a[1]]=a[2];continue}
      a=s.match(/HIDE_ENTITY - Entity=(.+) tag=(\S+) value=(\S+)/);if(a){const id=resolve(a[1]);if(id!=null){ensure(id).tags[a[2]]=a[3];ensure(id).cardId='';}block=null;continue}
      block=null;continue;
    }
    m=line.match(/GameState\.DebugPrintOptions\(\) -\s*(.*)/);
    if(m){const s=m[1];let a=s.match(/^id=(\d+)/);if(a){options={id:Number(a[1]),revision,items:[]};option=null;continue}
      a=s.match(/^option (\d+) type=(\S+) mainEntity=(.*?) error=(\S+)/);if(a&&options){option={index:Number(a[1]),type:a[2],entityId:resolve(a[3]),error:a[4],targets:[],unsupported:false};options.items.push(option);continue}
      a=s.match(/^target (\d+) entity=(.*?) error=(\S+)/);if(a&&option){option.targets.push({index:Number(a[1]),entityId:resolve(a[2]),error:a[3]});continue}
      if(/^subOption/.test(s)&&option)option.unsupported=true;
    }
    m=line.match(/GameState\.SendChoices\(\) - id=(\d+)/);if(m){choices.delete(Number(m[1]));continue}
    m=line.match(/GameState\.DebugPrintEntityChoices\(\) -\s*(.*)/);
    if(m){let a=m[1].match(/^id=(\d+) Player=(.*?) TaskList=.*?ChoiceType=(\S+) CountMin=(\d+) CountMax=(\d+)/);
      if(a){const player=entities.get(aliases.get(a[2]));choice={id:Number(a[1]),playerId:player?.playerId,type:a[3],min:Number(a[4]),max:Number(a[5]),entities:[],revision};choices.set(choice.id,choice);continue}
      // The card that opened the choice. Cursed Catacombs makes its pick Temporary, which changes
      // what the pick is worth, and nothing on the offered cards themselves says so.
      a=m[1].match(/^Source=(.+)/);if(a&&choice){const id=resolve(a[1]);if(id!=null&&id!==game)choice.sourceId=id;continue}
      a=m[1].match(/^Entities\[\d+\]=(.+)/);if(a&&choice){const id=resolve(a[1]);if(id!=null)choice.entities.push(id)}
    }
  }
  return api;
  }
  const api={feed,result:()=>({entities,game:entities.get(game),options,choice,choices,localPlayer,revision,gameNumber,shownTurn})};
  return api;
}
export const parsePower=text=>createParser().feed(text).result();
const visibleTags=['COST','ATK','HEALTH','DAMAGE','ARMOR','DURABILITY','ZONE_POSITION','CARDTYPE','TAUNT','DIVINE_SHIELD','STEALTH','WINDFURY','FROZEN','EXHAUSTED','NUM_ATTACKS_THIS_TURN','SILENCED','CHARGE','RUSH','DORMANT','COOLDOWN','UNTARGETABLE_BY_SPELLS','IMMUNE'];
// Only what can change the decision. The full fingerprint also covers optionsId, step, status and playstate, which churn on every options print and animation and were discarding correct decisions.
function material(s){
  return {turn:s.turn,
    me:{playerId:s.me.playerId,mana:s.me.mana,maxMana:s.me.maxMana,current:s.me.current,hand:s.me.hand,board:s.me.board,deckCount:s.me.deckCount},
    opponent:{mana:s.opponent.mana,board:s.opponent.board,handCount:s.opponent.handCount},
    choice:s.choice&&{id:s.choice.id,type:s.choice.type,min:s.choice.min,max:s.choice.max,entities:s.choice.entities}};
}
export function publicState(parsed,playerId,cards={}){
  if(![1,2].includes(playerId))throw Error('Explicit local player ID 1 or 2 required');
  const all=[...parsed.entities.values()];
  function card(e){const def=cards[e.cardId]??{};return {entityId:e.id,cardId:e.cardId,name:def.name,text:def.text,baseCost:def.cost,baseAttack:def.attack,baseHealth:def.health,...Object.fromEntries(visibleTags.filter(t=>t in e.tags).map(t=>[t,/^\d+$/.test(e.tags[t])?Number(e.tags[t]):e.tags[t]]))}}
  function side(id){const es=all.filter(e=>Number(e.tags.CONTROLLER)===id),p=es.find(e=>e.playerId===id);return {playerId:id,mana:p?Number(p.tags.RESOURCES??0)+Number(p.tags.TEMP_RESOURCES??0)-Number(p.tags.RESOURCES_USED??0):null,maxMana:Number(p?.tags.RESOURCES??0),current:p?.tags.CURRENT_PLAYER==='1',playstate:p?.tags.PLAYSTATE,handCount:es.filter(e=>e.tags.ZONE==='HAND').length,deckCount:es.filter(e=>e.tags.ZONE==='DECK').length,board:es.filter(e=>e.tags.ZONE==='PLAY'&&['MINION','HERO','HERO_POWER','WEAPON','LOCATION'].includes(e.tags.CARDTYPE)).map(card).sort((a,b)=>(a.ZONE_POSITION??0)-(b.ZONE_POSITION??0)),...(id===playerId?{hand:es.filter(e=>e.tags.ZONE==='HAND').map(card).sort((a,b)=>a.ZONE_POSITION-b.ZONE_POSITION)}:{})}}
  const state={gameNumber:parsed.gameNumber,turn:Number(parsed.game?.tags.TURN??0),step:parsed.game?.tags.STEP,status:parsed.game?.tags.STATE,me:side(playerId),opponent:side(3-playerId),optionsId:parsed.options?.id};
  const activeChoice=[...parsed.choices.values()].filter(c=>c.playerId===playerId).at(-1);
  if(activeChoice&&(activeChoice.type!=='MULLIGAN'||state.step==='BEGIN_MULLIGAN')){const src=parsed.entities.get(activeChoice.sourceId);state.choice={...activeChoice,entities:activeChoice.entities.map(id=>parsed.entities.get(id)).filter(Boolean).map(card),...(src?{source:card(src)}:{})};}
  state.fingerprint=createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0,20);
  state.decisionFingerprint=createHash('sha256').update(JSON.stringify(material(state))).digest('hex').slice(0,20);return state;
}
// GAME_005, the classic coin, is the one variant whose id lacks "COIN", so match the name first.
export const isCoin=c=>c.name==='The Coin'||/COIN/i.test(c.cardId||'');
// The mulligan row shows only the replaceable cards. The Coin sits in hand and is not on that row,
// so it must not count towards either the candidate masks or the on-screen positions.
export const mulliganCards=entities=>(entities??[]).filter(e=>e.cardId&&!isCoin(e));
export function candidates(parsed,state){
  if(state.status!=='RUNNING')return [];
  if(state.choice){
    const c=state.choice;
    if(c.type==='GENERAL'&&c.min===1&&c.max===1)return c.entities.map(e=>({id:`c${c.id}e${e.entityId}`,type:'CHOICE',choiceId:c.id,entityId:e.entityId}));
    if(c.type==='MULLIGAN'){const es=mulliganCards(c.entities);if(es.length>5)return [];return Array.from({length:2**es.length},(_,mask)=>({id:`m${mask}`,type:'MULLIGAN',choiceId:c.id,replace:es.filter((e,i)=>mask&(1<<i)).map(e=>e.entityId)})).filter(a=>a.replace.length>=c.min&&a.replace.length<=c.max);}
    return [];
  }
  if(!state.me.current||state.step!=='MAIN_ACTION')return [];
  const result=[];
  for(const o of parsed.options?.items??[]){
    if(o.unsupported)continue;
    if(o.type==='END_TURN'){result.push({id:`o${o.index}`,type:'END_TURN',option:o.index});continue}
    if(o.error!=='NONE')continue;
    const e=parsed.entities.get(o.entityId);
    if(!e||Number(e.tags.CONTROLLER)!==state.me.playerId||!['HAND','PLAY'].includes(e.tags.ZONE))continue;
    const base={option:o.index,entityId:o.entityId,type:o.type};
    if(o.targets.length){for(const t of o.targets.filter(t=>t.error==='NONE'))result.push({...base,id:`o${o.index}t${t.index}`,targetId:t.entityId})}
    else result.push({...base,id:`o${o.index}`});
  }
  return result;
}
// One incremental reader per log file. A new session folder or a file that shrank starts over.
let tail=null;
async function readLog(f){
  if(!tail||tail.path!==f.path||f.stat.size<tail.offset)tail={path:f.path,offset:0,rest:Buffer.alloc(0),parser:createParser()};
  if(f.stat.size>tail.offset){
    const h=await open(f.path,'r');
    try{
      const buf=Buffer.alloc(f.stat.size-tail.offset);
      const {bytesRead}=await h.read(buf,0,buf.length,tail.offset);
      tail.offset+=bytesRead;
      const all=Buffer.concat([tail.rest,buf.subarray(0,bytesRead)]);
      // Cut at the last newline: 0x0A never occurs inside a multi-byte UTF-8 sequence.
      const cut=all.lastIndexOf(0x0a)+1;
      tail.rest=all.subarray(cut);
      if(cut)tail.parser.feed(all.subarray(0,cut).toString('utf8'));
    }finally{await h.close()}
  }
  return tail.parser.result();
}
export async function snapshot(playerId,cards={}){const f=await latestLog();const parsed=await readLog(f);const state=publicState(parsed,playerId??parsed.localPlayer,cards);return {source:f.path,mtime:f.stat.mtimeMs,parsed,state,actions:candidates(parsed,state)}};
