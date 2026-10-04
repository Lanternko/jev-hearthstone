import {textOf,tagOn} from './mechanics.mjs';
const live=c=>Number(c.HEALTH??c.baseHealth??0)>Number(c.DAMAGE??0);
const linkSource=c=>c.CARDTYPE==='MINION'&&live(c)&&!tagOn(c,'SILENCED')&&!tagOn(c,'DORMANT')
 &&/^(?:battlecry: draw a card\.\s*)?deathrattle: discard it\.?$/i.test(textOf(c));
// Preserve complete observed differences, ignoring only identity, position and
// this particular conditional discard link. Positional mechanics stay separate.
const copyKey=c=>JSON.stringify(Object.fromEntries(Object.entries(c)
 .filter(([k])=>!['entityId','ZONE_POSITION','doomed','discardLink'].includes(k)).sort(([a],[b])=>a.localeCompare(b))));
export function handRetentionAssessment(state,actions=[]){
 if(state.choice)return {version:'hand-retention-v1',risks:[],copyPreferences:[]};
 const hand=state.me?.hand??[],sources=(state.me?.board??[]).filter(linkSource);
 const risks=hand.flatMap(c=>{
  const link=c.discardLink;
  const source=link&&sources.find(s=>s.entityId===link.sourceEntityId);
  const legacy=!link&&c.doomed&&sources.length>0;
  if(!source&&!legacy)return [];
  return [{entityId:c.entityId,name:c.name,condition:'linked_friendly_minion_dies',
   sourceEntityId:source?.entityId??null,sourceCandidates:legacy?sources.map(s=>s.entityId):[],
   confidence:source?link.confidence:0.9,evidence:source?'attached discard-link enchantment':'legacy parsed doomed marker; exact source id absent',
   guidance:'Conditional discard if the linked friendly minion dies while this card remains in hand; not turn-end expiry. With otherwise equivalent payable minions, play the endangered copy before the safe copy. Different costs/stats/text/enchantments or positional effects require separate comparison.'}];
 });
 const risk=new Set(risks.filter(r=>r.confidence>=0.9).map(r=>r.entityId)),groups=new Map();
 // Removing either copy can change another card's edge/adjacency eligibility.
 const positional=hand.some(c=>/outcast|leftmost|rightmost|adjacent|position/i.test(textOf(c)));
 for(const c of hand.filter(c=>c.CARDTYPE==='MINION'&&!positional)){
  const k=copyKey(c);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c);
 }
 const copyPreferences=[...groups.values()].flatMap(cards=>{
  const endangered=cards.filter(c=>risk.has(c.entityId)&&actions.some(a=>a.entityId===c.entityId&&a.targetId==null));
  const safe=cards.filter(c=>!risk.has(c.entityId));
  return endangered.length&&safe.length?[{preferredEntityId:endangered[0].entityId,
   equivalentEntityIds:cards.map(c=>c.entityId),deferredEntityIds:safe.map(c=>c.entityId),reason:'Use the linked copy first; preserve the equivalent unlinked copy.'}]:[];
 });
 return {version:'hand-retention-v1',risks,copyPreferences};
}
