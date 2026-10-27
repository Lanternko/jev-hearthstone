# priest-egg 模擬器覆蓋報告（2026-10-27）

牌表：`decks/priest-egg/list.json`，30 張、21 種（2026-10-27 換成真人 Imbue 型；原本的 19 種見 git 歷史），英雄 HERO_09bk（麥迪文造型），英雄技能 Lesser Heal（HERO_09dbp，2 費回 2 血）。卡面來自 `data/cards.enUS.json`。

這副是 2026-10-26 實戰輸掉的對手（Power.log `runtime/ranked-2026-10-26T21-51-57-289Z/game-0001-Power.log`，player 2）。牌組代碼、解碼核對與 zoo 的打法寫在 `decks/priest-egg/strategy.md`。

## 怎麼測的

- 牌組代碼用臨時解碼器（base64 → varint → 以 `dbfId` 對卡面庫）解出 30 張，和 `list.json` 一致；`test/priest-egg-sim.test.mjs` 有斷言。
- `test/priest-egg-sim.test.mjs`（12 個測試）：
  - 每一種牌在 20 費、我方場上一隻手下、敵方場上一隻手下時，`moves()` 裡都有出這張牌的合法動作；
  - 蛋的五個階段（DINO_410 → DINO_410t2 → t3 → t4 → t5 → DINO_410t）與 20/20 嘲諷 Khelos；
  - Servant of Zuramat 沉默蛋之後，蛋死掉不再孵；
  - Medivh's Triumph 的 5 費／1 費與全場 4 傷；
  - N'Zoth 的 15 → 14 → 13 → 12 費；
  - Shadow Word: Ruin、Haunt 的 Reborn、Slime 'em! + Ectoplasm、Kaldorei Priestess + Holy Eggbearer、Soothsayer、Undeath Sentence；
  - 每個模型是從卡面文字認出來的（`gameModel` 正則）。
- 另外跑了 200 局隨機動作與 200 局衝臉動作的 zoo 對 priest-egg sanity（見文末）。

「沒建模」的意思是 `modelOf` 沒有回傳任何模型：這種牌在模擬器裡永遠不會出現在 `moves()`，只會卡在手牌裡，而且不會報錯。這次 19 種全部有模型。

## 每張牌（2026-10-27 Imbue／交織命運版）

2026-10-27 換成真人的 Imbue 型（`STATUS.md` 頂端）。拿掉 Servant of Zuramat、Dissolving Ooze、Hold Them Off!、Endbringer Umbra、N'Zoth；Undeath Sentence、Gravedawn Sunbloom、Slime 'em!、Soothsayer 各減為 1。這些牌的模型還在 `sim.mjs`，只是不在牌表裡。

