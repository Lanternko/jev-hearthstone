import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {recoverCommittedMulligan} from '../src/mulligan-recovery.mjs';
import {verdict} from '../src/verify.mjs';
const root='eval/runs/mulligan-recovery-20261001';
const fixturePath='test/fixtures/user-rulings/ranked22-mulligan-misfire.json';
const bytes=await readFile(fixturePath);const f=JSON.parse(bytes);
const old=await import(pathToFileURL(resolve(root,'baseline/src/verify.mjs')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceHashes={};for(const version of ['baseline','candidate']){
 sourceHashes[version]={};for(const file of (await readdir(root+'/'+version+'/src')).sort())sourceHashes[version][file]=hash(await readFile(root+'/'+version+'/src/'+file));
}
const unchangedStrategy=['choose.mjs','plan.mjs','sim.mjs','policy.mjs'].every(file=>sourceHashes.baseline[file]===sourceHashes.candidate[file]);
const originalLog=await readFile('runtime/ranked-2026-10-01T12-42-04-012Z/game-0022.log','utf8');
const out={capturedAt:new Date().toISOString(),fixturePath,fixtureHash:hash(bytes),sourceHashes,unchangedStrategy,
 baseline:{verdict:old.verdict(f.before,f.action,f.after),actualOriginalRunStopped:/MULLIGAN MISFIRE/.test(originalLog)&&/done, 0 action/.test(originalLog)},
 candidate:{verdict:verdict(f.before,f.action,f.after),recovery:recoverCommittedMulligan(f.before,f.action,f.after)},
 limits:['One observed execution failure; no proof that the missed selection itself is fixed.','Recovery does not replay selection, does not guarantee winning, and stops the batch after this game.','No paired live win-rate evidence.']};
await writeFile(root+'/paired-execution.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({unchangedStrategy,baseline:out.baseline,candidate:out.candidate}));
if(!unchangedStrategy||out.baseline.verdict!=='misfire'||!out.baseline.actualOriginalRunStopped||!out.candidate.recovery?.stopAfterGame)process.exitCode=1;
