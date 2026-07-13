# 02 — アーキテクチャ（v2）

> ベース: `cursor-handoff/02_architecture.md`  
> **v2 追加**: 見取り図パイプライン、OpenAI 画像、非同期パターンの横転。

## 全体像
```
Expo App  <-->  Supabase (Postgres + Auth + Edge Functions)
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   Anthropic Claude          OpenAI Images
   (分類・要約・問い・         (見取り図 PNG)
    調査・クラスタ・
    見取り図の構図プロンプト)
```

- **Expo**: UI・supabase-js・Function 呼び出し。**秘密鍵は持たない**（anon のみ）。
- **Edge Functions**: AI／外部取得／コスト制御。
- **Storage**: 見取り図画像バケット（例: `exploration-graphic-rec`）。

## Edge Functions（v2 時点の主なもの）

| 関数 | 役割 | 自動/承認 |
|------|------|-----------|
| `classify-note` / `summarize-note` / `generate-questions` | 軽処理縦串 | 自動 |
| `fetch-transcript` | 動画字幕 | 自動 |
| `chat-turn` / `run-research` / `run-deepdive` | 対話・調査 | mode／承認 |
| `cluster-explorations` | 問いの振り分け（増分／rebuild） | 手動・非同期可 |
| `weekly-review` | ふりかえり | 手動／クールダウン |
| **`generate-exploration-graphic-rec`** | **見取り図**（Claude で構図 → OpenAI で画像 → Storage） | **手動・非同期** |

長時間処理は `pending` を先に書き、HTTP は早期 return。完了で update ＋プッシュ。クライアントは再フェッチ／ポーリング／focus。

## 見取り図データ（explorations 上）

`graphic_rec_status`: `pending` | `done` | `error` | `stale`  
`graphic_rec_variant`: `metaphor` | `narrative` | `human` | `spatial`  
ほか: storage_path / prompt_version / selection_reason / error / generated_at

正: `cursor-handoff/03_data-model.sql` および migrations。

## コスト
- 見取り図は Claude＋画像の合算。日次上限チェック対象。
- 詳細: `docs/ai-costs.md`

## 認証（補足）
v1 は email マジックリンク想定。実装は Apple / Google / OTP / パスワードに拡張（`docs/plan-auth.md`）。RLS の `user_id = auth.uid()` は不変。
