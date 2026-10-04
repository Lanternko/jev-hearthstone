// Bounded proofs for development -> buff. A soft single-card hold must not
// remove a feasible combination before search. Unknown bodies are counts only;
// executable steps stop at their summon, with a conditional follow-up for Jev.
import {fromState,moves,apply,signature,searchSignature,hero,hpOf,cardModel} from './sim.mjs';
import {deckName} from './deck.mjs';

export const COMBO_ADMISSION_VERSION='combo-admission-v2';
const HIGH=/^after your hero attacks, discard your highest cost card\.?$/i;
const live=s=>s.me.filter(b=>b.type==='MINION'&&!b.dormant&&b.hp>0).length;
const room=s=>7-s.me.filter(b=>b.type==='MINION').length-s.locations;
const firstAction=(actions,m)=>actions.find(a=>a.entityId===m.id
  &&(m.kind==='attack'?a.targetId===m.targetId:a.targetId==null));
const threat=s=>s.opp.filter(b=>b.type==='MINION'&&!b.dormant&&!b.frozen).reduce((n,b)=>n+b.atk,0);

export function combinationAdmission(state,actions,{maxNodes=256,depth=4}={}){
  if(!Number.isInteger(maxNodes)||maxNodes<1||!Number.isInteger(depth)||depth<1)throw Error('invalid combo budgets');
  const stats={generated:0,nodeLimit:false,depthLimit:false,maxNodes,depth};
  const result={version:COMBO_ADMISSION_VERSION,lines:[],weaponRoutes:[],stats};
  if(state.choice||deckName(state)==='dh-void')return result;
  const uncertainSecrets=Number(state.opponent?.secretCount??0)>0;
  const start=fromState(state,actions),h=hero(start,'me');
  // Do not promise a value setup when the visible board demands survival.
  if(!h||hpOf(h)<=threat(start))return result;
  const buffs=start.hand.filter(c=>(c.playable||c.cost>start.mana)&&cardModel(c)?.kind==='buff'&&!cardModel(c).discard);
  if(!buffs.length)return result;
  const paths=[{s:start,steps:[]}],seen=new Set([searchSignature(start)]);
  for(let i=0;i<paths.length;i++){
    const p=paths[i];
    if(p.steps.length>=depth){stats.depthLimit=true;continue;}
    for(const m of moves(p.s)){
      if(stats.generated>=maxNodes){stats.nodeLimit=true;break;}
      const c=p.s.hand.find(c=>c.id===m.id),model=c&&cardModel(c);
      // Every explored prefix develops bodies or enables the discard attack.
      // Ordinary attacks, draw, removal, buffs and unmodelled cards stay in
      // the main search; they never gain a blanket policy exemption here.
      const attack=m.kind==='attack'&&m.id===hero(p.s,'me')?.id&&!hero(p.s,'me').exhausted&&HIGH.test(p.s.weapon?.text??'');
      const play=m.kind==='play'&&model&&['minion','randomSummon','mana'].includes(model.kind)
        ||m.kind==='play'&&model?.kind==='weapon'&&HIGH.test(c.text);
      if(!attack&&!play)continue;
      if(!p.steps.length&&!firstAction(actions,m))continue;
      stats.generated++;
      const r=apply(p.s,m),rh=hero(r.s,'me');
      if(!rh||hpOf(rh)<=0||hpOf(rh)<=threat(r.s))continue;
      const step={...m,exact:r.exact,note:r.note,before:signature(p.s),after:signature(r.s)};
      const steps=[...p.steps,step],pending=r.s.pendingSummons;
      // A combat/death/friendly engine trigger can invalidate count/hand
      // forecasts. Only the explicit random-summon boundary is admitted.
      const countBoundary=!r.exact&&pending&&!/combat trigger|Deathrattle\/Reborn|friendly event trigger|replaced weapon/i.test(r.note);
      let weaponRoute;
      if(attack){
        // The same simulated prefix feeds both combo proofs and the three-case
        // weapon comparison. Isolate combat to avoid treating an unknown
        // discard/draw as proof that the combat itself was understood.
        const combat=apply({...p.s,weapon:{...p.s.weapon,text:''}},m);
        const target=p.s.opp.find(b=>b.id===m.targetId);
        const highest=Math.max(...p.s.hand.map(c=>c.cost));
        const targets=p.s.hand.filter(c=>c.cost===highest);
        const key=JSON.stringify(steps.map(x=>[x.kind,x.id,x.targetId]));
        weaponRoute={key,weaponId:p.s.weapon.id,firstActionId:firstAction(actions,steps[0]).id,
          steps,targetId:m.targetId,targetName:target?.name,targetHealth:target?.hp,targetAttack:target?.atk,
          killsTarget:target?.type==='MINION'&&!r.s.opp.some(b=>b.id===target.id),
          heroHealthAfter:hpOf(rh),slotsAfter:room(r.s),knownCombat:combat.exact,
          safeContinuation:hpOf(rh)>threat(r.s),
          knownDevelopment:r.exact||Boolean(countBoundary),uncertainSecrets,
          targets:targets.map(c=>({entityId:c.id,name:c.name,cost:c.cost})),
          manaAfter:r.s.mana,manaSpent:start.mana-r.s.mana};
        if(!result.weaponRoutes.some(x=>x.key===key))result.weaponRoutes.push(weaponRoute);
      }
      if(!r.exact&&!countBoundary)continue;
      const added=live(r.s)-live(start),possible=pending?.n??0;
      if(r.exact&&steps.length<depth){
        const k=searchSignature(r.s);
        if(!seen.has(k)){seen.add(k);paths.push({s:r.s,steps});}
      }
      // Clipped summons are a different decision: don't promise two bodies
      // when only one slot is available. A death during the attack frees room.
      if(uncertainSecrets||possible>room(r.s)||added+possible<=0)continue;
      for(const b0 of buffs){
        const b=r.s.hand.find(c=>c.id===b0.id),bm=b&&cardModel(b);
        if(!b||b.cost>r.s.mana)continue;
        const followup={buffId:b.id,buffName:b.name,manaReserved:b.cost,
          manaAfterBuff:r.s.mana-b.cost,knownRecipients:live(r.s),possibleAdditionalRecipients:possible,
          buffAttack:bm.atk,buffHealth:bm.hp,observeBeforeBuff:countBoundary};
        let end=r,executable=steps;
        if(r.exact){
          end=apply(r.s,{kind:'play',id:b.id});
          executable=[...steps,{kind:'play',id:b.id,exact:end.exact,note:end.note,
            before:signature(r.s),after:signature(end.s)}];
        }
        const first=firstAction(actions,executable[0]);
        const key=JSON.stringify([executable.map(x=>[x.kind,x.id,x.targetId]),b.id]);
        if(result.lines.some(x=>x.key===key))continue;
        result.lines.push({key,firstActionId:first.id,steps:executable,followup,
          ...(weaponRoute?{weaponRouteKey:weaponRoute.key}:{}),
          development:{knownAdded:added,possibleAdded:possible,sourceId:pending?.sourceId??m.id,via:pending?.via??m.kind},
          // Prefix contains no fabricated random statlines. Main search's
          // score can inspect it; the possible buff gain is separate.
          s:end.s});
      }
    }
    if(stats.nodeLimit)break;
  }
  return result;
}