| 牌 | 張數 | 費 | 卡面重點 | 模擬器 | 狀態 |
|---|---|---|---|---|---|
| Holy Smite (CORE_CS1_130) | 2 | 1 | 對一個手下 3 傷 | `boltMinion` 3 傷 | 正確 |
| Elder Word: Flay (BE_223) | 1 | 1 | 對隨機敵人 3 傷；下一張暗影法術重複 | `flay`：隨機敵方英雄或手下 3 傷 | 部分：**重複效果沒做** |
| Power Word: Barrier (TIME_447) | 1 | 1 | 給一個角色聖盾；手牌中的手下 +2 血 | `barrier`（目標友方手下，可無目標） | 部分：只給友方手下聖盾（見假設） |
| Psychic Conjurer (CORE_EX1_193) | 1 | 1 | 1/2，戰吼複製對手牌庫一張牌到手牌 | `minion conjurer` | 已建模：從 `s.them.deck` 隨機一張，複製不移除 |
| Undeath Sentence (JAIL_940) | 1 | 1 | 重播一個死過的友方手下的死亡之聲 | `undeath` → `rattleSome(s,1)` | 已建模 |
| Holy Eggbearer (DINO_411) | 2 | 2 | 1/2，戰吼抽一張 0 攻擊手下 | `minion drawZeroAtk` | 已建模 |
| Lunarwing Messenger (EDR_449) | 2 | 2 | 3/2 吸血，戰吼 Imbue 英雄能力 | `minion imbue` | 已建模（見 Imbue） |
| Eternal Firebolt (END_025) | 2 | 3 | 吸血 3 傷；擊殺則回手 | `boltMinion` | 部分：當下回手 |
| Elder Word: Foresight (BE_221) | 2 | 3 | 抽 1 減 2；下一張暗影法術重複 | `drawReduce` | 部分：重複沒做 |
| Haunt (CAP_801) | 2 | 3 | +2/+3、Reborn、嘲諷 | `buffMinion` | 已建模；駕駛會對自己的蛋施放（`egg-guard.mjs`） |
| Kaldorei Priestess (EDR_970) | 2 | 3 | 3/3，戰吼敵方手下 -2 攻擊；Imbue | `minion priestess imbue` | 部分：-2 攻擊永久；Imbue 正確（舊的「補血 +1」拿掉了） |
| The Egg of Khelos (DINO_410) | 1 | 3 | 0/3，裂 5 次孵 20/20 嘲諷 | `minion egg` | 已建模 |
| Intertwined Fate (TIME_432) | 2 | 3 | 發現一張自己牌庫的複製，再一張對手牌庫的 | `fate` → 選擇 `fate1`、`fate2` | 已建模：各給 3 個不同 cardId，複製不移除 |
| Defias Smuggler (JAIL_998) | 1 | 3 | 2/3，Prepare；戰吼友方手下 +2 攻擊與衝鋒（Rush） | `minion smuggler`（目標友方，可無目標） | 部分：**Prepare 沒做**；Rush 讓剛下的手下這回合可打手下 |
| Gravedawn Sunbloom (TLC_816) | 1 | 4 | 抽 2；Kindred 減 2 | `draw n:2` | 部分：Kindred 沒做 |
| Nightmare Lord Xavius (EDR_856) | 1 | 4 | 4/4，發現牌庫手下並給 Dark Gift | `xavius` | 已建模（近似） |
| Shadow Word: Ruin (CORE_EX1_197) | 1 | 4 | 消滅攻擊 5 以上的手下 | `ruin` | 正確 |
| Slime 'em! (CAP_805) | 1 | 4 | 全場消滅，各拿 Ectoplasm 叫回 | `slime` | 已建模 |
| Cleansing Lightspawn (TIME_427) | 1 | 4 | 2/3 吸血，戰吼對敵方手下造成等同自身血量的傷害 | `minion lightspawn`（目標敵方手下，可無目標） | 已建模：傷害 = 當下血量（Barrier 加過就是 5），吸血回英雄 |
| Medivh's Triumph (CATA_308) | 2 | 5 | 全場 4 傷；有傳說時 1 費 | `aoe` + `costOf` | 正確 |
| Soothsayer (JAIL_912) | 1 | 7 | 6/6 嘲諷，Prepare；亡語回 6 血、召喚隨機 6 費手下 | `minion` + `rattle` | 已建模；Prepare 沒做 |
| Lesser Heal → Blessing of the Moon（英雄能力） | — | 2 | Imbue 前回 2 血；Imbue 後選一張打得出的牧師手下或法術加入手牌，減費 | `power.heal` → `power.bless` | 見 Imbue |

### Imbue 與月之祝福（Blessing of the Moon, EDR_449p）

