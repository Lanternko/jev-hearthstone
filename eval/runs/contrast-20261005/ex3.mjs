import {readFileSync} from 'node:fs';
import {matchupObjective,resourceDrawWindow} from '../../../src/matchup-objective.mjs';
const f=JSON.parse(readFileSync('../../../test/fixtures/contrast/buffBeforeTap.json','utf8')),s=f.state;
s.me.hand=s.me.hand.filter(c=>c.name!=='Disposable Acolytes');
console.log(JSON.stringify(matchupObjective(s)).slice(0,300),'current',s.me.current,'win',resourceDrawWindow(s));
