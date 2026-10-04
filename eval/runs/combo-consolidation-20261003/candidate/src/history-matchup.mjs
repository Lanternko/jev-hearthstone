import {inflateRawSync} from 'node:zlib';
import {createParser,isCoin} from './power.mjs';
import {keptReceipt} from './mulligan-cohort.mjs';

// HDT's replay is a ZIP; validate the central entry and decompressed length.
export function replayText(zip){
  let end=-1;
  for(let p=zip.length-22;p>=Math.max(0,zip.length-65557);p--)if(zip.readUInt32LE(p)===0x06054b50){end=p;break;}
  if(end<0)throw Error('Missing ZIP directory');
  let p=zip.readUInt32LE(end+16);
  for(let n=0;n<zip.readUInt16LE(end+10);n++){
    if(zip.readUInt32LE(p)!==0x02014b50)throw Error('Invalid ZIP directory');
    const method=zip.readUInt16LE(p+10),compressed=zip.readUInt32LE(p+20),size=zip.readUInt32LE(p+24);
    const nameLength=zip.readUInt16LE(p+28),extra=zip.readUInt16LE(p+30),comment=zip.readUInt16LE(p+32);
    const name=zip.subarray(p+46,p+46+nameLength).toString('utf8'),offset=zip.readUInt32LE(p+42);
    p+=46+nameLength+extra+comment;
    if(name!=='output_log.txt')continue;
    if(zip.readUInt32LE(offset)!==0x04034b50)throw Error('Invalid ZIP local entry');
    if(zip.readUInt16LE(offset+6)&1)throw Error('Encrypted replay unsupported');
    const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);
    const bytes=zip.subarray(start,start+compressed);
    const data=method===0?bytes:method===8?inflateRawSync(bytes):null;
    if(!data||data.length!==size)throw Error('Invalid replay compression or length');
    return data.toString('utf8');
  }
  throw Error('Replay lacks output_log.txt');
}

