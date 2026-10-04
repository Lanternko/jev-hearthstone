import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
import {E} from './cases.mjs';
const D='../../../test/fixtures/contrast/',load=r=>JSON.parse(readFileSync(D+r+'.json','utf8'));
const egg=load('saferCopies').state.me.hand.find(c=>c.name==='Boneweb Egg');
const run=(s,o)=>{const trace={};const a=constrainActions(s,o,{trace});const b=a.length&&!s.choice?spendFirst(s,a,{admission:trace.admission,trace}):a;
 return {menu:b.map(x=>x.id),prefs:trace.preferences??[],vetoes:(trace.vetoes??[]).map(v=>v.rule+':'+v.actionId)};};
const C={
 boardFirstDiscard:E.mana(1),bodyBeforeBuff:E.dropHand('Platysaur'),castBeforeSwing:E.dropHand('Chamber of Viscidus'),
 deferHardCast:E.notTemporary('Walking Dead'),developBeforeBuff:E.foeHp(5),freezeThreatFirst:E.dropFoe('Naga Monstrosity'),
 overdrawWaits:E.dropHand('Soul Barrage'),overflowWaits:E.dropMine('Felbeast'),passiveEggCoin:E.mana(1),pricedOut:E.mana(1),
 setupFirst:E.dropMine('Chamber of Viscidus'),wastedBurn:E.foeHp(5),weaponBuffFirst:E.myHp(6),weaponFirst:E.dropMine('Chronoclaws'),
 whispersEatsPlayable:E.mana(1),whispersWorthCasting:E.dropMine('Platysaur'),
 buffBeforeTap:E.dropHand('Disposable Acolytes'),buffBeforeTap2:E.all(E.dropMine('Felbeast'),E.dropMine('Felbeast')),
 counterFirst:E.mana(-2),deadWhispers:E.addMine(1,2),discardPick:E.addFoe(1,1,3),occultistPick:E.addFoe(1,1),
 saferCopies:E.dropMine('Platysaur'),splitToFace:E.addFoe(2,2),mustSpend:E.mana(-1),mustSpendEnd:E.swapHand('Disposable Acolytes',egg),
 newBodyBuffWaits:E.wake('Platysaur'),tapOnlyEnd:E.all(E.myHp(6),E.addFoe(5,5)),wastedFodder:E.mana(-1),whispersWaits:E.mana(-1),
};
for(const [k,edit] of Object.entries(C)){
 const rule=k.replace(/\d$/,''),f=load(rule);const p=run(f.state,f.options);
 const x=structuredClone(f);edit(x);let v;try{v=run(x.state,x.options)}catch(e){console.log(k,'ERR',e.message);continue;}
 const rem=p.prefs.find(r=>r.rule===rule)?.removed??[];
 const back=rem.filter(id=>v.menu.includes(id));
 const still=v.prefs.find(r=>r.rule===rule);
 console.log(`${k}: removed ${rem.join(',')} | variant keeps ${back.join(',')||'-'} | rule still ${still?still.removed.join(','):'no'} | chosen ${f.chosen} in pos ${p.menu.includes(f.chosen)} var ${v.menu.includes(f.chosen)} | vetoes ${v.vetoes.join(',')}`);
}
