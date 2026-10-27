// Live corrections to the self-play network's pick (JEV_FOLLOW_NET=1). The network is rewarded only for the result, so
// once its value saturates it cannot tell apart orderings that the result does not punish (2026-10-25 zoo game:
// it attacked before a board-wide buff, and ended a turn with 2 mana and Life Tap unused). Each guard is narrow and
// says why it fired; the shadow row and the game log carry the reason.
import {fromState,hero,hpOf,moves,apply} from './sim.mjs';
import {isCoin} from './power.mjs';
import {simRoot} from './net-search.mjs';
import {buffDevelopmentActions} from './policy.mjs';
import {eggHaunt} from './egg-guard.mjs';

const BOARD_BUFF=/give your (?:other )?minions \+\d+\/\+\d+/i;
const DRAW_POWER=/draw a card/i;
const SPELL_TAX=/^all spells cost \(1\) more\.?$/i;
const isMawman=c=>c?.raw?.cardId==='BE_729'||SPELL_TAX.test(c?.text??'');
// Zakajz the Corruptor's Battlecry raises every spell in hand and deck by (1) for good (2026-10-27 v9 game 6 vs
// priest, turn 10: 5 mana, Zakajz first, and Ritual of C'Thun went from 1 to 2 with 1 mana left).
const ZAKAJZ=/increase the\s+cost of spells by \(1\)/i;
const isZakajz=c=>c?.raw?.cardId==='BE_728'||ZAKAJZ.test(c?.text??'');

// The game's options call a minion attack POWER too (until 2026-10-27 this matched ATTACK only, so the buff guard
// never fired live: v9 game vs warlock, turn 16, both Eggs and Kazakus attacked before Entropic Continuity).
const isMinionAttack=(s,a)=>(a.type==='ATTACK'||a.type==='POWER')&&a.targetId!=null&&s.me.some(b=>b.id===a.entityId&&b.type==='MINION');
// Playing card `id` from hand. The game's options call a card play POWER, not PLAY (until 2026-10-27 the buff and
// Mawman guards matched only PLAY and so never fired in a live game; the tests used PLAY).
const playOf=(a,id)=>a?.entityId===id&&a.type!=='ATTACK'&&a.type!=='END_TURN';

// The board-wide buff the hand can cast now, without a target.
function buffPlay(state,actions,s){
  for(const c of s.hand){
    if(!BOARD_BUFF.test(c.text)||c.cost>s.mana)continue;
    const a=actions.find(x=>playOf(x,c.id)&&x.targetId==null);
    if(a)return {action:a,card:c.name};
  }
  return null;
}

// A board buff held back for development (affordable, but not on the menu): the body that it waits for.
function developBeforeAttack(state,actions,s){
  for(const c of s.hand){
    if(!BOARD_BUFF.test(c.text)||c.cost>s.mana||actions.some(x=>playOf(x,c.id)))continue;
    const raw=(state.me.hand??[]).find(h=>h.entityId===c.id);
    const a=raw&&buffDevelopmentActions(state,actions,raw)[0];
    if(a)return {action:a,card:s.hand.find(h=>h.id===a.entityId)?.name,buff:c.name};
  }
  return null;
}

function lifeTap(state,actions){
  const power=(state.me.board??[]).find(c=>c.CARDTYPE==='HERO_POWER'&&DRAW_POWER.test(c.text??''));
  return power&&actions.find(a=>a.entityId===power.entityId&&a.targetId==null);
}

