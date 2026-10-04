// A small, honest simulator for the part of a turn that is arithmetic.
//
// Jev scores one option at a time, so a turn that needs three attacks in the right order -- kill
// the Taunt, then go face -- exists in none of its options. The answer is not more prose; it is
// to compute the sequences and hand Jev whole plans to choose between. That needs a model of what
// each step does, and the model must never pretend: a step it cannot predict is marked inexact,
// the plan ends there, and the turn is re-planned from the real board after it.
//
// Exact: attacks (Taunt, Divine Shield, armour, Windfury, Poisonous, Lifesteal), minions whose
// whole text is keywords, and board-wide +X/+Y buffs (with Whispers' lowest-cost discard).
// Inexact: Deathrattles and Reborn on a death, attack triggers, weapon text, anything random.

import {textOf,heroAttackGain,ignoresTaunt,immediateDraws} from './mechanics.mjs';
import {drawImpact} from './draw-risk.mjs';
import {assessEffect} from './effect-state.mjs';
const flat=t=>textOf({text:t});
const on=(c,tag)=>c?.[tag]===1||c?.[tag]==='1';
const num=v=>Number(v??0);
const cost=c=>num(c?.COST??c?.baseCost);
const silenced=c=>on(c,'SILENCED');
// A keyword counts when the tag says so, or -- for a card whose tags are not set yet -- its text.
const kw=(c,tag,word)=>c?.[tag]!=null?on(c,tag):(!silenced(c)&&new RegExp(`\\b${word}\\b`,'i')
  .test(flat(c?.text).replace(/all friendly attacks ignore taunt\.?/i,'')));

// Things that happen in combat the model does not follow. Any of them on a participant makes the
// swing inexact. Deathrattle and Reborn only matter when the body actually dies.
// Match the event before the comma, not its reward: Mana Wyrm's
// "Whenever you cast a spell, gain +1 Attack" does not trigger during combat.
const COMBAT_TRIGGER=/\b(?:after|whenever|when)\b[^.,]*\b(?:attacks?|damaged?|dies|die|destroy|kills?)\b|\boverkill\b|\bfrenzy\b|\bhonorable kill\b|\bspellburst\b/i;
const ON_DEATH=/\bdeathrattle\b|\breborn\b/i;
// Text a card hands to others sits in quotes: Braingill's Battlecry gives Murlocs "Deathrattle:
// Draw a card." and has none itself. Reading it as its own Deathrattle cut every plan that killed it.
const ownText=t=>(t??'').replace(/"[^"]*"/g,'');
// Chronoclaws: the swing is plain arithmetic; only the hand changes, and predictably so.
const DISCARD_HIGH=/^after your hero attacks, discard your highest cost card\.?$/i;

function body(c,side){
  const hp=num(c.HEALTH??c.baseHealth)-num(c.DAMAGE);
  return {id:c.entityId,cardId:c.cardId,effectAssessment:assessEffect(c,{zone:'PLAY'}),side,type:c.CARDTYPE,name:c.name,text:silenced(c)?'':flat(c.text),
    atk:num(c.ATK??c.baseAttack),hp,maxHp:num(c.HEALTH??c.baseHealth),armor:num(c.ARMOR),
    taunt:kw(c,'TAUNT','taunt'),ds:on(c,'DIVINE_SHIELD'),stealth:on(c,'STEALTH'),
    poison:kw(c,'POISONOUS','poisonous'),lifesteal:kw(c,'LIFESTEAL','lifesteal'),
    windfury:kw(c,'WINDFURY','windfury'),rush:kw(c,'RUSH','rush'),ignoreTaunt:ignoresTaunt(c),
    exhausted:on(c,'EXHAUSTED'),
    zeroReady:c.CARDTYPE==='MINION'&&num(c.ATK??c.baseAttack)===0
      &&(c.EXHAUSTED===0||c.EXHAUSTED==='0')&&!on(c,'FROZEN')&&!on(c,'DORMANT'),
    dormant:on(c,'DORMANT'),immune:on(c,'IMMUNE'),frozen:on(c,'FROZEN'),
    attacks:num(c.NUM_ATTACKS_THIS_TURN)};
}

