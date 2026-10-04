import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {openingCardStats} from './opening-card-stats.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),sourceRun=process.argv[2];
if(!sourceRun||!/^history-classified-[\w-]+$/.test(sourceRun))throw Error('Pass the classified run name');
const input=join(root,'eval/runs',sourceRun),text=await readFile(join(input,'games.json'),'utf8'),raw=JSON.parse(text);
const games=raw.map(g=>({id:g.id,ordinal:g.ordinal,start:g.start,result:g.result,initiative:g.initiative,matchup:g.matchup,
  originalOpeningComplete:g.evidence?.originalOpeningComplete===true,receiptComplete:g.evidence?.receiptComplete===true,
  finalOpeningComplete:g.evidence?.finalOpening?.complete===true,offered:g.evidence?.opening?.offered??[],
  kept:g.evidence?.kept??[],finalOpening:g.evidence?.finalOpening?.cards??[],
  finalFailure:g.evidence?.finalOpening?.failure??null}));
const deckText=await readFile(join(root,'decks/warlock-discard/mulligan.json'),'utf8');
const stats=openingCardStats(games,{cardNames:Object.keys(JSON.parse(deckText).cards??{})});
const dir=join(root,'eval/runs',`opening-winrates-${new Date().toISOString().replace(/[:.]/g,'-')}`);await mkdir(dir,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
await writeFile(join(dir,'games.json'),JSON.stringify(games,null,2));
await writeFile(join(dir,'stats.json'),JSON.stringify(stats,null,2));
await writeFile(join(dir,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceRun,sourceSHA256:hash(text),
  deckMetadataSHA256:hash(deckText),statsModuleSHA256:hash(await readFile(join(root,'src/opening-card-stats.mjs'))),
  generatorSHA256:hash(await readFile(join(root,'src/eval-opening-winrates.mjs'))),classifiedGames:stats.classifiedValid,
  scope:'Classified games only for quadrant results; excludes unknown type separately; includes historical strategy versions, manual and interrupted games. Outcomes from HDT. No model calls or games launched.'},null,2));
await mkdir(join(dir,'source'),{recursive:true});
for(const file of ['eval-opening-winrates.mjs','opening-card-stats.mjs','eval-strength.mjs'])
  await writeFile(join(dir,'source',file),await readFile(join(root,'src',file)));
await writeFile(join(dir,'source','mulligan.json'),deckText);
const pct=n=>n==null?'—':`${(n*100).toFixed(1)}%`;
const value=s=>s.n?`${s.wins}/${s.n}（${pct(s.winRate)}）`:'—（0場）';
const label={control_first:'控制・先手',control_second:'控制・後手',other_first:'非控制・先手',other_second:'非控制・後手'};
const metricLabel={original:'換牌前原始起手有',kept:'刻意保留',final:'換牌後起手有'};
const paragraph='三種情況皆按「含該卡的場次」計數，同一局兩張同名卡只算一場。原始起手是換牌前；保留是伺服器確認留下的原起手；換牌後起手包括保留與新換入牌，在TURN=1 MAIN_READY取樣，排除硬幣與第一回合抽牌。三種群組重疊，不能把差值解讀為留牌／換牌的因果收益。';
const summaries=Object.entries(stats.quadrants).map(([key,q])=>`| ${label[key]} | ${value(q.baseline)} | ${q.metrics.original.baseline.n} | ${q.metrics.kept.baseline.n} | ${q.metrics.final.baseline.n} |`).join('\n');
const table=(key,q)=>`## ${label[key]}\n\n象限總體：${value(q.baseline)}。數字格式：勝／場（勝率）。\n\n| 卡牌 | 換牌前原始起手有 | 刻意保留 | 換牌後起手有 |\n|---|---:|---:|---:|\n${stats.cardNames.map(name=>`| ${name} | ${value(q.metrics.original.cards[name].present)} | ${value(q.metrics.kept.cards[name].present)} | ${value(q.metrics.final.cards[name].present)} |`).join('\n')}`;
const report=`# 四象限：留不同牌與起手含不同牌的勝率\n\n已初步分類 ${stats.classifiedValid}/${stats.n} 場；未知類型 ${stats.unknownExcluded.length} 場不納入四象限。分類沒有因這次勝率結果而修改。\n\n${paragraph}\n\n| 象限 | 勝／場（勝率） | 原始起手可核實場數 | 保留回報可核實場數 | 換牌後起手可核實場數 |\n|---|---:|---:|---:|---:|\n${summaries}\n\n${Object.entries(stats.quadrants).map(([k,q])=>table(k,q)).join('\n\n')}\n\n## 不確定性與重跑\n\n各卡每種群組的95% Wilson區間、同象限無該卡的勝率、相對同指標群體平均差值與逐局GameId在stats.json；games.json保留三種手牌以供逐局核實。樣本少於5場的高低值不宜拿來調規則，5–9場仍很不穩定；10場也不代表已具有因果證據。多張牌、四象限及多種統計同時比較容易出現偶然高低值。本資料混有人工與不同版本，不能當成新版勝率。\n\n重跑：node src/eval-opening-winrates.mjs ${sourceRun}（建立新批次）。保留原報告，不改正式策略、不呼叫模型、不開始新局。\n`;
await writeFile(join(dir,'report.md'),report);
// Matrix view makes the four quadrants easier to compare without four long tables.
const matrix=`# 四象限並排比較\n\n${paragraph}\n\n${['kept','final','original'].map(metric=>`## ${metricLabel[metric]}\n\n| 卡牌 | 控制先手 | 控制後手 | 非控制先手 | 非控制後手 |\n|---|---:|---:|---:|---:|\n${stats.cardNames.map(name=>`| ${name} | ${Object.values(stats.quadrants).map(q=>value(q.metrics[metric].cards[name].present)).join(' | ')} |`).join('\n')}`).join('\n\n')}\n\n不足5場的個別結果不能據此調規則；所有區間與無該卡對照见stats.json。\n`;
await writeFile(join(dir,'matrix.md'),matrix);
console.log(JSON.stringify({dir,total:stats.n,classified:stats.classifiedValid,unknown:stats.unknownExcluded.length,
  quadrants:Object.fromEntries(Object.entries(stats.quadrants).map(([k,q])=>[k,{n:q.baseline.n,wins:q.baseline.wins,
    usable:Object.fromEntries(Object.entries(q.metrics).map(([m,v])=>[m,v.baseline.n]))}]))}));