// Mawman Cultist taxes every spell, ours too (2026-10-25 zoo game: 4 mana, Mawman first, then Coin / Darkest Depths /
// Tachyon Barrage cost +1 and nothing fitted; Coin -> 2-cost spell -> Mawman was the line). The spells that can go
// first with Mawman still affordable after them: the set spending the most mana (tie: fewer cards), the Coin only when
// it lets more mana be spent. Spells that need a target, and board buffs with no minion to take them, are left out.
function spellsBeforeMawman(state,actions,s,pick){
  const mawman=s.hand.find(c=>c.id===pick.entityId);
  if(!mawman||!playOf(pick,mawman.id)||pick.targetId!=null)return null;
  // A second Mawman adds no tax over the one on the board; every Zakajz does.
  if(!isZakajz(mawman)&&(!isMawman(mawman)||s.me.some(b=>b.type==='MINION'&&SPELL_TAX.test(b.text))))return null;
  const act=c=>actions.find(x=>playOf(x,c.id)&&x.targetId==null);
  const board=s.me.some(b=>b.type==='MINION');
  const coin=s.hand.find(c=>c.type==='SPELL'&&isCoin(c.raw??c)&&act(c));
  // Board buffs last, so that a tie goes to the set without one: cast after the minion, the buff reaches it too.
  const spells=s.hand.filter(c=>c!==coin&&c.type==='SPELL'&&act(c)&&(board||!BOARD_BUFF.test(c.text)))
    .sort((a,b)=>BOARD_BUFF.test(a.text)-BOARD_BUFF.test(b.text));
  // Zakajz also makes the minions in hand cheaper, so the rest of the hand can fill the mana after it (2026-10-27 v9
  // game vs warlock, turn 12: 6 mana, Ritual first left 1 mana and Kazakus, 3 -> 2, stayed in hand; Zakajz, Kazakus
  // and Egg spent all 6). A turn is worth the printed cost of the cards it plays (mana paid as tax is no value);
  // a set goes first unless the whole turn is then worth less than the network's line.
  const z=isZakajz(mawman)?{down:1,up:1}:{down:0,up:1};
  const after=c=>Math.max(0,c.type==='SPELL'?c.cost+z.up:c.cost-z.down);
  const worth=c=>Number(c.raw?.baseCost??c.cost);
  const rest=s.hand.filter(c=>c!==mawman&&c!==coin&&actions.some(x=>playOf(x,c.id)));
  const fill=(left,cards)=>{let top=0;
    for(let m=0;m<1<<cards.length;m++){let n=0,v=0;
      cards.forEach((c,i)=>{if(m>>i&1){n+=after(c);v+=worth(c)}});
      if(n<=left&&v>top)top=v}
    return top;};
  const total=(set,spend,withCoin)=>{const left=s.mana+(withCoin?1:0)-spend-mawman.cost;
    return left<0?-1:set.reduce((v,c)=>v+worth(c),0)+worth(mawman)+fill(left,rest.filter(c=>!set.includes(c)));};
  const base=total([],0,false);
  let best=null;
  for(let m=1;m<1<<spells.length;m++){
    const set=spells.filter((c,i)=>m>>i&1),spend=set.reduce((n,c)=>n+c.cost,0);
    for(const withCoin of coin?[false,true]:[false]){
      if(spend+mawman.cost>s.mana+(withCoin?1:0))continue;
      const size=set.length+(withCoin?1:0),all=total(set,spend,withCoin);
      if(all<base)continue;
      if(!best||all>best.all||all===best.all&&(spend>best.spend||spend===best.spend&&size<best.size))best={set,spend,size,withCoin,all};
    }
  }
  if(!best)return null;
  const first=best.withCoin?coin:best.set[0];
  return {action:act(first),card:first.name,spells:best.set.map(c=>c.name),spend:best.spend,mawman:mawman.name,mana:s.mana};
}

// A card we lose anyway: discarded at the end of this turn (temporary), or when the Platysaur that drew it dies
// (doomed; the opponent usually kills it next turn). 2026-10-27 v9 game 5, turn 7: 1 mana left, Glacial Shard x2 in
// hand (one doomed), and the network ended the turn. The network is told about temporary cards but not doomed ones.
// The play the network ranks highest for that card; else one without a target, then one at an enemy, then any.
function expiringPlay(state,actions,top=[]){
  const hand=state.me.hand??[];
  const temp=c=>c.temporary?.expires==='end_of_own_turn'&&Number(c.temporary.confidence)>=0.9;
  const lost=[...hand.filter(temp),...hand.filter(c=>c.doomed&&!temp(c))];
  const enemy=new Set((state.opponent?.board??[]).map(c=>c.entityId));
  for(const c of lost){
    const plays=actions.filter(a=>playOf(a,c.entityId));
    if(!plays.length)continue;
    const t=top.find(x=>x.kind==='play'&&x.id===c.entityId);
    const a=t&&plays.find(x=>(x.targetId??null)===(t.targetId??null))||plays.find(x=>x.targetId==null)||plays.find(x=>enemy.has(x.targetId))||plays[0];
    return {action:a,card:c.name,why:temp(c)?'discarded at end of turn':'discarded when its Platysaur dies'};
  }
  return null;
}

