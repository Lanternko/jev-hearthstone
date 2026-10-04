# 順序型刪除規則改為「預設刪除＋模擬器可推翻」（規則分層第 2b 步）

新版 `silverfish-v1-rule-release-v1` 已設為決策引擎與排位 runner 的預設。上一版 `silverfish-v1-fodder-hold-v1` 從 `eval/runs/fodder-hold-20261004/candidate/` 封存載入。這一步沒有開排位，也沒有呼叫 Jev 或 Gateway。

## 範圍

| 規則 | 刪掉什麼 | 這次 |
|---|---|---|
| weaponFirst | 有武器可揮時，其他先手動作 | 改為可解除 |
| overflowWaits | 會爆牌的抽牌 | 改為可解除 |
| buffBeforeTap | buff 可用時的 Life Tap | 改為可解除 |
| bodyBeforeBuff | 有身體可下時的 buff | 改為可解除 |
| tempoBuffPick | 選擇階段的 buff 選項 | **維持刪除** |

tempoBuffPick 發生在 Discover／選擇階段，模擬器既不模擬「挑哪張」，也不模擬回合結束時被棄的暫時牌，所以沒有可比較的分數。這條規則只能先維持硬刪。

## 作法

這些規則多半是因為搜尋停在第一個未知數上而存在。例如 Platysaur 戰吼抽牌之後，整條計畫就斷了，所以「Platysaur → 再 buff」這個順序從來沒被算過分。

- **`sim.mjs`**
  - `drawMinionModel`：戰吼只有抽牌的手下（Platysaur 這類）會被模擬成「身體＋抽 n 張未知牌」。
  - `drawFrom`：用 drawnUnknown 補位。
  - 抽到未知牌之後的棄牌改為「不確定」：不假設會棄掉哪一張，也不給棄牌收益。
- **`plan.mjs`**
  - `additiveStep`：判斷一步是不是「唯一的未知數只是多抽了牌」。
  - `search(...,{pastAdditive:true})` 會繼續展開這種步驟之後的動作。
  - `firstAllowed`：只限制第一步。
  - 一般 `menu()` 不傳這些參數，行為不變。
- **`rule-release.mjs`**：刪除仍是預設。被刪的動作只有在以下條件全部成立時才放回一個：
  1. 最佳計畫的第一步就是它；
  2. 分數**嚴格高於**「第一步禁用被刪動作」的最佳計畫（規則自己那條線），也高於什麼都不做；
  3. 規則保留下來的每個非結束動作，模擬器都能下，而且下完之後不會讓計畫中斷。

  平手時維持規則：兩個順序到同一盤面，以使用者裁定為準。解除紀錄寫入 `trace.ruleReleases`，bridge 的紀錄列會帶 `ruleReleases`。

### 為什麼需要條件 3

第一次全歷史重播出現 6 次 weaponFirst 解除、1 次 buffBeforeTap 解除，全部都不公平：

- 規則保留的是 Chronoclaws 揮刀或 Wicked Whispers，兩者都會棄一張未知的牌。
- 模擬器在那一步就得停，於是「規則那條線」只剩一步，任何較長的計畫都會贏它。

測試 g11 的空手英雄揮擊也是同樣情況：沒有 ATK，模擬器根本沒有這一步，所以對手分數是 −∞。

加上條件 3 之後，這 7 次全部不再解除。

## 結果

- **全歷史重播**（90 檔、8524 決策，`history.json`、`history.log`）：
  - 解除 2 次（weaponFirst 1、bodyBeforeBuff 1）；
  - 選單差異 2 個，全部能由解除解釋；
  - 錯誤 0。
  - overflowWaits、buffBeforeTap 都沒有解除。
- **09-25 weaponFirst**：
  - 規則要求先用 Chronoclaws 揮刀，這會棄掉手上最高費的 Reliquary Prime。
  - 解除後可以先讓 Runic Egg 撞 Necrotic Mortician，再讓蜘蛛打臉：5.6 對 4.4。
  - 當時 Jev 實際選的就是 o2t1。
- **09-29 bodyBeforeBuff**：
  - 我方 6 血，對手場攻 12。規則逼先下 Party Fiend，但它自傷 3，等於送死（−35.7）。
  - 解除後先下 Entropic Continuity，再讓 Boneweb Egg 交換 Silver Hand Recruit：+4.5，什麼都不做是 −50。
  - 當時實際下的是 Party Fiend。
  - 同盤面改成滿血時，不解除，維持先下身體。
- **game 4 第 4 回合（使用者裁定：先 Platysaur 再 buff）**：
  - 新搜尋確實展開了「Platysaur → Continuity」這條線。
  - 不解除，裁定照舊。
- **耗時**：全歷史合計 7.0 s，舊版 2.9 s；單一決策最長 776 ms。
- **測試與對照**：
  - 501/501 測試通過（新增 7 項，`test/rule-release.test.mjs`）。
  - 42 組合、192 戰鬥、80 斬殺、16 人類裁定都與上一版相同。

## 已知限制

- 隨機召喚（Disposable Acolytes 這類）仍是「計畫終點」。這類動作在規則保留側時，一律不解除。
- 只有真的有被刪的動作時才多跑兩次搜尋；最慢的盤面接近 0.8 秒。
- 還沒有實戰證據。
