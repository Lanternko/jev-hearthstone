// `npm run game-zoo [deck]`: a self-play network at the wheel of its deck, from the deck screen
// (`npm run game-zakajz` is the same with warlock-zakajz). The deck names a network in MODELS
// (src/selfplay-shadow.mjs); a missing model file stops the run before await-game waits for a game.
// Waits for a game, then plays it to the end like `npm run game`, the loop's output in runtime/last-game.log.
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,openSync,writeSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {MODELS,modelFile,modelFor} from './selfplay-shadow.mjs';

export const DEFAULT_DECK='warlock-zoo';
// node src/game-zoo.mjs [deck]; flags are not part of the deck name.
export const deckArg=(argv=process.argv.slice(2))=>argv.find(a=>!a.startsWith('-'))??DEFAULT_DECK;

// What main needs to know before spawning anything: the model for this deck and whether its file is there.
// JEV_NET_MODEL wins in modelFile, as it does in the shadow and the follow-the-network pick.
export function checkModel(deck){
  const file=modelFile(deck),name=modelFor(deck);
  if(!file)return {ok:false,deck,file:null,name:null,
    error:`no network for deck '${deck}'; decks with one: ${Object.keys(MODELS).join(', ')} (JEV_NET_MODEL names a file)`};
  if(!existsSync(file))return {ok:false,deck,file,name,
    error:`network file for deck '${deck}' not found: ${file}; build ${name} first, or set JEV_NET_MODEL`};
  return {ok:true,deck,file,name};
}

async function main(){
  const deck=deckArg(),check=checkModel(deck);
  if(!check.ok){
    console.error(`game-zoo: ${check.error}`);
    process.exit(1);
  }
  const root=fileURLToPath(new URL('..',import.meta.url));
  // User, 2026-10-27: "jev 直接關掉就好" -- the network plays, the mulligan uses the rules, Jev is never called.
  const env={...process.env,JEV_DECK:deck,JEV_FOLLOW_NET:'1',JEV_OFFLINE:'1'};
  const run=(script,stdio)=>new Promise(done=>{
    spawn(process.execPath,['--env-file-if-exists=.env.local',fileURLToPath(new URL(script,import.meta.url))],{cwd:root,env,stdio,windowsHide:true}).on('exit',(code)=>done(code??1));
  });
  mkdirSync(`${root}runtime`,{recursive:true});
  const log=openSync(`${root}runtime/last-game.log`,'w');
  writeSync(log,`deck ${deck}, network ${check.name}\n`);
  const waited=await run('./await-game.mjs','inherit');
  if(waited)process.exit(waited);
  process.exit(await run('./loop.mjs',['ignore',log,log]));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
