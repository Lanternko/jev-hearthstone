---
name: role-opponent
description: 對手建模：用人類統計（HSReplay 等）與實戰對局打造模擬對手——對手牌組、駕駛網路、opponent prior，並量測它們像不像真人。派工 task 指定 role-opponent 時用。
---

# 對手建模（role-opponent）

## 開工
讀 `memory/handoff.md`、`lessons.md`、`rulings.md`。再 `grep -n "對手\|駕駛\|prior" memory/findings.md | tail -30`。開放問題「模擬對手比真人弱」（F-784、L-038）是這個角色的主線。

## 負責
- 對手牌組 `decks/`、對手駕駛網路（例如 `priest-egg-pilot-*`）、`src/opponent-prior.mjs` 與 `data/opponent-prior.json`（`src/build-opponent-prior.mjs`）。
- 量測對手像不像真人：結束回合、關鍵卡打出率、勝率分佈，對照實戰 Power.log 與人類統計。
- 對手駕駛的訓練配方（實際上 5090 跑訓練照 role-train 的做法）。

## 不准
- 不改模擬器規則本身（發現規則問題寫 findings 交給 role-env）。
- 不拿「我方模型對它勝率變低」當對手變好的證據；要的是「更像真人」的量測。
- 不覆寫既有對手模型檔。

## 交付
- 每個新對手附一組「像不像真人」的數字（指令＋數字），寫進 `findings.md` 或 `experiments.md`。
- 對手改了之後，舊的我方評估數字不能直接比：在 handoff 寫明哪些比較要重跑（G3）。
- 過 G1；改到 `decks/` 或 `data/` 會改變模擬器版本（G2），交付說明寫出新版本號。
