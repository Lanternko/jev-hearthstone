// Offline captured-state + real Jev preflight. No game input is sent.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadDecisionEngine} from '../src/planner-version.mjs';
import {deckFor} from '../src/deck.mjs';
import {plan as gestures} from '../src/execute.mjs';
import {contentBox} from '../src/layout.mjs';
const e=await loadDecisionEngine();
const cases=['validation10-game1-chamber-walking-dead','validation10-game1-preserve-duke-before-weapon','validation10-game2-buff-before-queued-attacks','validation10-game2-shield-pop-alternatives','validation10-game3-two-buffs-before-queued-attacks','validation10-game3-temporary-free-325','validation10-game4-barrage-acolytes-linked-duke'];
const report={createdAt:new Date().toISOString(),plannerVersion:e.version,gameInputSent:false,cases:[],queueChecks:[]};
for(const name of cases){
 const c=JSON.parse(fs.readFileSync('test/fixtures/user-rulings/'+name+'.json'));const trace={},full=e.constrainActions(c.state,c.options,{trace}),p=e.prepare(c.state,full,{admission:trace.admission});let selected,result;
 if(p.forced){selected=p.forced.action;result={source:p.forced.source??'forced',evidence:p.forced.evidence};}
 else if(p.lethal){selected=p.lethal.action;result={source:'lethal'};}
 else{const r=await e.askJev(c.state,p,deckFor(c.state).strategy,{timeoutMs:12000});selected=e.resolve(p,r.answers.move.choice).action;result={source:'jev',model:r.model,choice:r.answers.move.choice,latencyMs:r.latencyMs,weights:r.answers.move.probabilities,description:p.crit[r.answers.move.choice].description};assert.equal(r.model,'typesafe-ai/jev');}
 const steps=gestures(contentBox(2560,1440),c.state,selected);assert.ok(steps.length&&steps.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)));
 if(name.includes('shield-pop'))assert.equal(selected.entityId,80);
 if(name.includes('linked-duke'))assert.notEqual(selected.entityId,56);
 if(name.includes('temporary-free'))assert.notEqual(selected.entityId,18);
 if(name.includes('two-buffs'))for(const stage of c.derivedStages.slice(0,-1)){
  const tr={},a=e.constrainActions(stage.state,stage.options,{trace:tr}),step=c.recordedPlan.steps[stage.prefixLength];
  const attack=a.find(a=>a.entityId===step.id&&a.targetId===step.targetId);assert.ok(attack);
  assert.equal(e.allowsPlanContinuation(stage.state,a,attack,{admission:tr.admission}),false);
  assert.equal(e.prepare(stage.state,a,{admission:tr.admission}).forced.action.entityId,5);
  report.queueChecks.push({fixture:name,prefix:stage.prefixLength,oldAttackRejected:true,remainingBuffFirst:true});
 }
 report.cases.push({id:name,row:c.row,selected,...result,gestureSteps:steps});console.log(JSON.stringify({id:name,selected,source:result.source,choice:result.choice,latencyMs:result.latencyMs}));
}
fs.writeFileSync('runtime/preflight-today-final-20261004.json',JSON.stringify(report,null,2)+'\n');