- 第一次 Imbue（Lunarwing Messenger、Kaldorei Priestess 的戰吼）把英雄能力換成 Blessing of the Moon（2 費，`power.bless=1`）；之後每次 Imbue `bless` +1。
- 使用時從「牧師收藏品手下與法術、模擬器有模型、減費後當下費用付得起」的池子（`context().priest`）隨機給 3 張讓我們選（`bless` 選擇）。選到的牌以暫時牌（`temp`）進手牌，費用減 `bless`，回合結束丟掉。
- 卡面來源：`EDR_449p` 的文字在 `data/cards.enUS.json` 只到「It costs (」就截斷；暫時牌由附魔 `EDR_449e` Fleeting Magic「Costs less. Discard this at the end of your turn.」確認。**減費 = Imbue 次數**是假設。

## 共用機制

- **座位新欄位**：`grave`（這局死過的死亡之聲手下，給 Undeath Sentence／Umbra 重播）、`rattles`（召喚過的死亡之聲手下數，給 N'Zoth 減費）、`slimePile`（Slime 'em! 記下的我方手下）、`power.heal`（英雄能力補血量）。
- **死亡之聲的墳場**：`reap` 在觸發亡語之前，把死亡之聲手下記進自己的 `grave`（敵方記進對方的）；`rattleSome` 只從自己的墳場抽。
- **沉默**：`silence()` 清掉文字與 taunt／ds／lifesteal／reborn 等關鍵字，`rattle` 開頭遇到 `silenced` 直接返回，所以沉默的蛋不會孵。
- **衍生牌**：蛋的五個階段與 Khelos、Ectoplasm 都放在 `context().tokens`（`s.game.tokens`）。蛋的每個階段在資料庫裡同名（The Egg of Khelos），不能只用牌名當 key，所以 `rattle` 用 `cardId` 查 `EGG_NEXT`，再用 `spawnCard` 依卡面召喚。
- **編碼**：`MADE` 加入 `DINO_410 → DINO_410t`、`CAP_805 → CAP_805t`，蛋的每個階段共用同一個詞彙格；2026-10-27 另加 `stages` 區塊（見下）；`selfplay-encode.mjs` 的 `cost` 改用 `stateCost`，讓 Medivh's Triumph 與 N'Zoth 的費用跟著狀態變。
- 模型全部放在 `gameModel`（只在 `s.game` 自戰時生效），實戰模式的行為不變。

## 簡化

- Kaldorei Priestess 的 -2 攻擊是永久的（實際只到你的下一回合）。
- Blessing of the Moon：減費 = Imbue 次數（卡面截斷，假設）；3 個選項從有模型的牧師收藏品池隨機（實際池子可能不同）；編碼只看得到英雄能力能不能用，看不到 Imbue 等級。
- Intertwined Fate：兩邊各給 3 個不同的 cardId；Psychic Conjurer 隨機複製一張對手牌庫的牌。
- Power Word: Barrier 只給友方手下聖盾（卡面是任一角色）；Elder Word: Flay 的暗影重複沒做；Defias Smuggler 的 Prepare 沒做。
- Eternal Firebolt 擊殺後立刻回手（實際是回合結束）。
- Elder Word: Foresight 的「下一張暗影法術重複」沒做；Gravedawn Sunbloom 的 Kindred 減費沒做；Prepare 的準備流程沒做（Soothsayer、Defias Smuggler 照原費用打出）。
- Dissolving Ooze 只摧毀友方手下，Bones 卡沒進手牌。
- Holy Eggbearer 抽「0 攻擊手下」時，若牌庫有多張就隨機一張（實際可選？卡面沒有指定，這裡照抽牌處理）。
- Soothsayer 召喚的 6 費手下從收藏品的 6 費池隨機，不是官方「隨機 6 費手下」的完整池。
- Medivh's Triumph 的「控制傳說」只看自己場上活著的傳說手下（含蛋、Khelos、Xavius、Umbra、N'Zoth）。
- 蛋的階段原本在編碼裡共用一個詞彙格，網路分不出「裂到第幾階」；2026-10-27 加上 `stages` 旗標後，每席 7 格各給場上手下「還剩幾次破殼 ÷ 5」（DINO_410=1、t2=.8、t3=.6、t4=.4、t5=.2、其他 0），舊網路（沒有 `stages`）維持原編碼。

## 自戰現況（200 局，兩種腳本動作）

| 動作 | zoo 勝 | priest-egg 勝 | 和局／未完成 | 平均回合 | 平均步數 |
|---|---|---|---|---|---|
| 隨機合法動作 | 132 | 68 | 0／0 | 20.9 | 76 |
| 衝臉（`rushPolicy`） | 180 | 20 | 0／0 | 13.6 | 47 |

這個比分只代表模擬器能跑完、蛋與清場會發生，不代表牌組強度：隨機動作下 zoo 的手下牌多，priest-egg 的牌多半要選目標；衝臉腳本不會閃清場，priest-egg 的 AOE 直接把場面收掉。

## 還沒驗證的

- 這副只有一場實戰 Power.log（輸的那場），`eval-sim-fidelity` 量不到整體模擬準確度。
- 蛋的五階段在資料庫同名；2026-10-27 已用 `stages` 觀察區塊（每席 7 格）讓網路分辨，測試 `test/selfplay-encode-egg.test.mjs`。
- 英雄造型 HERO_09bk 與牌組代碼裡的 HERO_09 只差外觀，模擬器不看造型。
- 這批沒有改 `src/loop.mjs`、`src/playback-quiet.mjs`、`src/selfplay-shadow.mjs` 的 MODELS。
