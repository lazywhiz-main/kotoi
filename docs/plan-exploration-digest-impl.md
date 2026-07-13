# 実装計画 — 探究の振り分け（精査後）

最終更新: 2026-07-10  
ステータス: **方針確定／D1〜D5 実装済み（migration・Function デプロイは都度）**  
精査: [`design-exploration-digest.md`](./design-exploration-digest.md)  
非同期テンプレ: [`plan-exploration-ux-async.md`](./plan-exploration-ux-async.md)

---

## D1 実装メモ（完了）

- `cluster-explorations`: delete-all 廃止 → upsert（`existing_exploration_id`）
- 未整理0かつ既存あり → AI スキップ
- メンバー／synthesis 変更時 `graphic_rec_status = stale`
- UI: 「新しい問いを振り分ける」+ 未整理件数／最新表示
- migration: `20260710160000_graphic_rec_stale.sql`

デプロイ:

```bash
supabase db push   # または migration 適用
supabase functions deploy cluster-explorations
```

---

## 確定した方針（要約）

| 項目 | 内容 |
|------|------|
| 日常 | **新しい問いを振り分ける**（増分・ID維持） |
| 二次 | **束を組み直す**（フル再編・全消去確認） |
| 促し | 未整理件数。自動クラスタなし |
| 振り分け後 | synthesis は静かに更新／見取り図は **stale** |
| 再生成 | 「いまの図は消えます」確認 → 削除して生成 |
| 組み直し | 「全て消える」確認のみ。保存促しなし |
| 任意保存 | 図の**長押しで端末へ**（強い導線なし） |
| 非同期 | 振り分け・再生成は見取り図テンプレ横転（完了プッシュ含む） |

---

## 実装フェーズ

### D1 — 増分振り分けの芯 ✅

**状態**: コード反映済み。migration + Function デプロイが必要。

| やる | やらない |
|------|---------|
| upsert + `existing_exploration_id` | 非同期化 |
| 未整理カウント → ボタン状態 | 「束を組み直す」 |
| ラベル「新しい問いを振り分ける」 | 再生成前の削除確認（D2） |
| stale フラグ + 最低限 UI | 長押し保存 |

**決めてほしいこと**: このフェーズから着手してよいか → **`D1 OK`**

---

### D2 — stale 見取り図 + 際立つ更新 + 再生成確認 ✅

**状態**: コード反映済み（クライアントのみ・再デプロイ不要）

- 詳細: stale バナー + 「見取り図を更新」CTA、ヘッダー「更新」
- 再生成前: 「いまの見取り図は消えて、新しく描き直します」確認
- 一覧: stale 時「見取り図を更新できます — 開く」

---

### D3 — 「束を組み直す」 ✅

**状態**: コード反映済み。Function デプロイが必要。

- 確認「探究と見取り図はすべて作り直されます。今の見取り図や探究の束を残したい場合は、個別に保存してください。」
- `mode: 'rebuild'` で全削除（見取り図 Storage 含む）→ ゼロから再クラスタ
- 探究タブに控えめなテキストリンク「束を組み直す」

```bash
supabase functions deploy cluster-explorations
```

**依存**: D1

---

### D4 — 長押しで端末に保存 ✅

**状態**: コード反映済み（クライアントのみ）

- 完成済み見取り図を長押し → 共有シート（写真へ保存など）
- 詳細・一覧の両方。促しコピーは付けない

**依存**: なし（D2 と並行可）

---

### D5 — 非同期化 + 完了プッシュ ✅

**状態**: コード反映済み。migration + Function デプロイが必要。

- 「振り分ける」「束を組み直す」を `waitUntil` + pending UI + 完了プッシュ
- `user_settings.explorations_job_*` でジョブ状態を保持
- プッシュタップ → 探究タブ

```bash
supabase db push
supabase functions deploy cluster-explorations
```

**依存**: D1〜D3 の体験が動いてから

---

### 後回し（この計画外）

- 探究詳細チップナビ
- チュートリアル
- Realtime

---

## 推奨順

```
D1 → D2 → D3
     ↘ D4（並行可）
              → D5
```

---

## いま決めてほしいこと

| 質問 | 返信例 |
|------|--------|
| D3（束を組み直す）に進むか | **`D3 OK`** |
| D4（長押し保存）を先にするか | **`D4 OK`** |
