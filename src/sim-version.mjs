// The version of the simulator a network was trained in or a match was played in (gate G2/G3):
// sha256 of the rules (src/sim.mjs and src/selfplay.mjs with every module they import), the card data
// (data/*.json) and the deck files (decks/*/*.json), each with its path, line ends made \n so a Windows
// and a Linux checkout agree. The first 12 hex digits name it.
//
//   node src/sim-version.mjs [--files]   the version, or the files that make it
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ENTRIES=['src/sim.mjs','src/selfplay.mjs'];
const IMPORT=/(?:^|[;\n])\s*(?:import|export)\b[^'"]*?\bfrom\s*['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)|^\s*import\s*['"](\.[^'"]+)['"]/gm;

export function simFiles(root=ROOT){
  const seen=new Set();
  const walk=f=>{
    if(seen.has(f))return;
    seen.add(f);
    for(const m of readFileSync(f,'utf8').matchAll(IMPORT))walk(resolve(dirname(f),m[1]??m[2]??m[3]));
  };
  for(const e of ENTRIES)walk(join(root,e));
  const data=join(root,'data'),decks=join(root,'decks');
  for(const f of readdirSync(data))if(f.endsWith('.json'))seen.add(join(data,f));
  for(const d of readdirSync(decks))if(existsSync(join(decks,d,'list.json')))
    for(const f of readdirSync(join(decks,d)))if(f.endsWith('.json'))seen.add(join(decks,d,f));
  return [...seen].map(f=>relative(root,f).replaceAll('\\','/')).sort();
}

let cached;
export function simVersion(root=ROOT){
  if(root===ROOT&&cached)return cached;
  const h=createHash('sha256');
  for(const f of simFiles(root))h.update(`${f}\0${readFileSync(join(root,f),'utf8').replaceAll('\r\n','\n')}\0`);
  const v=h.digest('hex').slice(0,12);
  if(root===ROOT)cached=v;
  return v;
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href)
  console.log(process.argv.includes('--files')?simFiles().join('\n'):simVersion());
