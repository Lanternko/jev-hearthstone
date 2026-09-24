import {ask} from './jev.mjs';
try {
  const r=await ask({enemyHealth:4,enemyTaunts:0,readyFriendlyAttack:4}, {move:{type:'choice',instructions:'Choose the immediate winning action.',criteria:{attack:'Attack enemy hero for 4 damage.',end:'End turn without attacking.'}}});
  console.log(JSON.stringify(r,null,2));
  if(r.answers.move.choice!=='attack') process.exitCode=2;
} catch(e) { console.error(e.message); process.exitCode=1; }