const clean=s=>(s??'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
export function cardSignals(card){
  const text=clean(card.text);
  // AOE is a signal, not a sufficient control label (e.g. Secret Mage).
  const aoe=card.type==='SPELL'&&/(?:deal[^.]*\bto|destroy|return|freeze|transform)\s+(?:all|each)\s+(?:(?:other|enemy|friendly)\s+)*(?:minions?|characters|enemies)\b/i.test(text);
  const draw=card.type==='SPELL'&&/\bdraw\b/i.test(text);
  const ramp=card.type==='SPELL'&&!isCoin(card)&&/(?:gain|empty).*mana crystals?|mana crystals?.*gain/i.test(text);
  return {aoe,draw,ramp};
}

export function extractEvidence(text,{friendlyPlayerId,coin,cards}){
  if(![1,2].includes(friendlyPlayerId))throw Error('Missing explicit friendly player');
  const opponent=3-friendlyPlayerId,p=createParser(),plays=[],turns=[];
  let opening=null,lastTurn=0,initialHealth=null,current=null,firstAction=false,finalOpening=null;
  const entityCard=e=>{
    const c=cards[e?.cardId];if(!c)return null;
    return {entityId:e.id,cardId:e.cardId,name:c.name,type:c.type,cost:c.cost??null,
      baseAttack:c.attack??null,baseHealth:c.health??null,text:clean(c.text),
      attack:Number(e.tags.ATK??c.attack??0),health:Number(e.tags.HEALTH??c.health??0),
      ...cardSignals(c)};
  };
  const snapshot=parsed=>{
    if(!lastTurn)return;
    const opponentTurn=coin?lastTurn%2===1:lastTurn%2===0;
    if(!opponentTurn)return;
    const player=[...parsed.entities.values()].find(e=>e.playerId===opponent);
    const board=[...parsed.entities.values()].filter(e=>Number(e.tags.CONTROLLER)===opponent&&e.tags.ZONE==='PLAY'&&e.tags.CARDTYPE==='MINION').map(entityCard).filter(Boolean);
    turns.push({turn:Math.ceil(lastTurn/2),engineTurn:lastTurn,maxMana:Number(player?.tags.RESOURCES??0),board,
      plays:plays.filter(e=>e.engineTurn===lastTurn&&e.type!=='HERO_POWER').map(e=>({name:e.name,type:e.type,cost:e.cost}))});
  };
  for(const line of text.split(/\r?\n/)){
    const before=p.result();
    if(/GameState\.DebugPrintPower\(\) -\s*CREATE_GAME/.test(line)&&before.gameNumber>0)throw Error('Replay contains multiple games');
    if(/GameState\.SendChoices\(\)/.test(line)&&!opening){
      const c=[...before.choices.values()].find(c=>c.type==='MULLIGAN'&&c.playerId===friendlyPlayerId);
      if(c){const offered=c.entities.map(id=>entityCard(before.entities.get(id))).filter(c=>c&&!isCoin(c));opening={choiceId:c.id,offered};}
    }
    if(/GameState\.DebugPrintPower\(\).*TAG_CHANGE Entity=GameEntity tag=TURN/.test(line))snapshot(before);
    p.feed(line);
    const parsed=p.result();lastTurn=Number(parsed.game?.tags.TURN??0);
    // This boundary follows mulligan replacements and precedes both players' first draw.
    // MAIN_ACTION would incorrectly add the first player's turn-one draw.
    if(!finalOpening&&lastTurn===1&&/GameState\.DebugPrintPower\(\).*TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_READY\b/.test(line)){
      const hand=[...parsed.entities.values()].filter(e=>Number(e.tags.CONTROLLER)===friendlyPlayerId&&e.tags.ZONE==='HAND');
      const nonCoin=hand.filter(e=>!isCoin({cardId:e.cardId,name:cards[e.cardId]?.name}));
      const resolved=nonCoin.map(entityCard).filter(Boolean),expected=coin?4:3;
      finalOpening={cards:resolved,complete:nonCoin.length===expected&&resolved.length===expected,
        expectedCount:expected,stage:'TURN=1 STEP=MAIN_READY before first draw',
        failure:nonCoin.length!==expected?'unexpected_hand_size':resolved.length!==expected?'unknown_own_card':null};
    }
    // Renathal's setup trigger updates HEALTH after TURN=1; do not latch base 30.
    if(!firstAction){const hero=[...parsed.entities.values()].find(e=>Number(e.tags.CONTROLLER)===opponent&&e.tags.ZONE==='PLAY'&&e.tags.CARDTYPE==='HERO');if(hero)initialHealth=Number(hero.tags.HEALTH??cards[hero.cardId]?.health??0)||null;}
    if(lastTurn>=1&&/GameState\.DebugPrintPower\(\).*BLOCK_START BlockType=PLAY/.test(line))firstAction=true;
    const m=line.match(/GameState\.DebugPrintPower\(\).*BLOCK_START BlockType=PLAY Entity=\[.*?\bid=(\d+)\b.*?\bplayer=(\d+)\]/);
    if(m&&Number(m[2])===opponent){
      const id=Number(m[1]),e=parsed.entities.get(id);
      current={entityId:id,engineTurn:lastTurn,turn:Math.ceil(lastTurn/2),...entityCard(e)};
      plays.push(current);
    }
    // The server reveals a formerly hidden card immediately after public PLAY.
    if(current&&!current.cardId){const c=entityCard(parsed.entities.get(current.entityId));if(c)Object.assign(current,c);}
  }
  snapshot(p.result());
  const seen=new Set(),uniqueTurns=turns.filter(t=>{if(seen.has(t.engineTurn))return false;seen.add(t.engineTurn);return true;});
  const receipt=opening?keptReceipt(text,{choiceId:opening.choiceId,playerId:friendlyPlayerId,offeredIds:opening.offered.map(c=>c.entityId)}):{complete:false,reason:'missing_opening'};
  if(finalOpening?.complete&&receipt.complete&&receipt.kept.some(id=>!finalOpening.cards.some(c=>c.entityId===id))){
    finalOpening.complete=false;finalOpening.failure='kept_receipt_not_in_final_hand';
  }
  return {initialHealth,plays:plays.filter(e=>e.cardId&&e.type!=='HERO_POWER'),unresolvedPlays:plays.filter(e=>!e.cardId).length,
    earlyTurns:uniqueTurns.filter(t=>t.turn<=3),publicTurns:uniqueTurns,maxOpponentTurn:Math.max(0,...uniqueTurns.map(t=>t.turn)),
    opening,originalOpeningComplete:opening?.offered.length===(coin?4:3),
    finalOpening:finalOpening??{cards:[],complete:false,failure:'missing_first_MAIN_READY'},
    receiptComplete:receipt.complete,receiptFailure:receipt.reason??null,
    kept:opening?.offered.filter(c=>receipt.kept?.includes(c.entityId))??[]};
}

export function matchupSignals(evidence){
  const publicCards=new Map(evidence.plays.map(c=>[c.cardId,c]));
  const aoe=[...publicCards.values()].filter(c=>c.aoe),draw=[...publicCards.values()].filter(c=>c.draw),ramp=[...publicCards.values()].filter(c=>c.ramp);
  const earlyMinions=evidence.plays.filter(c=>c.turn>=1&&c.turn<=3&&c.type==='MINION');
  const strongBodies=earlyMinions.filter(c=>c.attack>0&&c.cost>=1&&c.cost<=3&&c.attack+c.health>=2*c.cost+3);
  const strongBoards=evidence.earlyTurns.filter(t=>t.board.reduce((sum,c)=>sum+c.attack,0)>=5&&t.board.filter(c=>c.attack>0).length>=2);
  const firstTwo=evidence.earlyTurns.filter(t=>t.turn<=2);
  const idleFirstTwo=firstTwo.length===2&&firstTwo.every(t=>t.plays.length===0&&t.board.length===0);
  return {fortyHealth:evidence.initialHealth===40,aoe:aoe.map(c=>c.name),draw:draw.map(c=>c.name),ramp:ramp.map(c=>c.name),
    strongBodies:strongBodies.map(c=>({name:c.name,turn:c.turn,cost:c.cost,attack:c.attack,health:c.health})),
    strongBoards:strongBoards.map(t=>({turn:t.turn,board:t.board.map(c=>({name:c.name,attack:c.attack,health:c.health}))})),
    earlyMinions:earlyMinions.map(c=>({name:c.name,turn:c.turn,cost:c.cost,attack:c.attack,health:c.health})),idleFirstTwo};
}
