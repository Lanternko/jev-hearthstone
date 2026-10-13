// When one end of a turn is plainly better than another: the two positions handed over are the same
// in everything but numbers that can only help the side that played, and none of those numbers is
// worse. No guess enters: both ends are played out in the simulator and compared field by field.
//
// The numbers that may differ, for the seat that just played ("own") and the other ("foe"):
//   hero  own hero's Health higher, foe hero's Health lower (Armor counted in);
//   own   Attack or Health of an own minion higher, the minion otherwise the same;
//   foe   Attack or Health of a foe minion lower, the minion otherwise the same.
// The Health of a minion that does something when it dies must be equal, on either side: nearer to
// dying is not plainly worse for its owner (an egg), nor plainly better for the other side, whose
// own random damage may set it off.
// Own minions are matched by what they are, not by entity: two copies of a card are one kind, and
// two minions without text are one kind whatever their names, so "the 6/2 lives" beats "the 4/1
// lives" only when nothing but Attack and Health tells them apart.
import {hpOf} from './sim.mjs';

const plain=(k,v)=>k==='game'?undefined:v instanceof Set?[...v].sort((a,b)=>a-b):v;
// Everything a state holds, as text: equal text is the same position, dice and deck order included.
export const exact=s=>JSON.stringify(s,plain);

const dies=b=>/deathrattle|reborn/i.test(b.text??'');
// What an own minion is apart from its Attack and Health. Its attack flags are reset before it next acts.
const kind=b=>JSON.stringify([b.text?b.name:'',b.text,dies(b)?b.hp:null,b.armor,b.taunt,b.ds,b.stealth,b.poison,b.lifesteal,b.windfury,
  b.rush,b.ignoreTaunt,b.dormant,b.immune,b.frozen,b.maxAttacks,b.drew??[]]);

// A position handed over (the seat to act is the foe of the one that played) -> {rest, vec, groups}:
// `rest` is all that must be equal, `vec` the numbers that may differ, each turned so that more is
// better for the seat that played, and `groups` says which of hero/own/foe each number belongs to.
export function shape(s){
  const vec=[],groups=[];
  const put=(g,x)=>{vec.push(x);groups.push(g)};
  const ownHero=s.opp.find(b=>b.type==='HERO'),foeHero=s.me.find(b=>b.type==='HERO');
  put('hero',hpOf(ownHero));put('hero',-hpOf(foeHero));
  // Within a kind the strongest first: if each is no worse than the one it stands against, one end's
  // minions can be paired off with the other's.
  const own=s.opp.filter(b=>b.type==='MINION').map(b=>[kind(b),b.atk,b.hp]).sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:y[1]-x[1]||y[2]-x[2]);
  for(const [,atk,hp] of own){put('own',atk);put('own',hp)}
  const foes=s.me.filter(b=>b.type==='MINION').sort((x,y)=>x.id-y.id);
  for(const b of foes){put('foe',-b.atk);if(!dies(b))put('foe',-b.hp)}
  const still=b=>({...b,attacks:0,exhausted:false,canAttack:false,rushOnly:false,zeroReady:false,targets:null});
  const rest=JSON.stringify([{...s,me:null,opp:null,faceDealt:0},{...still(ownHero),hp:0,armor:0},{...foeHero,hp:0,armor:0},
    own.map(x=>x[0]),foes.map(b=>({...b,atk:0,hp:dies(b)?b.hp:0}))],plain);
  return {rest,vec,groups};
}

// Is a plainly better than b? -> 'hero' | 'own' | 'foe' | 'mixed' (which numbers differ), else null.
export function better(a,b){
  if(a.rest!==b.rest||a.vec.length!==b.vec.length)return null;
  const seen=new Set();
  for(let i=0;i<a.vec.length;i++){
    if(a.vec[i]<b.vec[i])return null;
    if(a.vec[i]>b.vec[i])seen.add(a.groups[i]);
  }
  return seen.size===0?null:seen.size===1?[...seen][0]:'mixed';
}

// Among shaped positions, for each one that another plainly beats: [index, index of one that beats
// it and that nothing beats, what differs]. Hero-only differences are named before the others.
const RANK=['hero','own','foe','mixed'];
export function beaten(shapes){
  const by=new Map();
  shapes.forEach((x,i)=>{if(x)(by.get(x.rest)??by.set(x.rest,[]).get(x.rest)).push(i)});
  const out=[];
  for(const g of by.values()){
    if(g.length<2)continue;
    const top=g.filter(i=>!g.some(j=>j!==i&&better(shapes[j],shapes[i])));
    for(const i of g){
      let best=null;
      for(const j of top){
        const what=better(shapes[j],shapes[i]);
        if(what&&(!best||RANK.indexOf(what)<RANK.indexOf(best[2])))best=[i,j,what];
      }
      if(best)out.push(best);
    }
  }
  return out;
}
