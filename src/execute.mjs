// Turn one Jev action into mouse gestures. plan() is pure so it can be tested without a game.
import * as X from './layout.mjs';
import {mulliganCards} from './power.mjs';
import {roles} from './describe.mjs';

const CARD=(state,id)=>[...(state.me.hand??[]),...(state.me.board??[]),...(state.opponent.board??[]),...(state.choice?.entities??[])].find(c=>c.entityId===id);

export function plan(box,state,action){
  const steps=[];
  const push=(p,what)=>steps.push({x:p.x,y:p.y,what});

  if(action.type==='MULLIGAN'){
    const cards=mulliganCards(state.choice?.entities);
    for(const id of action.replace){
      const i=cards.findIndex(c=>c.entityId===id);
      if(i<0)throw Error(`Mulligan card ${id} is not in the choice`);
      push(X.mulligan(box,i,cards.length),`toss ${CARD(state,id)?.name??id}`);
    }
    push(X.mulliganConfirm(box),'confirm mulligan');
    return steps;
  }
  if(action.type==='CHOICE'){
    push(X.locate(box,state,action.entityId),`pick ${CARD(state,action.entityId)?.name??action.entityId}`);
    return steps;
  }
  if(action.type==='END_TURN'){
    push(X.endTurn(box),'end turn');
    return steps;
  }

  // Everything else is a POWER option: a card played from hand, an attack, or a hero power.
  const src=X.locate(box,state,action.entityId);
  const card=CARD(state,action.entityId);
  push(src,`select ${card?.name??action.entityId}`);

  if(src.where==='hand'){
    if(['MINION','LOCATION'].includes(card?.CARDTYPE)){
      const n=(state.me.board??[]).filter(c=>['MINION','LOCATION'].includes(c.CARDTYPE)).length;
      push(X.dropSlot(box,n,n),`drop into slot ${n+1}`);   // rightmost; strategy.md never pins a position
    }else if(action.targetId==null){
      push(X.board(box,0,1,'me'),'play onto the board');
    }
  }
  // "target" meant both "attack this" and "discard this" and read as the latter never. Twice it
  // made a discard of a 6-cost card look like an attempt to hard-cast one on four mana. A target
  // still sitting in our own hand is not something you attack.
  if(action.targetId!=null){
    const inHand=(state.me.hand??[]).some(c=>c.entityId===action.targetId);
    const t=CARD(state,action.targetId)?.name??action.targetId;
    const verb=!inHand?'target':roles(card).includes('discard outlet')?'discard':'choose from hand';
    // A card played from hand has left it by the time its Battlecry picks a hand card, and the
    // fan closes up around the gap: locate the target in the hand as it is then, not as it was.
    const after=inHand&&src.where==='hand'
      ?{...state,me:{...state.me,hand:state.me.hand.filter(c=>c.entityId!==action.entityId)}}:state;
    push(X.locate(box,after,action.targetId),`${verb} ${t}`);
  }
  return steps;
}

// Playing a card from hand is the one gesture two clicks do not reliably perform: the client
// wants the card carried onto the board. Two live games lost every hand->board play this way
// while every single-click action (hero power, mulligan confirm, Discover) landed, so the drop
// is dragged instead.
const isDrop=s=>/^(drop into slot|play onto the board)/.test(s.what);
// The returned gestures carry the worker's trace of what Windows actually did, so a gesture
// that changed nothing can be told apart from one that was never injected. Nothing depends on
// the return value except the dead-gesture log.
export async function run(steps,win,{gap=260,dry=false}={}){
  const done=[],gestures=[];
  for(let i=0;i<steps.length;i++){
    const s=steps[i],nxt=steps[i+1];
    if(nxt&&isDrop(nxt)){
      if(dry){await win.move(s.x,s.y);await win.move(nxt.x,nxt.y)}
      else gestures.push({what:[s.what,nxt.what],...(await win.drag(s.x,s.y,nxt.x,nxt.y)).trace??{}});
      done.push(s,nxt);i++;
    }else{
      if(dry)await win.move(s.x,s.y);
      else gestures.push({what:[s.what],...(await win.click(s.x,s.y)).trace??{}});
      done.push(s);
    }
    if(done.at(-1)!==steps.at(-1))await new Promise(r=>setTimeout(r,gap));
  }
  return {steps:done,gestures};
}

export async function box(win){
  const g=await win.geometry();
  return {...X.contentBox(g.width,g.height),client:{width:g.width,height:g.height,focused:g.focused}};
}