export const admittedFirstIds=admission=>new Set((admission?.lines??[]).map(l=>l.firstActionId));
// Safe incomplete weapon prefixes remain comparison options when the usual
// spend-first ordering would otherwise hide their hero attack. This is not a
// guarantee about the discard outcome or a forced-action exemption.
export const comparisonFirstIds=admission=>new Set((admission?.weaponRoutes??[])
  .filter(r=>r.knownCombat&&r.safeContinuation&&!r.uncertainSecrets).map(r=>r.firstActionId));
export const admittedLines=(admission,actions)=>{
  const ids=new Set(actions.map(a=>a.id));
  return (admission?.lines??[]).filter(l=>ids.has(l.firstActionId));
};
// Machine-readable audit avoids serializing the planning state into the model
// prompt or duplicating the real board in every decision row.
export const admissionEvidence=(admission,actions)=>{
  const lines=admittedLines(admission,actions);
  const routes=(admission.weaponRoutes??[]).filter(r=>actions.some(a=>a.id===r.firstActionId));
  return {version:admission.version??COMBO_ADMISSION_VERSION,stats:admission.stats,lineCount:lines.length,truncated:lines.length>12,
    lines:lines.slice(0,12).map(({firstActionId,steps,followup,development,weaponRouteKey})=>({firstActionId,
      ...(weaponRouteKey?{weaponRouteKey}:{}),
      steps:steps.map(({kind,id,targetId,exact})=>({kind,id,...(targetId!=null?{targetId}:{}),exact})),followup,development})),
    comparisonCount:routes.length,comparisonTruncated:routes.length>12,
    comparisonRoutes:routes.slice(0,12).map(({key,weaponId,firstActionId,steps,targets,manaAfter,
      knownCombat,knownDevelopment,safeContinuation,uncertainSecrets})=>({key,weaponId,firstActionId,
      steps:steps.map(({kind,id,targetId,exact})=>({kind,id,...(targetId!=null?{targetId}:{}),exact})),
      targets,manaAfter,knownCombat,knownDevelopment,safeContinuation,uncertainSecrets})),
    blockedFirstIds:[...new Set(admission.lines.filter(l=>!actions.some(a=>a.id===l.firstActionId)).map(l=>l.firstActionId))],
    blockedComparisonFirstIds:[...new Set((admission.weaponRoutes??[])
      .filter(r=>!actions.some(a=>a.id===r.firstActionId)).map(r=>r.firstActionId))]};
};
