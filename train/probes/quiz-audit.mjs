// Independent check of the questions: no use of shape()/better(); a plain field-by-field diff of the two ends of each pair.
import {readFileSync} from 'node:fs';
import {hpOf} from '../../src/sim.mjs';
import {loadList} from '../../src/selfplay.mjs';
import {turnTree,replay} from '../../src/selfplay-quiz.mjs';
import {beaten} from '../../src/selfplay-dominance.mjs';
const data=JSON.parse(readFileSync(process.argv[2])),lists=data.decks.map(loadList),N=+process.argv[3]||150;
const norm=v=>v instanceof Set?[...v].sort():v;
function diff(a,b,path,out){
  a=norm(a);b=norm(b);
  if(a===b)return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    if(Array.isArray(a)&&Array.isArray(b)&&a.length!==b.length){out.push(path+'.length');return}
    for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(k!=='game')diff(a[k],b[k],`${path}.${Array.isArray(a)?'*':k}`,out);
  }else out.push(path);
}
const paths=new Map(),bad=[];let pairs=0,qs=0,ownAtkOnly=0;
const relax={A:0,B:0,qB:0};const examples=[];
const kindB=b=>JSON.stringify([b.text?b.name:'',b.text,b.armor,b.taunt,b.ds,b.stealth,b.poison,b.lifesteal,b.windfury,b.rush,b.ignoreTaunt,b.dormant,b.immune,b.frozen,b.maxAttacks,b.drew??[]]);
function shapeB(s,anchor){
  const vec=[],groups=[];const put=(g,x)=>{vec.push(x);groups.push(g)};
  const oh=s.opp.find(b=>b.type==='HERO'),fh=s.me.find(b=>b.type==='HERO');
  put('hero',hpOf(oh));put('hero',-hpOf(fh));
  const own=s.opp.filter(b=>b.type==='MINION'&&!/Deathrattle/i.test(b.text??'')).map(b=>[kindB(b),b.atk,b.hp]).sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:y[1]-x[1]||y[2]-x[2]);
  const dr=s.opp.filter(b=>b.type==='MINION'&&/Deathrattle/i.test(b.text??'')).map(b=>JSON.stringify({...b,id:0,attacks:0,exhausted:false,canAttack:false,rushOnly:false,zeroReady:false,targets:null})).sort();
  for(const [,a,h] of own){put('own',a);put('ownhp',h)}
  const foes=s.me.filter(b=>b.type==='MINION').sort((x,y)=>x.id-y.id);
  for(const b of foes){put('foe',-b.atk);put('foe',-b.hp)}
  const rest=anchor+JSON.stringify([{...s,me:null,opp:null,faceDealt:0},{...oh,hp:0,armor:0,attacks:0,exhausted:false,canAttack:false,rushOnly:false,zeroReady:false,targets:null},{...fh,hp:0,armor:0},own.map(x=>x[0]),dr,foes.map(b=>({...b,atk:0,hp:0}))],(k,v)=>k==='game'?undefined:v instanceof Set?[...v].sort():v);
  return {rest,vec,groups};
}
const show=s=>`own[${s.opp.filter(b=>b.type==='MINION').map(b=>`${b.name} ${b.atk}/${b.hp}`).join(', ')}] hero ${hpOf(s.opp.find(b=>b.type==='HERO'))} | foe[${s.me.filter(b=>b.type==='MINION').map(b=>`${b.name} ${b.atk}/${b.hp}`).join(', ')}] hero ${hpOf(s.me.find(b=>b.type==='HERO'))}`;
for(const q of data.bank.slice(0,N)){
  const root=replay(lists,q),tree=turnTree(root);
  if(!tree){bad.push('no tree');continue}
  qs++;
  for(const p of tree.pairs){
    pairs++;
    const out=[];diff(p.good.s,p.bad.s,'s',out);
    const key=[...new Set(out)].sort().join(' ');
    paths.set(key,(paths.get(key)??0)+1);
    // direction, checked apart from better(): mover's bodies are those NOT of the seat to act
    const g=p.good.s,b=p.bad.s;
    if(g.seat===root.seat||b.seat===root.seat)bad.push('seat');
    const H=(s,side)=>hpOf(s[side].find(x=>x.type==='HERO'));
    if(H(g,'opp')<H(b,'opp')||H(g,'me')>H(b,'me'))bad.push('hero direction');
    if(g.seed!==b.seed)bad.push('seed');
  }
  relax.A+=tree.pairs.length;
  const handed=[...tree.ends.values()].filter(e=>!e.over);
  const lost=beaten(handed.map(e=>shapeB(e.s,e.anchor+'|'))).filter(x=>['own','ownhp','mixed'].includes(x[2])||true);
  const extra=lost.filter(([i,j,w])=>w!=='hero'&&w!=='foe');
  relax.B+=lost.length;
  if(extra.length){relax.qB++;if(examples.length<8){const [i,j,w]=extra[0];examples.push(`${w}\n   good: ${show(handed[j].s)}\n   bad:  ${show(handed[i].s)}`)}}
}
console.log({questions:qs,pairs,faults:bad.length,sampleFaults:bad.slice(0,5)});
console.log('fields in which the two ends of a pair differ (count of pairs):');
for(const [k,n] of [...paths].sort((a,b)=>b[1]-a[1]).slice(0,25))console.log(String(n).padStart(7),k);
console.log('relaxed (own minion Health may differ unless Deathrattle):',relax);
console.log(examples.join('\n'));