// The planning view of a public state. `canAttack` and `targets` come from the game's own options
// at the start, because only the game knows about summoning sickness, Rush and odd restrictions.
export function fromState(state,actions=[]){
  // A minion at 0 Health is already dead; the log just has not moved it to the graveyard yet.
  const live=b=>b.type==='HERO'||b.hp>0;
  const mine=(state.me.board??[]).filter(c=>['MINION','HERO'].includes(c.CARDTYPE)).map(c=>body(c,'me')).filter(live);
  const theirs=(state.opponent.board??[]).filter(c=>['MINION','HERO'].includes(c.CARDTYPE)).map(c=>body(c,'opp')).filter(live);
  const weapon=(state.me.board??[]).find(c=>c.CARDTYPE==='WEAPON');
  const locations=(state.me.board??[]).filter(c=>c.CARDTYPE==='LOCATION').length;
  const t0=new Map();
  for(const a of actions)if(a.targetId!=null&&mine.some(b=>b.id===a.entityId)){
    if(!t0.has(a.entityId))t0.set(a.entityId,new Set());
    t0.get(a.entityId).add(a.targetId);
  }
  const oppHero=theirs.find(b=>b.type==='HERO');
  const tauntUp=theirs.some(guards);
  for(const b of mine){
    b.canAttack=t0.has(b.id);
    b.targets=t0.get(b.id)??new Set();
    // Rush on its first turn: may swing at minions only. Visible directly when nothing guards the
    // hero; behind a Taunt it cannot be told, so a Rush body is assumed to be the rush-only kind.
    b.rushOnly=b.canAttack&&!!oppHero&&!b.targets.has(oppHero.id)&&(!tauntUp||b.rush);
    b.maxAttacks=b.windfury?2:1;
  }
  const plays=new Set(actions.filter(a=>a.targetId==null&&(state.me.hand??[]).some(c=>c.entityId===a.entityId)).map(a=>a.entityId));
  // Game 19 (2026-09-29), turn 14: on a full board the game offers no minion from hand, so Duke of
  // Below, 16/16 Rush, was never searched; a 1/1 popping Taelan's shield would have made the room.
  // A minion the mana covers is playable once a death frees a slot (moves() checks the room).
  if(mine.filter(b=>b.type==='MINION').length+locations>=7)
    for(const c of state.me.hand??[])if(c.CARDTYPE==='MINION'&&cost(c)<=num(state.me.mana))plays.add(c.entityId);
  const hp=(state.me.board??[]).find(c=>(heroAttackGain(c)>0||immediateDraws(c,state)>0)
    &&actions.some(a=>a.entityId===c.entityId&&a.targetId==null));
  return {mana:num(state.me.mana),hand:(state.me.hand??[]).map(c=>({id:c.entityId,name:c.name,type:c.CARDTYPE,cost:cost(c),text:flat(c.text),
      atk:num(c.ATK??c.baseAttack),hp:num(c.HEALTH??c.baseHealth),raw:c,playable:plays.has(c.entityId)})),
    me:mine,opp:theirs,weapon:weapon?weaponBody(weapon):null,
    power:hp?{id:hp.entityId,name:hp.name,cost:cost(hp),gain:heroAttackGain(hp),draw:immediateDraws(hp,state),
      selfHit:Number(/take \$?(\d+)\s*damage/i.exec(flat(hp.text))?.[1]??0),used:on(hp,'EXHAUSTED')}:null,
    drawState:{me:{deckCount:state.me.deckCount,fatigue:state.me.fatigue,drawHazards:state.me.drawHazards}},
    locations,tauntAtStart:tauntUp,faceDealt:0,nextToken:0};
}

const weaponBody=c=>({id:c.entityId,name:c.name,text:flat(c.text),atk:num(c.ATK??c.baseAttack),
  durability:c.HEALTH!=null||c.baseHealth!=null?num(c.HEALTH??c.baseHealth)-num(c.DAMAGE)
    :c.DURABILITY!=null?num(c.DURABILITY):null});
