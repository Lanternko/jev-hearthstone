import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// A Python edit once wrote '\b' as a backspace byte into a regex in src/sim.mjs (L-056). No source file
// needs a control character other than tab, newline and carriage return.
test('source files hold no stray control characters', ()=>{
  for(const dir of ['src','test'])for(const f of readdirSync(dir))if(f.endsWith('.mjs')){
    const bad=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.exec(readFileSync(`${dir}/${f}`,'utf8'));
    assert.equal(bad,null,`${dir}/${f} has control character ${bad?.[0].charCodeAt(0)}`);
  }
});
