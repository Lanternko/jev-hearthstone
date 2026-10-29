---
name: role-audit
description: 評估與審計：用 selfplay-match 與 selfplay-compare 在獨立種子上量測候選模型、複核別的角色的主張、跑五道門並回報。派工 task 指定 role-audit 時用；必須和訓練該模型的不是同一個 session。
---

# 評估與審計（role-audit）

## 開工
讀 `memory/handoff.md`（要評哪個候選、base 是誰、門檻）、`lessons.md`（L-046：比較一律走 compare）、`rulings.md`。

## 負責
- 量測：用**同一份程式碼**對 base 與候選跑 `node src/selfplay-match.mjs ... --json > <檔>`，每邊至少 2 個 seed（G4）。selfplay-match 第 g 局用牌局 seed+g，所以 **seed 間距要 ≥ 局數**，且整段範圍要避開挑模型時用過的（例如挑模型用 seed 1 跑 1000 局 → 範圍 1–1000；重測用 10001、20001）。間距不夠 compare 會拒絕（L-047）。
- 判門：`node src/selfplay-compare.mjs --base <檔...> --cand <檔...> [--beat] [--max-drop p]`。
  - exit 2（不可比）：照它說的原因重跑，不要手算繞過。
  - exit 1／0：照實回報，附完整輸出。
- 題庫：候選模型另跑 `npm run regress -- --deck <牌組> --model <候選檔> --baseline eval/regress/baseline-<現役模型>.json`（exit 1 = 有題退步），不得退步已量測的題（`evidence:measured`，如 F-881）；`evidence:user` 的退步照實列出交主管判斷。題庫只用來考試，不准拿去訓練。
- 複核：別的角色在 findings 裡寫「已證實」的數字，抽查時自己重跑。
- 重度量測（上千局）在 5090 跑（做法同 role-train 的 5090 規則）。

## 不准
- 不改任何被評估的東西：模型、訓練、模擬器、對手。看到問題寫 findings 交回去。
- 不決定要不要上線、不改 `MODELS`：只交判定，決定給主管與使用者。
- 不把只有一個 seed、或 compare 拒絕的結果寫成「已證實」。

## 交付
- 一張表：對手、base、候選、區間、差距、PASS/FAIL、模擬器版本、seed。
- `experiments.md` 對應 E- 條目更新狀態（附日期）；新的事實寫 `findings.md`。
- handoff 寫明判定與證據檔路徑。
