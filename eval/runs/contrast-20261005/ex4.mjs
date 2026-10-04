import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
import {E} from './cases.mjs';
const D='../../../test/fixtures/contrast/',load=r=>JSON.parse(readFileSync(D+r+'.json','utf8'));
const claws=load('splitToFace').state.me.hand.find(c=>c.name==='Chronoclaws');
const run=(s,o)=>{const trace={};const a=constrainActions(s,o,{trace});const b=a.length&&!s.choice?spendFirst(s,a,{admission:trace.admission,trace}):a;
 return {menu:b.map(x=>x.id),prefs:trace.preferences,vetoes:trace.vetoes};};
for(const [r,e,X] of [['whispersEatsPlayable',E.swapHand('Disposable Acolytes',claws),'o1'],
 ['buffBeforeTap',E.all(E.dropMine('Felbeast'),E.dropMine('Felbeast'),E.mana(3)),'o4'],
 ['whispersWaits',E.all(E.swapHand('Platysaur',claws),E.mana(0)),'o2']]){
 const f=load(r),x=structuredClone(f);e(x);
 const v=run(x.state,x.options);console.log(r,X,v.menu.includes(X),JSON.stringify(v));
}
