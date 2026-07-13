# 02 — アーキテクチャ

## 全体像
```
┌─────────────────────────┐        ┌───────────────────────────────┐
│  Expo App (RN + expo-router)      │        │  Supabase                     │
│  - 画面/状態/入力                  │  <-->  │  - Postgres (RLS)             │
│  - supabase-js クライアント        │        │  - Auth (email, 単一ユーザー) │
│  - 楽観的UI + realtime購読(任意)   │        │  - Edge Functions (Deno)      │
└─────────────────────────┘        │        └──────────────┬────────────────┘
                                                            │ (server-side only)
                                                            ▼
                                                 Anthropic Claude API
                                                 (classify / summarize /
                                                  questions / research / dig)
                                                 + YouTube transcript 取得
```

## 責務分担
- **Expo**: UI、入力、Supabaseの読み書き、Edge Function呼び出し、通知表示。**AIキーは持たない**。
- **Supabase Postgres**: 単一の真実。notes / thread_items / explorations 等（`03_data-model.sql`）。RLSで `user_id = auth.uid()`。
- **Edge Functions**: AI処理と外部取得を集約。Anthropic APIキー・コスト制御をここに閉じ込める。

## Edge Functions（Deno / TypeScript）
| 関数 | 入力 | 役割 | 自動/承認 |
|---|---|---|---|
| `classify-note` | note_id | typeとis_videoを判定しnotesを更新 | 自動（capture直後） |
| `summarize-note` | note_id | learn/seedの要約をthread_item(kind=summary)で追加 | 自動 |
| `fetch-transcript` | note_id (source_url) | YouTube字幕取得→notes.video_transcript保存。失敗時フォールバック | 自動 |
| `generate-questions` | note_id (+ optional parent_item_id) | 5類型の問いをthread_item(kind=question)で追加 | 自動 |
| `run-research` | note_id, parent_item_id, prompt | web調査→result item→新しい問い | 承認 |
| `run-deepdive` | note_id, parent_item_id, prompt | 前提分解の深掘り→result→新しい問い | 承認 |
| `chat-turn` | note_id, mode(note/ask/research/dig), text | ユーザー発話を保存し、modeに応じAIを起動 | modeで分岐 |
| `cluster-explorations` | user_id | 似たメモ/問いを束ねexplorationsを更新（定期/手動） | バッチ |
| `weekly-review` | user_id, week | ふりかえり用の集計＋呼び戻し候補を返す | 定期/手動 |

すべて Anthropic API を `04_ai-prompts.md` のプロンプトで呼ぶ。呼び出しは冪等・リトライ可能に。長時間処理は `thread_items.status = 'pending'` を先に作り、完了時に `update` → クライアントは realtime か再フェッチで反映。

## コスト制御
- 各AI呼び出し前に `usage_ledger`（日次トークン/コスト概算）を確認。上限超過が見込まれる処理は実行せず、クライアントに「承認が必要」を返す。
- 自動で走るのは軽処理（分類・要約・問い生成）のみ。research/deepdive/長尺動画は必ず承認。

## リアルタイム/更新
- MVPは「Edge Function完了後にクライアントが対象noteのthread_itemsを再フェッチ」で十分。
- 体験を上げるなら Supabase Realtime で `thread_items` の insert/update を購読。

## 認証
- 個人利用のため単一ユーザー。Supabase Auth（emailマジックリンク）でログイン。全テーブルRLSで自分の行のみ。
- 将来のリリースに備え、最初から `user_id` を全行に持たせる。

## 環境変数（`env.example` 参照）
- クライアント: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Edge Functions（secrets）: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, (任意) `YOUTUBE_TRANSCRIPT_*`

## プロジェクト構成（推奨）
```
mondo/
├─ app/                      # expo-router 画面
│  ├─ (tabs)/
│  │  ├─ index.tsx           # ホーム/最近のメモ
│  │  ├─ shelf.tsx           # 問いの棚
│  │  ├─ explorations.tsx    # 探究一覧
│  │  └─ review.tsx          # ふりかえり
│  ├─ note/[id].tsx          # 体験① スレッド
│  ├─ exploration/[id].tsx   # 探究詳細（問いの地図）
│  └─ capture.tsx            # 放り込む入口（モーダル）
├─ components/               # QuestionCard, ThreadItem, Composer, QuestionMap ...
├─ lib/
│  ├─ supabase.ts            # クライアント初期化
│  ├─ api.ts                 # Edge Function 呼び出しラッパ
│  └─ types.ts               # ← 同梱 types.ts をここへ
├─ supabase/
│  ├─ migrations/0001_init.sql   # ← 03_data-model.sql
│  └─ functions/             # 上表のEdge Functions
├─ .cursorrules
└─ app.json / package.json / tsconfig.json
```