const clone=s=>({...s,hand:s.hand.map(c=>({...c})),me:s.me.map(b=>({...b})),opp:s.opp.map(b=>({...b})),
  weapon:s.weapon&&{...s.weapon},power:s.power&&{...s.power}});
const room=s=>7-s.me.filter(b=>b.type==='MINION').length-s.locations;
const guards=b=>b.type==='MINION'&&b.taunt&&!b.stealth&&!b.dormant;
export const hero=(s,side)=>(side==='me'?s.me:s.opp).find(b=>b.type==='HERO');
export const hpOf=b=>b?b.hp+b.armor:0;

// What a card from hand does, if the model can say exactly. null means: not a plan step.
const KEYWORDS=/\b(?:taunt|rush|charge|divine shield|windfury|stealth|poisonous|lifesteal)\b/gi;
const BUFF=/^give your (other )?minions \+(\d+)\/\+(\d+)\.?$/i;
const IGNORABLE=/^shuffle [^.]* into your deck\.?$/i;         // deck contents are not on the board
const DISCARD_LOW=/^discard your lowest cost card\.?$/i;
// Battlecries whose whole effect is fixed: summon N plain X/Y tokens (keywords allowed), and a
// flat hit to your own hero. Anything else in the text -- "for your opponent", "for each", a
// random or conditional clause -- leaves the minion unmodelled.
const COUNT={a:1,an:1,one:1,two:2,three:3};
const SUMMON=/^battlecry: summon (a|an|one|two|three) (\d+)\/(\d+) [a-z' -]+?(?: with ((?:(?:taunt|rush|divine shield|poisonous|lifesteal|windfury|stealth)(?:,? and |, | )?)+))?\.?$/i;
const SELF_HIT=/^deal (\d+) damage to your hero\.?$/i;
export function cardModel(c){
  // Kayn's continuous aura is recalculated from the surviving board after every swing.
  if(c.type==='MINION'&&/^charge\s+all friendly attacks ignore taunt\.?$/i.test(c.text))return {kind:'minion'};
  // Equip itself is deterministic; Scythe's generated card makes its later swing terminal.
  // Game 16 (2026-09-29), turn 16: Chronoclaws in hand was left out of the search, which then
  // missed ten damage of lethal. Its discard is simulated on the swing, like an equipped one.
  if(c.type==='WEAPON'&&(!c.text||/^after your hero attacks, get a void soul\.?$/i.test(c.text)||DISCARD_HIGH.test(c.text)))return {kind:'weapon'};
  if(c.type==='MINION'){
    let summon=null,selfHit=0;
    // Duke of Below: the growth is already in the tags, so it is a statline, not an effect.
    const text=c.text.replace(/\bhas \+\d+\/\+\d+ for each card you'?ve discarded this game\.?/i,'');
    for(const p of text.split(/(?<=\.)\s+/).filter(Boolean)){
      const m=/\b(?:for|each|if|random|opponent)\b/i.test(p)?null:SUMMON.exec(p);
      if(m&&!summon){summon={n:COUNT[m[1].toLowerCase()],atk:Number(m[2]),hp:Number(m[3]),with:(m[4]??'').toLowerCase()};continue}
      const h=SELF_HIT.exec(p);
      if(h){selfHit+=Number(h[1]);continue}
      if(p.replace(KEYWORDS,'').replace(/[\s.,]/g,''))return null;
    }
    return {kind:'minion',...(summon?{summon}:{}),...(selfHit?{selfHit}:{})};
  }
  if(c.type!=='SPELL')return null;
  if(/^draw (?:a|an|one|two|three|\d+) cards?\.(?: they are temporary\.| at the end of turn, discard them\.)?$/i.test(c.text))
    return {kind:'draw',n:immediateDraws(c.raw)};
  const parts=c.text.split(/(?<=\.)\s+/).filter(Boolean);
  let buff=null,discard=false;
  for(const p of parts){
    const m=BUFF.exec(p);
    if(m){buff={other:!!m[1],atk:Number(m[2]),hp:Number(m[3])};continue}
    if(DISCARD_LOW.test(p)){discard=true;continue}
    if(IGNORABLE.test(p))continue;
    return null;
  }
  return buff?{kind:'buff',...buff,discard}:null;
}
const FODDER=/if you discard this|when you (?:play or )?discard this/i;
const DRAW_ONLY=/^(?:when|if) you (?:play or )?discard this, draw (?:a|an|one|two|three|\d+) cards?\.?$/i;

// Every exact-or-terminal step available in s. Each is {kind,id,targetId?}.
export function moves(s){
  const out=[];
  const oppAlive=s.opp.filter(b=>b.hp>0);
  const wall=oppAlive.some(guards);
  const bypass=s.me.some(b=>b.hp>0&&b.ignoreTaunt);
  for(const a of s.me){
    if(!a.canAttack||a.hp<=0||a.atk<=0||a.frozen||a.dormant||a.attacks>=a.maxAttacks)continue;
    for(const t of oppAlive){
      if(t.stealth||t.dormant||t.immune)continue;
      if(wall&&!bypass&&!guards(t))continue;
      if(t.type==='HERO'&&a.rushOnly)continue;
      // A hero swinging into a minion takes its Attack back. A game was lost on exactly that:
      // 5 Health into a 7-Attack Void Terror, planned as an ordinary trade.
      if(a.type==='HERO'&&t.type==='MINION'&&!a.immune&&!a.ds&&t.atk>=hpOf(a))continue;
      // The game's own targets rule while the Taunt picture is unchanged; once the last Taunt
      // is gone, the bodies behind it open up.
      const known=a.targets.has(t.id)||(s.tauntAtStart&&(!wall||bypass));
      if(!known)continue;
      out.push({kind:'attack',id:a.id,targetId:t.id});
    }
  }
  const h=hero(s,'me');
  if(s.power&&!s.power.used&&s.power.cost<=s.mana&&h
    &&(s.power.draw||!h.frozen&&!h.exhausted&&h.attacks<h.maxAttacks))
    out.push({kind:'power',id:s.power.id});
  const free=room(s);
  for(const c of s.hand){
    if(!c.playable||c.cost>s.mana)continue;
    const m=cardModel(c);
    if(!m||(m.kind==='minion'&&free<=0))continue;
    out.push({kind:'play',id:c.id});
  }
  return out;
}

function strike(dealer,victim,n){
  if(n<=0)return;
  if(victim.ds){victim.ds=false;return}
  if(victim.immune)return;
  if(victim.type==='HERO'){const soak=Math.min(victim.armor,n);victim.armor-=soak;n-=soak}
  victim.hp-=n;
  if(dealer.poison&&victim.type==='MINION')victim.hp=Math.min(victim.hp,0);
  return true;
}

// Apply a step. Returns {s,exact,note}: exact=false means the result is a best guess and the plan
// must stop after this step.
export function apply(s0,m){
  const s=clone(s0);
  if(m.kind==='power'){
    const h=hero(s,'me');
    s.mana-=s.power.cost;s.power.used=true;h.atk+=s.power.gain;
    if(s.power.draw){
      const r=drawImpact({me:{...s.drawState.me,hand:s.hand}},s.power.draw);
      strike({},h,s.power.selfHit+r.damageMin);
      s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax);
      return {s,exact:false,note:`draw ${s.power.draw}; at most ${r.cardsMax} hand cards, at least ${r.damageMin} draw damage and ${s.power.selfHit} self-damage; observe the hand and replan`};
    }
    enableHero(s,h);
    return {s,exact:true,note:''};
  }
  if(m.kind==='attack'){
    const a=s.me.find(b=>b.id===m.id),t=s.opp.find(b=>b.id===m.targetId);
    let exact=true;const notes=[];
    if(COMBAT_TRIGGER.test(a.text)||COMBAT_TRIGGER.test(t.text)){exact=false;notes.push('a combat trigger fires')}
    if(a.type==='HERO'&&s.weapon?.text){
      if(DISCARD_HIGH.test(s.weapon.text)){
        if(s.hand.length){
          const top=Math.max(...s.hand.map(x=>x.cost)),tied=s.hand.filter(x=>x.cost===top),lost=tied[0];
          s.hand=s.hand.filter(x=>x!==lost);s.discarded=[...(s.discarded??[]),lost];
          if(DRAW_ONLY.test(lost.text)){
            exact=false;const n=immediateDraws(lost.raw),r=drawImpact({me:{...s.drawState.me,hand:s.hand}},n);
            if(tied.length===1){strike({},a,r.damageMin);s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax)}
            notes.push(`discard draw ${n}: at least ${r.damageMin} damage if selected; observe and replan`);
          }
          if(tied.length>1){exact=false;notes.push(`${s.weapon.name} discards one of ${tied.map(x=>x.name).join(', ')} at random`)}
          if(FODDER.test(lost.text)&&!DRAW_ONLY.test(lost.text)){exact=false;notes.push(`discarding ${lost.name} triggers its text`)}
        }
      }else{exact=false;notes.push(`${s.weapon.name} triggers`)}
    }
    const before=hpOf(t);
    const hitT=strike(a,t,a.atk);
    if(t.type==='MINION')strike(t,a,t.atk);
    if(hitT&&a.lifesteal){const h=hero(s,'me');if(h)h.hp=Math.min(h.maxHp,h.hp+a.atk)}
    if(t.type==='HERO')s.faceDealt+=before-hpOf(t);
    a.attacks++;a.stealth=false;
    if(a.type==='HERO'&&s.weapon?.durability!=null){
      s.weapon.durability--;
      if(s.weapon.durability<=0){a.atk=Math.max(0,a.atk-s.weapon.atk);s.weapon=null;}
    }
    for(const b of [a,t])if(b.hp<=0&&b.type==='MINION'&&ON_DEATH.test(ownText(b.text))){exact=false;notes.push(`${b.name} dies with a Deathrattle/Reborn`)}
    s.me=s.me.filter(b=>b.hp>0||b.type==='HERO');s.opp=s.opp.filter(b=>b.hp>0||b.type==='HERO');
    return {s,exact,note:notes.join('; ')};
  }
  if(m.kind==='play'){
    const i=s.hand.findIndex(c=>c.id===m.id),c=s.hand[i],model=cardModel(c);
    s.hand.splice(i,1);s.mana-=c.cost;
    if(model.kind==='draw'){
      const r=drawImpact({me:{...s.drawState.me,hand:s.hand}},model.n);
      const h=hero(s,'me');if(h)strike({},h,r.damageMin);
      s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax);
      return {s,exact:false,note:`draw ${model.n}; at most ${r.cardsMax} hand cards and at least ${r.damageMin} draw damage; observe the hand and replan`};
    }
    if(model.kind==='weapon'){
      const h=hero(s,'me'),previous=s.weapon;
      s.weapon=weaponBody(c.raw);
      if(h){h.atk=Math.max(0,h.atk-(previous?.atk??0))+s.weapon.atk;enableHero(s,h)}
      // Replacing an unknown Deathrattle weapon may change the board or hand.
      const exact=!previous||!ON_DEATH.test(previous.text);
      return {s,exact,note:exact?'':'replaced weapon has a Deathrattle'};
    }
    if(model.kind==='minion'){
      const b=body({...c.raw,entityId:c.id},'me');
      const charge=kw(c.raw,'CHARGE','charge'),rush=kw(c.raw,'RUSH','rush');
      Object.assign(b,{canAttack:!b.dormant&&(charge||rush),zeroReady:false,rushOnly:rush&&!charge,targets:new Set(),maxAttacks:b.windfury?2:1});
      // A fresh body has no targets from the game's options; charge/rush may hit what is open.
      if(b.canAttack)for(const t of s.opp)b.targets.add(t.id);
      s.me.push(b);
      if(model.summon){
        const t=model.summon.with,count=Math.min(model.summon.n,room(s));
        // Tokens have no entity id until the game makes them; the plan's next step is then
        // re-checked against the real board anyway (bridge compares signatures).
        for(let k=0;k<count;k++)s.me.push({id:-(++s.nextToken),side:'me',type:'MINION',name:'token',text:'',
          atk:model.summon.atk,hp:model.summon.hp,armor:0,taunt:/taunt/.test(t),ds:/divine shield/.test(t),
          stealth:/stealth/.test(t),poison:/poisonous/.test(t),lifesteal:/lifesteal/.test(t),windfury:/windfury/.test(t),
          dormant:false,immune:false,frozen:false,attacks:0,canAttack:/rush/.test(t),rushOnly:true,
          targets:new Set(/rush/.test(t)?s.opp.filter(o=>o.type==='MINION').map(o=>o.id):[]),maxAttacks:/windfury/.test(t)?2:1});
      }
      if(model.selfHit){const h=hero(s,'me');if(h)strike({},h,model.selfHit)}
      return {s,exact:true,note:''};
    }
    let exact=true;const notes=[];
    if(model.discard){
      if(s.hand.length){
        const low=Math.min(...s.hand.map(x=>x.cost));
        const tied=s.hand.filter(x=>x.cost===low);
        const lost=tied[0];
        s.hand=s.hand.filter(x=>x!==lost);
        if(DRAW_ONLY.test(lost.text)){
          exact=false;const r=drawImpact({me:{...s.drawState.me,hand:s.hand}},immediateDraws(lost.raw));
          if(tied.length===1){const h=hero(s,'me');if(h)strike({},h,r.damageMin);s.drawnUnknown=(s.drawnUnknown??0)+Math.max(0,r.cardsMax-r.burnMax)}
          notes.push(`discard draws unknown cards with at least ${r.damageMin} damage if selected; observe and replan`);
        }
        if(tied.length>1){exact=false;notes.push(`the discard is a random pick among ${tied.map(x=>x.name).join(', ')}`)}
        // A discard payoff that only draws leaves the board as predicted; the new cards are
        // unknown, so the next step is re-checked against the real hand, but the order holds.
        if(FODDER.test(lost.text)&&!DRAW_ONLY.test(lost.text)){exact=false;notes.push(`discarding ${lost.name} triggers its text`)}
        s.discarded=[...(s.discarded??[]),lost];
      }
    }
    if(c.name==='Entropic Continuity'&&s.drawState.me.deckCount!=null){
      s.drawState={me:{...s.drawState.me,deckCount:Number(s.drawState.me.deckCount)+2,drawHazards:[...(s.drawState.me.drawHazards??[]),3,3]}};
    }
    for(const b of s.me)if(b.type==='MINION'&&!b.dormant){
      b.atk+=model.atk;b.hp+=model.hp;b.maxHp+=model.hp;
      // A ready 0-Attack egg had no printed targets before the buff. Explicit
      // readiness tags let it join the plan; never grant attacks to a new body.
      if(b.zeroReady&&b.atk>0){b.canAttack=true;b.targets=new Set(s.opp.map(t=>t.id))}
    }
    return {s,exact,note:notes.join('; ')};
  }
  throw Error(`unknown move ${m.kind}`);
}

function enableHero(s,h){
  if(h.frozen||h.exhausted||h.attacks>=h.maxAttacks)return;
  h.canAttack=true;
  // A hero at zero Attack had no printed attack options before the power/equip.
  h.targets=new Set(s.opp.map(t=>t.id));
}

// Enough of the board to tell whether reality followed the prediction: who is where, at what
// stats, and what is still in hand. Attack counts and exhaustion are left out; they are tags the
// log flushes late and they never change the next step's legality in a way the options miss.
export const signature=s=>JSON.stringify([
  s.me.map(b=>[b.id,b.atk,b.hp,b.armor,b.ds,b.taunt,b.dormant,b.frozen,b.ignoreTaunt]).sort((x,y)=>x[0]-y[0]),
  s.opp.map(b=>[b.id,b.atk,b.hp,b.armor,b.ds,b.taunt,b.dormant,b.frozen]).sort((x,y)=>x[0]-y[0]),
  s.hand.map(c=>c.id),s.mana,s.weapon&&[s.weapon.id,s.weapon.atk,s.weapon.durability]]);
