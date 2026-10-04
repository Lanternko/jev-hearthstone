// One dev-split firing state per rule, saved whole as the positive half of a contrast pair.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {constrainActions,spendFirst} from '../../../src/policy.mjs';
const H=JSON.parse(readFileSync('history.json','utf8'));
const ROOT='D:/Projects/jev-hearthstone/runtime/';
const want=new Map();
for(const [rule,v] of Object.entries(H.rules)){const s=v.samples[0];if(s)want.set(rule,s);}
const OUT='../../../test/fixtures/contrast/';mkdirSync(OUT,{recursive:true});
const byFile={};for(const [rule,s] of want)(byFile[s.file]??=[]).push([rule,s]);
const lines=[];
for(const [file,list] of Object.entries(byFile)){
 for(const l of readFileSync(ROOT+file,'utf8').split('\n')){if(!l.trim())continue;let r;try{r=JSON.parse(l)}catch{continue}
  for(const [rule,s] of list){if(r.createdAt!==s.line||want.get(rule)!==s)continue;
   const opts=r.rawOptions??r.options;
   writeFileSync(OUT+rule+'.json',JSON.stringify({source:{file,createdAt:r.createdAt,turn:r.turn},state:r.state,options:opts,chosen:r.chosen?.id??r.action?.id??null},null,1));
   want.delete(rule);
   const name=id=>{const a=opts.find(x=>x.id===id);const c=[...(r.state.me.board??[]),...(r.state.me.hand??[])].find(x=>x.entityId===a?.entityId);
    const t=[...(r.state.opponent?.board??[]),...(r.state.me.board??[])].find(x=>x.entityId===a?.targetId);
    return id+':'+(a?.type==='END_TURN'?'END':(c?.name??a?.type))+(t?'>'+t.name:'');};
   const trace={};const a=constrainActions(r.state,opts,{trace});if(a.length&&!r.state.choice)spendFirst(r.state,a,{admission:trace.admission,trace});
   const me=r.state.me,op=r.state.opponent;
   lines.push(`## ${rule}  ${file} T${r.state.turn} choice=${r.state.choice?.type??''}
 mana ${me.mana}/${me.maxMana} hp ${me.hero?.health??''} hand: ${(me.hand??[]).map(c=>c.name).join(', ')}
 my board: ${(me.board??[]).map(c=>`${c.name}(${c.ATK??c.attack??''}/${c.HEALTH??c.health??''}${c.EXHAUSTED?' z':''})`).join(', ')}
 opp board: ${(op?.board??[]).map(c=>`${c.name}(${c.ATK??''}/${c.HEALTH??''})`).join(', ')}
 options: ${opts.map(o=>name(o.id)).join(' | ')}
 fired: ${(trace.preferences??[]).map(f=>f.rule+'['+f.removed.map(name).join(',')+']').join(' ')}
 chosen: ${name(r.chosen?.id??r.action?.id)}`);
  }}}
writeFileSync('samples.md',lines.join('\n\n'));console.log('missing',[...want.keys()]);
