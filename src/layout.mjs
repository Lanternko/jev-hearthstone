// Entity -> client pixel, for the Hearthstone board.
//
// The hand and board models are ports of Hearthstone Deck Tracker's own geometry
// (HearthSim/Hearthstone-Deck-Tracker, Windows/OverlayWindow.MouseOverDetection.cs
// and .Update.cs, read 2026-09-20). HDT places its hover regions on exactly these
// points across every resolution its userbase runs, so they are far better tested
// than anything we can measure from one screenshot.
//
// Hearthstone lays its UI out in a 4:3 box centred in the client and extends the
// backdrop sideways, so HORIZONTAL fractions are relative to that 4:3 box while
// VERTICAL ones are relative to full client height. `scaleX` is HDT's GetScaledXPos.
//
// Constants below that are marked MEASURED come from our own 2560x1440 screenshot
// and are kept because they are verified by live clicks; HDT has no equivalent.
import {mulliganCards} from './power.mjs';

export const L={
  // --- HDT-derived (see file header) -------------------------------------
  hand:{cardWidth:0.127,maxWidth:0.36,centerX:0.5,centerXNudge:0.035,centerY:0.95},
  board:{minionWidth:0.63/7,margin:0.0029,height:0.158,you:0.045,me:0.03},
  // --- MEASURED 2026-09-20, verified by live clicks ----------------------
  hero:{me:0.7667,you:0.1764,x:0.500},                 // 1280,1104 / 1280,254
  heroPower:{x:0.5914,me:0.7486,you:0.2188},           // 1514,1078 / 1514,315
  endTurn:{x:0.8125,y:0.4528},                         // 2080,652
  mulligan:{y:0.500,step:0.156,confirm:{x:0.500,y:0.806}},
  discover:{y:0.486,step:0.2027},                      // MEASURED 2026-09-20: centres 756/1282/1794, y 700
  maxBoard:7,
};

// Hearthstone renders 16:9 and letterboxes the remainder, so derive the content box.
export function contentBox(width,height){
  if(!(width>0&&height>0))throw Error('Bad client size');
  const w=Math.min(width,height*16/9),h=w*9/16;
  return {x:(width-w)/2,y:(height-h)/2,w,h};
}
// HDT's GetScaledXPos: map 0..1 across the centred 4:3 box.
const ratio=box=>(4/3)/(box.w/box.h);
const scaleX=(box,fx)=>box.x+box.w*ratio(box)*fx+box.w*(1-ratio(box))/2;
const at=(box,fx,fy)=>({x:box.x+fx*box.w,y:box.y+fy*box.h});
// Evenly spaced, centred on the box; step shrinks once the row exceeds `cap`.
function row(box,n,i,step,cap=Infinity){
  const s=Math.min(step,n>1?cap/(n-1):step);
  return box.x+box.w*(0.5+(i-(n-1)/2)*s);
}