// A Discover that makes the card Temporary (Cursed Catacombs): a card that costs more than the mana left is lost at
// the end of the turn (2026-10-27 v9 game vs warlock, turn 18: 3 mana, it took Blasphemy at 5 over Ritual of
// Summoning at 3). The network's highest-ranked card that fits the mana; Casts When Drawn cards are left out.
function temporaryDiscover(state,actions,pick,top){
  const ch=state.choice;
  if(!/make it <b>temporary<\/b>|make it temporary/i.test(ch.source?.text??''))return null;
  const mana=Number(state.me?.mana??0);
  const cost=e=>Number(e.COST??e.baseCost??0);
  const byId=new Map((ch.entities??[]).map(e=>[e.entityId,e]));
  const picked=byId.get(pick.entityId);
  if(!picked||cost(picked)<=mana)return null;
  const ok=e=>e&&cost(e)<=mana&&!/casts when drawn/i.test(e.text??'');
  const rank=id=>{const i=top.findIndex(x=>x.id===id);return i<0?1e9:i};
  const pool=actions.filter(a=>a.type==='CHOICE'&&ok(byId.get(a.entityId))).sort((a,b)=>rank(a.entityId)-rank(b.entityId));
  if(!pool.length)return null;
  const e=byId.get(pool[0].entityId);
  return {action:pool[0],card:e.name,cost:cost(e),over:`${picked.name} (${cost(picked)})`,mana};
}

// Draw before spending (2026-10-27 v9 game 5, turn 7: 4 mana, Twilight Egg, then Life Tap drew Ritual of Summoning
// with 1 mana left). When the network plays a card and, in the simulator, its next pick is the draw power anyway, the
// draw goes first: the same mana, and the card drawn can change what the rest of the turn is spent on. -> index in
// view.legal of the power, or -1.
export function tapFirst(net,view,i,deck){
  const m=view.legal[i],s=view.s;
  if(m?.kind!=='play'||!(s.power?.draw>0))return -1;
  const tap=view.legal.findIndex(x=>x?.kind==='power'&&x.targetId==null);
  if(tap<0)return -1;
  const root=simRoot(s,deck),sm=moves(root);
  const step=sm.find(x=>x.kind===m.kind&&(x.id??null)===(m.id??null)&&(x.targetId??null)===(m.targetId??null));
  if(!step)return -1;
  const r=apply(root,step);
  if(r.exact===false||r.s.seat!==root.seat||r.s.choice)return -1;
  // Ranked over the steps the game offers now (the simulator's menu is wider, e.g. it lets Glacial Shard freeze a hero).
  const same=(a,b)=>a.kind===b.kind&&(a.id??null)===(b.id??null)&&(a.targetId??null)===(b.targetId??null);
  const legal=moves(r.s).filter(x=>x.kind==='end'||view.legal.some(y=>y&&same(x,y)));
  if(!legal.length)return -1;
  const next=net.rank(r.s,legal).steps[0]?.move;
  return next?.kind==='power'?tap:-1;
}

