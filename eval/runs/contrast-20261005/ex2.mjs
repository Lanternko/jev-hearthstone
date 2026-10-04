import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
import {E} from './cases.mjs';
const D='../../../test/fixtures/contrast/',load=r=>JSON.parse(readFileSync(D+r+'.json','utf8'));
const run=(s,o)=>{const trace={};const a=constrainActions(s,o,{trace});const b=a.length&&!s.choice?spendFirst(s,a,{admission:trace.admission,trace}):a;
 return {menu:b.map(x=>x.id),prefs:trace.preferences,vetoes:trace.vetoes,rel:trace.ruleReleases};};
for(const [r,e] of [['whispersEatsPlayable',E.mana(1)],['buffBeforeTap',E.all(E.dropMine('Felbeast'),E.dropMine('Felbeast'))],['whispersWaits',E.mana(-1)]]){
 const f=load(r),x=structuredClone(f);e(x);const s=x.state;
 console.log('##',r,'mana',s.me.mana,'hand',s.me.hand.map(c=>c.name+'#'+c.entityId+'('+c.COST+')').join(', '));
 console.log(' opts',x.options.map(o=>o.id+':'+(o.entityId??'')+(o.targetId!=null?'>'+o.targetId:'')).join(' '));
 console.log(' pos',JSON.stringify(run(f.state,f.options)));
 console.log(' var',JSON.stringify(run(s,x.options)));
}
