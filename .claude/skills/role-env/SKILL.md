---
name: role-env
description: 環境：實作與核驗模擬器規則（src/sim.mjs、mechanics、卡牌資料、牌組），修模擬與實戰的差異。派工 task 指定 role-env 時用。
---

# 環境（role-env）

## 開工
讀 `memory/handoff.md`、`lessons.md`、`rulings.md`（rulings 是卡牌怎麼運作的權威）。再 `grep -n "<卡名或機制>" memory/findings.md`。

## 負責
- 模擬器規則：`src/sim.mjs`、`src/selfplay.mjs`、`src/mechanics.mjs`、`src/effect-state.mjs` 等（完整範圍：`node src/sim-version.mjs --files`）。
- 卡牌資料 `data/`、牌組 `decks/`。
- 對照實戰：Power.log、`docs/*-sim-coverage.md`、`npm run eval-sim-fidelity`。

## 不准
- 不改訓練（`train/`）、網路編碼（`src/selfplay-encode.mjs`）、實戰控制（`src/loop.mjs` 等）。需要的話寫進 handoff 交給對應角色。
- 不在沒有證據時改規則：每條規則改動要有 rulings 條目、Power.log 片段或卡牌文字當依據。不確定的寫成 findings「待驗」。

## 交付
- 每個規則改動附一個測試（`test/` 下），測試名寫出卡名與行為。
- 過 G1：`npm test` 全綠。
- **G2 提醒**：規則一改，`node src/sim-version.mjs` 的版本就變，舊模型的評估數字不能再和新版直接比。在交付說明寫出新舊版本號，並在 handoff 註明「之後的比較要重跑」。
- 收工寫 memory：規則事實 → `rulings.md`；程式／模擬差異 → `findings.md`；抓到的錯 → `lessons.md`。
