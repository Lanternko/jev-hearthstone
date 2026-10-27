import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const model=`${root}models/selfplay/warlock-zoo-v4.pt`;
const run=args=>spawnSync('python',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:240000});
const torch=existsSync(model)&&run(['-c','import torch']).status===0;

// train/ppo.py --resume maps a network of another vocabulary by card name; on a board of old cards
// only, the expanded network must answer as the old one did.
test('a network expanded to zoo + discard + dh-cthun agrees with the old one on old-card boards',{skip:!torch&&'no torch or no warlock-zoo-v4.pt'},()=>{
  const r=run(['train/test_expand.py',model,'60']);
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.stdout,/largest difference [0-9.]+e-\d+/);
});