// A minion that wipes the board at the start of our turn (Doomsayer, NEW1_021). The network encodes opponent minions
// only by atk/hp/taunt/ds/stealth, so it spends the turn on face damage and loses everything (2026-10-27 game 15,
// turn 11: Mawman 4/7 and Faceless Fanatic 2/6 went face, Ruinous Velocidrake 5/5 (Rush) hit the Doomsayer down to 2,
// and all five of our minions died at the start of the next turn). Two orders are forced while it lives: hit it before
// anything else, and do not put a minion from hand into it.
const WIPE_TEXT=/at the start of your turn,?\s*destroy all minions/i;
// Live card text keeps its HTML tags and stray entities ("At the start of your turn,& destroy ALL minions.").
const plainText=t=>String(t??'').replace(/<[^>]*>/g,' ').replace(/&[a-zA-Z#0-9]+;/g,' ').replace(/&/g,' ').replace(/\s+/g,' ').trim();
const isWipeMinion=e=>e?.CARDTYPE==='MINION'&&WIPE_TEXT.test(plainText(e.text));
const currentHp=e=>Math.max(0,(Number(e.HEALTH)||0)-(Number(e.DAMAGE)||0));
const statsOf=e=>(Number(e.ATK)||0)+currentHp(e);
const isRushOrCharge=c=>c.CARDTYPE==='MINION'&&/\brush\b|\bcharge\b/i.test(plainText(c.text));
const isMinionPlay=(a,hand)=>!!a&&a.type!=='ATTACK'&&a.type!=='END_TURN'&&a.type!=='CHOICE'
  &&(hand??[]).some(h=>h.entityId===a.entityId&&h.CARDTYPE==='MINION');

// The menu action a net `top` entry names, so the hold guard can follow the network's own ranking.
function topAction(t,actions){
  if(!t)return null;
  if(t.kind==='end')return actions.find(a=>a?.type==='END_TURN')??null;
  if(t.id==null)return null;
  return actions.find(a=>a&&a.entityId===t.id&&a.type!=='END_TURN'&&a.type!=='CHOICE'
    &&(a.targetId??null)===(t.targetId??null))??null;
}

function boardWipe(state,actions,pick,top){
  const opp=state?.opponent?.board??[],ours=state?.me?.board??[],hand=state?.me?.hand??[];
  const wipe=opp.find(isWipeMinion);
  if(!wipe)return null;
  const wHp=currentHp(wipe),wAtk=Number(wipe.ATK)||0,shield=!!wipe.DIVINE_SHIELD;
  const mine=new Map(ours.map(e=>[e.entityId,e]));
  const weapon=ours.find(e=>e.CARDTYPE==='WEAPON');
  // A menu entry that swings at something: it belongs to a body on our side (minion, hero or weapon), not to a hand card.
  const isOurSwing=a=>!!a&&a.targetId!=null&&a.type!=='PLAY'&&a.type!=='CHOICE'&&a.type!=='END_TURN'&&mine.has(a.entityId);
  const atk=id=>{const e=mine.get(id);if(!e)return 0;
    return (Number(e.ATK)||0)||(e.CARDTYPE==='HERO'?Number(weapon?.ATK)||0:0)};
  // Lethal on the enemy hero this turn: the wipe does not matter.
  const hero=opp.find(e=>e.CARDTYPE==='HERO');
  if(hero){
    const heroHp=currentHp(hero)+(Number(hero.ARMOR)||0);
    const face=actions.filter(a=>isOurSwing(a)&&a.targetId===hero.entityId);
    if(face.length&&face.reduce((n,a)=>n+atk(a.entityId),0)>=heroHp)return null;
  }
  const onWipe=actions.filter(a=>isOurSwing(a)&&a.targetId===wipe.entityId);
  // A Rush or Charge minion in hand reaches the Doomsayer the turn it lands, so it counts toward the kill.
  const rush=hand.filter(c=>isRushOrCharge(c)&&Number(c.COST??c.cost??99)<=Number(state.me.mana??0)
    &&actions.some(a=>a.entityId===c.entityId&&a.targetId==null&&a.type!=='ATTACK'&&a.type!=='END_TURN'&&a.type!=='CHOICE'));
  const hits=[...onWipe.map(a=>atk(a.entityId)),...rush.map(c=>Number(c.ATK)||0)];
  const sum=hits.reduce((n,x)=>n+x,0);
  // A Divine Shield eats the smallest hit, so that one point of Attack is lost.
  const killable=hits.length>0&&(shield?sum-Math.min(...hits)>=wHp:sum>=wHp);
  const worth=ours.filter(e=>e.CARDTYPE==='MINION').reduce((n,e)=>n+statsOf(e),0)
    >=opp.filter(e=>e.CARDTYPE==='MINION'&&e.entityId!==wipe.entityId).reduce((n,e)=>n+statsOf(e),0);
  if(killable&&worth){
    if(pick?.targetId===wipe.entityId)return null;
    const ranked=[...onWipe].sort((a,b)=>atk(a.entityId)-atk(b.entityId));
    // The kill waits on a Rush minion still in hand (no swing on the menu yet): let the play through.
    if(!ranked.length)return null;
    const one=shield?null:ranked.find(a=>atk(a.entityId)>=wHp);
    const a=one??ranked[ranked.length-1];
    return {action:a,guard:'kill_board_wipe',
      reason:`${wipe.name} ${wAtk}/${wHp} wipes our ${ours.filter(e=>e.CARDTYPE==='MINION').length} minions; hit it first`};
  }
  const played=hand.find(c=>c.entityId===pick?.entityId);
  if(!isMinionPlay(pick,hand))return null;
  const alt=(top??[]).map(t=>topAction(t,actions)).find(a=>a&&!isMinionPlay(a,hand));
  const action=alt??actions.find(a=>a?.type==='END_TURN');
  if(!action)return null;
  return {action,guard:'hold_minions_into_wipe',
    reason:`${wipe.name} ${wAtk}/${wHp} survives; keep ${played.name} out of it`};
}

// null: keep the network's pick. Otherwise {action,guard,reason}.
export function guardPick(state,actions,pick,top=[]){
  if(pick?.type==='CHOICE'&&state?.choice){
    const t=temporaryDiscover(state,actions,pick,top);
    return t&&{action:t.action,guard:'affordable_temporary_discover',reason:`${t.card} (${t.cost}) over ${t.over}: ${t.mana} mana and the card is Temporary`};
  }
  if(!pick||state?.choice)return null;
  // A board-wipe minion comes before every ordering guard: nothing else on the menu is worth keeping if all of our
  // minions die at the start of the next turn.
  const bw=boardWipe(state,actions,pick,top);
  if(bw)return bw;
  const s=fromState(state,actions,{full:true});
  // decks/priest-egg: Haunt on our own Egg of Khelos before anything else (egg-guard.mjs).
  const egg=eggHaunt(s);
  if(egg){
    const a=actions.find(x=>[...egg.haunts].some(id=>playOf(x,id))&&egg.eggs.has(x.targetId));
    if(a&&a!==pick)return {action:a,guard:'haunt_own_egg',reason:'Haunt on our Egg of Khelos: Taunt, +3 Health, Reborn'};
  }
  if(isMinionAttack(s,pick)){
    const b=buffPlay(state,actions,s);
    if(b)return {action:b.action,guard:'buff_before_attack',reason:`${b.card} before the attack`};
    // The planner's developBeforeBuff takes the buff off the menu until a body is played for it, but the network may
    // attack first, and the buff then lands after the attack (same game, turn 14). The body goes first.
    const d=developBeforeAttack(state,actions,s);
    if(d)return {action:d.action,guard:'develop_before_buff',reason:`${d.card} first, then ${d.buff}, then the attack`};
  }
  const w=spellsBeforeMawman(state,actions,s,pick);
  if(w)return {action:w.action,guard:'spells_before_mawman',reason:`${w.card} first: ${w.spells.join(' + ')} (${w.spend} mana) before ${w.mawman} with ${w.mana} mana`};
  if(pick.type==='END_TURN'){
    const e=expiringPlay(state,actions,top);
    if(e)return {action:e.action,guard:'expiring_card_before_end',reason:`${e.card} is ${e.why}`};
    const tap=lifeTap(state,actions);
    const handFull=Number(state.me.handCount??state.me.hand?.length??0)>=10;
    const deckEmpty=Number(state.me.deckCount??0)<=0;
    const threat=s.opp.filter(b=>b.type==='MINION').reduce((n,b)=>n+b.atk,0);
    const hp=hpOf(hero(s,'me'));
    if(tap&&!handFull&&!deckEmpty&&hp-2>threat+5)
      return {action:tap,guard:'life_tap_before_end',reason:`mana left; hero ${hp} vs board attack ${threat}`};
  }
  return null;
}
