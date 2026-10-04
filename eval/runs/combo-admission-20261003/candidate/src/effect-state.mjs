// Confidence measures support for our classification, NOT a calibrated probability
// that an effect triggers next turn. Strength is a coarse removal premium, not mana.
const flat=t=>(t??'').replace(/\[x\]|<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const on=v=>v===1||v==='1'||v===true;
const rules=[
 {ids:['NEW1_012','WON_031'],zone:'PLAY',trigger:'cast a spell: gain +1 Attack',repeat:'repeatable',strength:2,text:/^Whenever you cast a spell, gain \+1 Attack\.$/i},
 {ids:['CFM_637'],zone:'DECK',trigger:'play a Pirate',repeat:'once when this leaves the deck',strength:0,text:/^After you play a Pirate, summon this minion from your deck\.$/i},
 {ids:['WON_065','CORE_WON_065'],zone:'PLAY',trigger:'summon a minion: give it +1 Health',repeat:'repeatable',strength:2,text:/^After you summon a minion, give it \+1 Health\.$/i},
 {ids:['TOY_518'],zone:'PLAY',trigger:'summon a Pirate: give it +1 Attack',repeat:'repeatable',strength:3,text:/^After you summon a Pirate, give it \+1 Attack\.$/i},
 {ids:['GVG_075'],zone:'PLAY',trigger:'summon a Pirate: deal 2 random enemy damage',repeat:'repeatable',strength:4,text:/^After you summon a Pirate, deal 2 damage to a random enemy\.$/i},
 {ids:['TOY_381'],zone:'PLAY',trigger:'aura: your Hero Power costs 0',repeat:'continuous aura',strength:4,text:/^Your Hero Power costs \(0\)\.$/i},
 {ids:['EX1_575','CORE_EX1_575'],zone:'PLAY',trigger:'end of your turn: draw a card',repeat:'each own turn',strength:4,text:/^At the end of your turn, draw a card\.$/i},
 {ids:['BRM_002'],zone:'PLAY',trigger:'cast a spell: deal 2 split enemy damage',repeat:'repeatable',strength:5,text:/^After you cast a spell, deal 2 damage randomly split among all enemies\.$/i},
 {ids:['EX1_608','UNG_034','CORE_UNG_034'],zone:'PLAY',trigger:'aura: your spells cost 1 less, minimum 1',repeat:'continuous aura',strength:5,text:/^Your spells cost \(1\) less \(but not less than 1\)\.$/i},
 {ids:['CS2_235','CORE_CS2_235'],zone:'PLAY',trigger:'a minion is healed: draw a card',repeat:'repeatable',strength:4,text:/^Whenever a minion is healed, draw a card\.$/i},
];
export const EFFECT_VERSION='2026-10-01-v1';
export function assessEffect(c,{zone=c?.ZONE??'PLAY'}={}){
 const text=flat(c?.text),type=c?.CARDTYPE??c?.type;
 const base={version:EFFECT_VERSION,entityId:c?.entityId??c?.id,cardId:c?.cardId,name:c?.name,
  observedZone:zone,text,status:'unknown',confidence:0.25,confidenceBasis:'uncalibrated rule evidence',
  rule:'unclassified',requiredZone:null,trigger:null,repeatability:'unknown',removalPremium:0,
  strength:'unknown',reason:'No verified rule for this complete effect; Jev must evaluate the text.'};
 if(type!=='MINION')return {...base,status:'not_applicable',confidence:1,reason:'Not a minion.'};
 if(on(c?.SILENCED)||c?.silenced)return {...base,status:'inactive',confidence:0.99,rule:'silenced',reason:'Visible silence disables printed non-keyword effects.'};
 if(on(c?.DORMANT)||c?.dormant)return {...base,status:'inactive_now',confidence:0.99,rule:'dormant',reason:'Dormant now; reassess when it awakens. Future wake-up effects are not classified.'};
 const rule=rules.find(r=>r.ids.includes(c?.cardId)&&r.text.test(text));
 if(rule){
  const active=zone===rule.zone;
  return {...base,status:active?'active':'inactive',confidence:0.98,rule:`card:${c.cardId}`,
   requiredZone:rule.zone,trigger:rule.trigger,repeatability:rule.repeat,
   removalPremium:active?rule.strength:0,strength:rule.strength>=4?'strong':rule.strength?'moderate':'none',
   reason:active?'Verified card ID and full text; required zone is satisfied. Future trigger opportunities are not guaranteed.':`Effect requires ${rule.zone}; this card is in ${zone}.`};
 }
 if(!text)return {...base,status:c?.cardId?'none':'unknown',confidence:c?.cardId?0.9:0.25,
  rule:'no_visible_text',reason:'No visible effect text; no ongoing effect premium.'};
 // Deliberately narrow complete-text cases, not a catch-all /After/ regex.
 if(/^(?:Taunt|Rush|Charge|Divine Shield|Windfury|Stealth|Poisonous|Lifesteal|Reborn)[.,]?$/i.test(text))
  return {...base,status:'none',confidence:0.95,rule:'keyword_only',reason:'Keyword-only text; combat keywords are valued separately, not as an engine.'};
 if(/^Battlecry: [^.]+\.$/i.test(text)&&!/(?:deathrattle|after|whenever|aura|until|each turn|end of|start of|"|give|gain)/i.test(text))
  return {...base,status:zone==='PLAY'?'inactive':'unknown',confidence:zone==='PLAY'?0.85:0.25,
   rule:'simple_battlecry',requiredZone:'played from hand',repeatability:'on play',reason:'Simple completed Battlecry adds no recurring board premium; unresolved play animations are outside this assessment.'};
 return base;
}
export function boardEffectAssessments(state){
 return ['me','opponent'].flatMap(side=>(state?.[side]?.board??[])
  .filter(c=>c.CARDTYPE==='MINION').map(c=>({side,...assessEffect(c,{zone:'PLAY'})})));
}
export function effectNote(c){
 const e=c?.effectAssessment??assessEffect(c,{zone:'PLAY'});
 return `${e.name??'minion'}: effect ${e.status}, classification confidence ${e.confidence} (rule evidence, not trigger probability), strength ${e.strength}; ${e.reason}${e.trigger?` Trigger: ${e.trigger}; ${e.repeatability}.`:''}${e.status==='unknown'?` Unclassified text: ${e.text}`:''}`;
}