// HDT GetCardSpacing: cards keep their natural width until the fan hits its cap.
function handSpacing(box,n){
  const card=box.h*L.hand.cardWidth,max=box.w*ratio(box)*L.hand.maxWidth;
  return n*card>max?max/n:card;
}
// HDT GetPlayerCardPosition. The y term is the arc: outer cards sit lower.
export function hand(box,i,n){
  if(n<1||i<0||i>=n)throw Error(`hand index ${i} of ${n}`);
  const s=handSpacing(box,n);
  const cx=box.x+box.w*L.hand.centerX-box.h*L.hand.centerXNudge;
  const cy=box.y+box.h*L.hand.centerY;
  let cardWidth=0,center=0,angle=0;
  if(n>3){angle=1;const w=40+n*2;cardWidth=w/n;center=-w/2;}
  const rightOfCenter=cardWidth*i+center;
  const lift=rightOfCenter>0?Math.sin(Math.abs(rightOfCenter)*Math.PI/180)*s/2:0;
  const f=n>1?1+Math.pow(Math.abs(i-Math.floor(n/2)),2)/(4*n)*0.11*angle+lift*0.0009:1;
  return {x:cx-s/2*(n-1-i*2),y:cy*f};
}
// Where to grab a hand card. HDT's point is its hover centre, low on the card, and in a tilted
// fan that low part of card i sits under card i+1: live 2026-09-24 at 7 cards, hovering HDT's
// point for card 6 raised card 7, and a whole turn's drags went to the wrong card. The part of a
// card nothing covers is its top-left, beside the cost gem. MEASURED by hover at 2560x1440,
// 7 cards (each point raised the intended card): offsets from HDT's point run linearly across
// the fan, from (-56,-48) on the far left to (+19,-111) on the far right. Fewer than 4 cards do
// not overlap, so they only need lifting off the bottom edge.
export function handGrab(box,i,n){
  const p=hand(box,i,n),k=box.h/1440;
  if(n<=3)return {x:p.x,y:p.y-40*k};
  const u=(i-(n-1)/2)/((n-1)/2);                 // -1 leftmost .. +1 rightmost
  const narrow=Math.min(1,handSpacing(box,n)/handSpacing(box,7));
  return {x:p.x+(-19+37.5*u)*k*narrow,y:p.y+(-80-31.5*u)*k};
}
// HDT lays the board out as a horizontal stack centred on the client, each slot
// one minion wide plus a margin either side.
const slotPitch=box=>box.w*ratio(box)*(L.board.minionWidth+2*L.board.margin);
export function board(box,i,n,side='me'){
  if(n<1||i<0||i>=n)throw Error(`board index ${i} of ${n}`);
  const h=box.h*L.board.height;
  const top=side==='me'
    ?box.h/2-box.h*L.board.me
    :box.h/2-h-box.h*L.board.you;
  return {x:box.x+box.w/2+(i-(n-1)/2)*slotPitch(box),y:box.y+top+h/2};
}
// Where to drop a minion being summoned into an n-minion board (n+1 gaps).
export function dropSlot(box,slot,n,side='me'){
  if(n>=L.maxBoard)throw Error('Board is full');
  return board(box,Math.max(0,Math.min(slot,n)),n+1,side);
}
export const hero=(box,side='me')=>at(box,L.hero.x,L.hero[side]);
export const heroPower=(box,side='me')=>at(box,L.heroPower.x,L.heroPower[side]);
export const endTurn=box=>at(box,L.endTurn.x,L.endTurn.y);
export const mulliganConfirm=box=>at(box,L.mulligan.confirm.x,L.mulligan.confirm.y);
export function mulligan(box,i,n){
  if(n<1||i<0||i>=n)throw Error(`mulligan index ${i} of ${n}`);
  return {x:row(box,n,i,L.mulligan.step),y:box.y+box.h*L.mulligan.y};
}
export function discover(box,i,n){
  if(n<1||i<0||i>=n)throw Error(`discover index ${i} of ${n}`);
  return {x:row(box,n,i,L.discover.step),y:box.y+box.h*L.discover.y};
}

// Locate an entity that publicState already placed, by its live zone and position.
export function locate(box,state,entityId){
  for(const side of ['me','opponent']){
    const s=state[side],key=side==='me'?'me':'you';
    const b=s.board??[];
    const i=b.findIndex(c=>c.entityId===entityId);
    if(i>=0){
      const c=b[i];
      if(c.CARDTYPE==='HERO')return {...hero(box,key),where:'hero'};
      if(c.CARDTYPE==='HERO_POWER')return {...heroPower(box,key),where:'heroPower'};
      const minions=b.filter(x=>['MINION','LOCATION'].includes(x.CARDTYPE));
      const j=minions.findIndex(x=>x.entityId===entityId);
      if(j>=0)return {...board(box,j,minions.length,key),where:'board'};
      return {...hero(box,key),where:'hero'};   // weapon: clicked via the hero
    }
  }
  const h=state.me.hand??[];
  const i=h.findIndex(c=>c.entityId===entityId);
  if(i>=0)return {...handGrab(box,i,h.length),where:'hand'};
  const isMull=state.choice?.type==='MULLIGAN';
  const ch=isMull?mulliganCards(state.choice.entities):(state.choice?.entities??[]);
  const k=ch.findIndex(c=>c.entityId===entityId);
  if(k>=0)return isMull
    ?{...mulligan(box,k,ch.length),where:'mulligan'}
    :{...discover(box,k,ch.length),where:'discover'};
  throw Error(`Entity ${entityId} is not on screen`);
}
