import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// L-057: two sessions appending to memory/ at once can both take the next free number. Every E-/F-/L-/R- heading
// must name one entry only (the archive is history and is not checked).
test('memory/: every entry id is used by one heading only',()=>{
  const seen=new Map(),dup=[];
  for(const f of readdirSync('memory').filter(f=>f.endsWith('.md'))){
    for(const m of readFileSync(`memory/${f}`,'utf8').matchAll(/^### ([EFLR]-\d+)\b/gm)){
      if(m[1].endsWith('-999'))continue;  // the templates of README.md
      if(seen.has(m[1]))dup.push(`${m[1]} in ${seen.get(m[1])} and ${f}`);else seen.set(m[1],f);
    }
  }
  assert.deepEqual(dup,[]);
});
