// The --out lines of src/selfplay-mulligan.mjs as rows for train/fit_mulligan.py (src/selfplay-mulligan.mjs's
// sampleRow, so the features are those tablePolicy scores).
//   node train/mulligan-rows.mjs <games.jsonl...> > rows.jsonl
import {readFileSync} from 'node:fs';
import {sampleRow} from '../src/selfplay-mulligan.mjs';
for(const f of process.argv.slice(2))for(const l of readFileSync(f,'utf8').split(/\r?\n/))
  if(l.trim())process.stdout.write(JSON.stringify(sampleRow(JSON.parse(l)))+'\n');
