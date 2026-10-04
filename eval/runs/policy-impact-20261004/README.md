# 刪除型過濾器影響範圍（2026-10-04，離線）

範圍：今早 9 場（`ranked-2026-10-03T17-42-01-535Z` 6 場、`ranked-2026-10-03T21-59-42-214Z` 3 場），共 157 個決策、64 個回合。只有這兩批有 `rawOptions`，更早的紀錄無法重播。

## 作法

`patch.mjs` 複製 `src/policy.mjs` 的 `constrainActions`，在每個過濾階段插入標記，放在 `instrumented/`。`src/` 未修改。

對每個決策：
1. 用現行過濾器處理原始選單，把每個被刪的選項歸給「最後一個讓它消失的階段」。
2. 用 `search(state, raw)` 在未過濾的選單上找模擬器的最佳第一步，看它是否被刪掉，並記下分差。

重跑：

```
cd eval/runs/policy-impact-20261004/instrumented
node impact-filters.mjs "" ../all.jsonl
```

## 結果

- 157 個決策中，有 71 個（分布在 45 個回合）至少刪掉一個選項，總共刪掉 174 個選項。
- 模擬器最佳第一步被刪：19/157 個決策（17 個回合）。其中 11 個是 `wastedFodder` 刪的。
- 最終給 Jev 的選單重現 147/157，差異來自舊版 planner。

## 限制

- 模擬器不計算棄牌素材未來的收益（例如 Walking Dead、Silverware Golem 被棄時召喚自己）。因此「最佳步被刪」不等於過濾器錯了。
- 歸因採用「最後一個刪掉它的階段」。
