import {createParser} from './power.mjs';
import {cardSignals} from './history-matchup.mjs';

// Safe retrospective observations only: own hand and public cards; no player names.
export function reviewTimeline(text,{friendlyPlayerId,coin,cards}){
  if(![1,2].includes(friendlyPlayerId)||typeof coin!=='boolean')throw Error('Explicit player and initiative required');
  const p=createParser(),actions=[],turnEnds=[],turnStarts=[],stack=[],handTransitions=[],handEntries=[],pendingEntries=[];let sequence=0,definitionId=null,openingBoundary=null;
  const ownTurn=t=>coin?t%2===0:t%2===1;
  const card=e=>{
    const c=cards[e?.cardId];if(!c)return null;
    return {entityId:e.id,cardId:c.id,name:c.name,type:c.type,cost:Number(e.tags.COST??c.cost??0),
      attack:Number(e.tags.ATK??c.attack??0),health:Number(e.tags.HEALTH??c.health??0)-Number(e.tags.DAMAGE??0),
      dormant:e.tags.DORMANT==='1',...cardSignals(c)};
  };
  const snapshot=s=>{
    const es=[...s.entities.values()];
    const side=id=>{
      const player=es.find(e=>e.playerId===id),hero=es.find(e=>Number(e.tags.CONTROLLER)===id&&e.tags.ZONE==='PLAY'&&e.tags.CARDTYPE==='HERO');
      const visible=es.filter(e=>Number(e.tags.CONTROLLER)===id&&e.tags.ZONE==='PLAY');
      return {mana:Number(player?.tags.RESOURCES??0)-Number(player?.tags.RESOURCES_USED??0)-Number(player?.tags.OVERLOAD_LOCKED??0),
        maxMana:Number(player?.tags.RESOURCES??0),health:Number(hero?.tags.HEALTH??0)-Number(hero?.tags.DAMAGE??0),armor:Number(hero?.tags.ARMOR??0),
        heroAttack:Number(hero?.tags.ATK??0),heroId:hero?.id??null,
        board:visible.filter(e=>e.tags.CARDTYPE==='MINION').map(card).filter(Boolean),
        weapons:visible.filter(e=>e.tags.CARDTYPE==='WEAPON').map(e=>({...card(e),durability:Number(e.tags.DURABILITY??cards[e.cardId]?.durability??0)})).filter(e=>e.cardId),
        hand:id===friendlyPlayerId?es.filter(e=>Number(e.tags.CONTROLLER)===id&&e.tags.ZONE==='HAND').map(card).filter(Boolean):undefined};
    };
    return {own:side(friendlyPlayerId),opponent:side(3-friendlyPlayerId)};
  };
  for(const line of text.split(/\r?\n/)){
    sequence++;
    const before=p.result(),engineTurn=Number(before.game?.tags.TURN??0);
    const payload=line.match(/GameState\.DebugPrintPower\(\) -\s*(.*)/)?.[1];
    if(payload){
      const definition=payload.match(/FULL_ENTITY - Creating ID=(\d+)/);
      const reveal=payload.match(/(?:SHOW_ENTITY|CHANGE_ENTITY) - Updating Entity=(.+) CardID=/);
      if(definition)definitionId=Number(definition[1]);
      else if(reveal)definitionId=Number(reveal[1].match(/\bid=(\d+)/)?.[1]??(/^\d+$/.test(reveal[1])?reveal[1]:0))||null;
      else if(!payload.startsWith('tag='))definitionId=null;
    }
    if(/GameState\.DebugPrintPower\(\).*TAG_CHANGE Entity=GameEntity tag=TURN/.test(line)&&engineTurn)
      turnEnds.push({engineTurn,turn:Math.ceil(engineTurn/2),side:ownTurn(engineTurn)?'own':'opponent',state:snapshot(before)});
    let action=null;
    const block=line.match(/GameState\.DebugPrintPower\(\).*BLOCK_START BlockType=(\S+)/);
    if(block){
      const m=line.match(/BlockType=(PLAY|ATTACK) Entity=\[.*?\bid=(\d+)\b.*?\bplayer=(\d+)\]/);
      if(m&&engineTurn){
        const entityId=Number(m[2]),e=before.entities.get(entityId),targetId=Number(line.match(/\bTarget=\[.*?\bid=(\d+)\b/)?.[1]??0)||null;
        const target=before.entities.get(targetId);
        action={sequence,kind:m[1],entityId,card:card(e),engineTurn,turn:Math.ceil(engineTurn/2),side:Number(m[3])===friendlyPlayerId?'own':'opponent',
          depth:stack.length,originZone:e?.tags.ZONE??null,targetId,
          targetLabel:target?.tags.CARDTYPE==='HERO'?(Number(target.tags.CONTROLLER)===friendlyPlayerId?'own hero':'opponent hero'):card(target)?.name??null,
          before:snapshot(before),handToGraveyard:[],after:null};
        actions.push(action);
      }
      const sourceId=Number(line.match(/\bEntity=\[.*?\bid=(\d+)\b/)?.[1]??0);
      stack.push({action,source:card(before.entities.get(sourceId))});
    }
    const zone=line.match(/GameState\.DebugPrintPower\(\).*TAG_CHANGE Entity=(.+) tag=ZONE value=GRAVEYARD\b/);
    if(zone){
      const id=Number(zone[1].match(/\bid=(\d+)/)?.[1]??(/^\d+$/.test(zone[1])?zone[1]:0));
      const e=before.entities.get(id);
      if(e?.tags.ZONE==='HAND'&&Number(e.tags.CONTROLLER)===friendlyPlayerId){
        const root=stack.find(b=>b.action)?.action,c=card(e);
        if(c){
          if(root)root.handToGraveyard.push(c);
          handTransitions.push({sequence,engineTurn,turn:Math.ceil(engineTurn/2),card:c,
            sources:stack.map(b=>b.source).filter(Boolean),rootActionSequence:root?.sequence??null});
        }
      }
    }
    const enter=line.match(/GameState\.DebugPrintPower\(\).*TAG_CHANGE Entity=(.+) tag=ZONE value=HAND\b/);
    let entering=null;
    if(enter||payload==='tag=ZONE value=HAND'){
      const id=enter?Number(enter[1].match(/\bid=(\d+)/)?.[1]??(/^\d+$/.test(enter[1])?enter[1]:0)):definitionId,e=before.entities.get(id);
      if(e&&Number(e.tags.CONTROLLER)===friendlyPlayerId&&e.tags.ZONE!=='HAND'){
        entering={sequence,engineTurn,turn:Math.ceil(engineTurn/2),entityId:id,from:e.tags.ZONE??null,card:card(e),sources:stack.map(b=>b.source).filter(Boolean)};
        handEntries.push(entering);if(!entering.card)pendingEntries.push(entering);
      }
    }
    p.feed(line);
    const parsed=p.result();
    if(!openingBoundary&&Number(parsed.game?.tags.TURN??0)===1&&/GameState\.DebugPrintPower\(\).*TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_READY\b/.test(line))openingBoundary={sequence,stage:'first TURN=1 MAIN_READY'};
    for(let i=pendingEntries.length-1;i>=0;i--){const e=pendingEntries[i],c=card(parsed.entities.get(e.entityId));if(c){e.card=c;pendingEntries.splice(i,1);}}
    for(const b of stack)if(b.action&&!b.action.card)b.action.card=card(parsed.entities.get(b.action.entityId));
    if(/GameState\.DebugPrintPower\(\) -\s*BLOCK_END\s*$/.test(line)){
      const a=stack.pop()?.action;if(a){a.after=snapshot(parsed);a.endSequence=sequence;}
    }
    if(/GameState\.DebugPrintPower\(\).*TAG_CHANGE Entity=GameEntity tag=STEP value=MAIN_ACTION\b/.test(line)){
      const t=Number(parsed.game?.tags.TURN??0);
      if(t)turnStarts.push({sequence,engineTurn:t,turn:Math.ceil(t/2),side:ownTurn(t)?'own':'opponent',state:snapshot(parsed)});
    }
  }
  const s=p.result(),engineTurn=Number(s.game?.tags.TURN??0);
  if(engineTurn)turnEnds.push({engineTurn,turn:Math.ceil(engineTurn/2),side:ownTurn(engineTurn)?'own':'opponent',state:snapshot(s)});
  const roots=actions.filter(a=>a.depth===0);
  if(roots.some(a=>(a.side==='own')!==ownTurn(a.engineTurn)))throw Error('Root action initiative mismatch');
  return {actions,turnStarts,turnEnds,handTransitions,handEntries,openingBoundary};
}
