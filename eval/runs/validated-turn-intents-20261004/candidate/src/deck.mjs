import {readFileSync} from 'node:fs';
// One folder per deck under decks/: strategy.md (the principles Jev reads) and mulligan.json
// (opening-hand win rates and user-ruled combos). The deck follows the hero's class, so a
// Demon Hunter game never reads Warlock discard advice; JEV_DECK names a folder to override
// that when two lists share a class. A state without a class (old fixtures, recorded states
// from before heroClass existed) gets the Warlock list, the one every earlier ruling was made on.
const BY_CLASS={WARLOCK:'warlock-discard',DEMONHUNTER:'dh-void'};
export const DEFAULT_DECK='warlock-discard';
export const deckName=state=>process.env.JEV_DECK||BY_CLASS[state?.me?.heroClass]||DEFAULT_DECK;
const cache=new Map();
const read=(name,file)=>readFileSync(new URL(`../decks/${name}/${file}`,import.meta.url),'utf8');
export function loadDeck(name){
  if(!cache.has(name)){
    // A missing folder is a typo in JEV_DECK or a class with no deck yet: fail loudly rather
    // than send Jev another deck's strategy.
    const strategy=read(name,'strategy.md');
    let mulligan={cards:{}};
    try{mulligan=JSON.parse(read(name,'mulligan.json'))}catch(e){if(e.code!=='ENOENT')throw e}
    cache.set(name,{name,strategy,mulligan});
  }
  return cache.get(name);
}
export const deckFor=state=>loadDeck(deckName(state));
