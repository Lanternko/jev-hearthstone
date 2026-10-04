import {readFileSync} from 'node:fs';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
const D='../../../test/fixtures/contrast/';
for(const r of process.argv.slice(2)){
 const f=JSON.parse(readFileSync(D+r+'.json','utf8')),s=f.state;
 const trace={};const a=constrainActions(s,f.options,{trace});let b=a;if(a.length&&!s.choice)b=spendFirst(s,a,{admission:trace.admission,trace});
 const nm=c=>`${c.name}#${c.entityId}`;
 console.log(`## ${r} T${s.turn} mana ${s.me.mana} deck ${s.me.deckCount}`);
 console.log(' hand:',(s.me.hand??[]).map(c=>`${nm(c)}(${c.COST})${c.temporary?'T':''}`).join(', '));
 console.log(' mine:',(s.me.board??[]).map(c=>`${nm(c)}[${c.CARDTYPE[0]}${c.ATK??''}/${c.HEALTH??''}${c.DAMAGE?'-'+c.DAMAGE:''}${c.EXHAUSTED?'z':''}]`).join(', '));
 console.log(' foe:',(s.opponent.board??[]).map(c=>`${nm(c)}[${c.CARDTYPE[0]}${c.ATK??''}/${c.HEALTH??''}${c.DAMAGE?'-'+c.DAMAGE:''}]`).join(', '));
 if(s.choice)console.log(' choice:',s.choice.source?.name,(s.choice.entities??[]).map(nm).join(', '));
 console.log(' opts:',f.options.map(o=>`${o.id}:${o.type}${o.entityId??''}${o.targetId!=null?'>'+o.targetId:''}`).join(' '));
 console.log(' chosen:',JSON.stringify(f.chosen),' prefs:',JSON.stringify(trace.preferences),' final:',b.map(x=>x.id).join(' '));
}
