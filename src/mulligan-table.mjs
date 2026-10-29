// The learned opening-hand tables (E-281): which subset of the offered cards to keep. Pure, so the live
// policy (src/policy.mjs) and the simulator study (src/selfplay-mulligan.mjs) share it.
//   features(names,keptMask,first)  what a keep looks like to the table
//   tablePolicy(doc)                ({hand:[{id,name}],first}) -> the ids to throw back
//   mulliganTable(deck)             the live table of that deck, or null (none, or JEV_NET_MODEL names another net)
import {readFileSync} from 'node:fs';
import {basename,resolve} from 'node:path';

// deck -> models/mulligan/<file>.json. The table was fit to the play of one network (its `net`), so it is
// used only while that network drives the deck (MODELS in src/selfplay-shadow.mjs; a test checks they agree).
export const TABLES={'warlock-zakajz':'warlock-zoo-0.2.1'};

// A learned scorer: doc.w maps feature names to weights (train/fit_mulligan.py writes it). Every subset of the
// hand is scored by the features of what it keeps and the best is kept; ties keep more cards.
export function features(names,keptMask,first){
  const f={},add=(k,v=1)=>{f[k]=(f[k]??0)+v};
  const kept=names.filter((_,i)=>keptMask[i]),core=doc=>CORE.has(doc);
  const nCore=new Set(kept.filter(core)).size,seat=first?'1st':'2nd';
  for(const n of kept){
    add(`k:${n}`);add(`k:${n}|${seat}`);
    // the same card with or without a core card beside it (not counting itself)
    const others=new Set(kept.filter(x=>core(x)&&x!==n)).size;
    add(`k:${n}|${others?'core':'nocore'}`);
  }
  const counts={};for(const n of kept)counts[n]=(counts[n]??0)+1;
  for(const [n,c] of Object.entries(counts))if(c>1)add(`dup:${n}`);
  add(`nkept:${kept.length}`);add(`ncore:${Math.min(nCore,2)}`);
  return f;
}
export const CORE=new Set(["Ritual of C'Thun",'Ritual of Summoning','Godfather Kazakus']);

export function tablePolicy(doc){
  const w=doc.w;
  const score=f=>Object.entries(f).reduce((a,[k,v])=>a+(w[k]??0)*v,0);
  return ({hand,first})=>{
    const names=hand.map(c=>c.name),n=names.length;
    let best=null,top=-Infinity;
    for(let m=0;m<1<<n;m++){
      const mask=names.map((_,i)=>(m>>i)&1),sc=score(features(names,mask,first)),size=mask.reduce((a,b)=>a+b,0);
      if(sc>top+1e-12||(Math.abs(sc-top)<=1e-12&&size>best.size)){top=sc;best={mask,size}}
    }
    return hand.filter((_,i)=>!best.mask[i]).map(c=>c.id);
  };
}

const loaded=new Map();
export function mulliganTable(deck){
  const name=TABLES[deck];if(!name)return null;
  if(!loaded.has(name))loaded.set(name,JSON.parse(readFileSync(new URL(`../models/mulligan/${name}.json`,import.meta.url),'utf8')));
  const doc=loaded.get(name);
  if(process.env.JEV_NET_MODEL&&basename(resolve(process.env.JEV_NET_MODEL),'.json')!==doc.net)return null;
  return tablePolicy(doc);
}
