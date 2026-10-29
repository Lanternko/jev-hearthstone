// node runtime/check-window.mjs : read-only check that the Hearthstone window is what the click geometry assumes
// (2560x1440, borderless WS_POPUP, client origin 0,0, same elevation as this shell). Changes nothing; exits 0 when all pass.
// Hidden child, no console window.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ps=fileURLToPath(new URL('./check-window.ps1',import.meta.url));
const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',ps],{encoding:'utf8',windowsHide:true,timeout:20000});
let g;try{g=JSON.parse(r.stdout.trim())}catch{console.log(`FAIL no reply from the checker: ${(r.stderr||r.stdout||'').trim()}`);process.exit(1)}
if(!g.ok){console.log(`FAIL ${g.error}`);process.exit(1)}
const checks=[
 ['client 2560x1440',g.width===2560&&g.height===1440,`${g.width}x${g.height}`],
 ['client origin 0,0',g.originX===0&&g.originY===0,`${g.originX},${g.originY}`],
 ['WS_POPUP, no title bar',g.wsPopup&&!g.hasCaption,g.style],
 ['same elevation as the bot',g.hearthstoneElevated==='yes'?g.botElevated===true:g.hearthstoneElevated==='no'?g.botElevated===false:null,`Hearthstone elevated: ${g.hearthstoneElevated}; this shell elevated: ${g.botElevated}`],
];
let bad=0;
for(const [name,ok,detail] of checks){console.log(`${ok===true?'PASS':ok===null?'WARN':'FAIL'}  ${name}  (${detail})`);if(ok===false)bad++}
process.exit(bad?1:0);
