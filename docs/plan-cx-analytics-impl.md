# CX計測 — 実装計画（L1 推奨）

最終更新: 2026-07-21  
親企画: [`plan-cx-analytics.md`](./plan-cx-analytics.md)

---

## 0. 推奨決定（たたき台として固定）

| 項目 | 推奨 | 理由 |
|---|---|---|
| 置き場 | **L1 自前**（Supabase `analytics_events`） | 本文を外に出さない方針と一致。PostHog はユーザー増後でもよい |
| オプトアウト UI | **MVP では無し** | 機能改善・障害把握のみ／本文なし。設定トグルは P2 以降検討 |
| タイミング | **公開直前〜直後に P1 のみ** | 辞書と表を先に用意し、★イベントを薄く埋める。P2 は実データ見てから |
| ドリルダウン | **原則集計のみ** | サポート時のみ SQL で user_id。アプリ内に個人ダッシュは作らない |

異論があれば実装前に覆してよい。以下はこの前提で書く。

---

## 1. アーキテクチャ

```
App (track)
  → invoke Edge `track-event`（JWT 必須）
    → insert analytics_events（service role / または authenticated + RLS）
  → __DEV__ は従来どおり console も可

週次: SQL Editor / 保存クエリで CX ボード
状態指標: notes / thread_items / daily_question_deliveries / subscriptions（イベント不要）
原価: usage_ledger（既存）
```

**クライアントから直 insert しない**（推奨）: イベント名の許可リスト検証・props サニタイズを Edge に寄せる。

代替（より薄い）: RLS 付きで `authenticated` INSERT のみ許可し、Edge なし。その場合も **許可イベント名は CHECK or トリガー** で縛る。

本計画の既定は **Edge `track-event`**。

---

## 2. スキーマ案

```sql
create table analytics_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  schema_ver  smallint not null default 1,
  created_at  timestamptz not null default now()
);

create index analytics_events_user_created_idx
  on analytics_events (user_id, created_at desc);
create index analytics_events_name_created_idx
  on analytics_events (name, created_at desc);

alter table analytics_events enable row level security;

-- 本人は自分の行を読める（設定「自分のデータを見る」将来用）。分析は service / SQL。
create policy own_analytics_events_select on analytics_events
  for select using (user_id = auth.uid());

-- insert は Edge（service role）経由を想定 → authenticated に insert grant しない
```

保存期間: 生データ **90日**（cron で delete）。日次集計ビューは後からでよい。

---

## 3. Edge `track-event`

**入力**

```json
{
  "name": "shelf_opened",
  "props": { "open_count": 12 },
  "schema_ver": 1
}
```

**処理**

1. JWT から `user_id`
2. `name` が許可リストになければ 400
3. `props` から禁止キーを落とす（`raw_text`, `body`, `email`, `transcript` 等）
4. 値の型を string/number/boolean/null に制限（ネストオブジェクトは拒否 or 1段まで）
5. insert
6. 任意: 同一 user + name が短時間に大量なら drop（簡易レート制限）

**許可リスト（schema_ver = 1）** — ★のみ。増やしたらドキュメントとコードを同時更新。

```
session_started
note_created
thread_opened
shelf_opened
question_opened
daily_question_shown
daily_question_action
daily_question_enable
paywall_shown
purchase_result
annual_upgrade_tapped
annual_upgrade_result
```

---

## 4. クライアント `lib/analytics.ts`

```ts
// 本番: fire-and-forget で track-event を叩く（失敗しても UX を止めない）
// __DEV__: console.log も残す
// props に本文を入れないことをコメントで強制
```

呼び出し箇所（P1）:

| イベント | ファイル目安 |
|---|---|
| `session_started` | ルート layout / Auth 後 1回＋間引き |
| `note_created` | Capture 成功時 |
| `thread_opened` | `note/[id]` focus |
| `shelf_opened` | `shelf` focus |
| `question_opened` | ShelfQuestionRow onPress |
| `daily_question_*` | DailyQuestionCard / EnableCard / shelf |
| `paywall_shown` | paywall mount |
| `purchase_result` | paywall / purchases |
| `annual_upgrade_*` | settings |

既存の `sns_post_*` は許可リストに入れず、必要になるまで送らない（または次点）。

---

## 5. イベント辞書（props 詳細・schema_ver 1）

| name | 必須 props | 任意 | 備考 |
|---|---|---|---|
| `session_started` | — | `cold_start: bool` | フォアグラウンドごとに連打しない（例: 30分に1回） |
| `note_created` | — | `note_type`, `is_video`, `has_url` | `note_id` 可。本文不可 |
| `thread_opened` | — | `from`（shelf/home/…） | `note_id` 可 |
| `shelf_opened` | — | `open_question_count` | |
| `question_opened` | — | `question_type` | `item_id` 可 |
| `daily_question_shown` | — | `question_type` | |
| `daily_question_action` | `action`: open\|save\|dismiss | `question_type` | |
| `daily_question_enable` | `action`: enable\|skip | `recall_hour` | |
| `paywall_shown` | — | `reason` | |
| `purchase_result` | `result`: ok\|cancel\|fail | `plan` | fail 時 `error_code` 短文可 |
| `annual_upgrade_tapped` | — | — | |
| `annual_upgrade_result` | `result`: ok\|cancel\|fail | — | |

---

## 6. DB だけで見る指標（イベント不要）

週次ボードの半分はこれで足りる。P1 と並行して SQL を用意する。

```sql
-- 今日の問い: 残す / あとで / 期限切れ（直近7日）
select status, count(*)
from daily_question_deliveries
where delivered_on >= current_date - 7
group by 1;

-- 新規メモ人数（直近7日）
select count(distinct user_id)
from notes
where created_at >= now() - interval '7 days';

-- 購読状態分布
select trial_state, plan, count(*)
from subscriptions
group by 1, 2;
```

Activation（初回メモまで）も `auth.users` + `notes` の min(created_at) で近似可能。

---

## 7. 週次 CX ボード（見る順）

1. 新規ユーザー数 / メモした人数（DB）  
2. `shelf_opened` UU（イベント）  
3. 今日の問い action 内訳（イベント or deliveries）  
4. `paywall_shown` → `purchase_result`（イベント）  
5. `usage_ledger` 日次コスト（既存・原価）  

所要: SQL を数本ストックし、毎週同じ順で眺める。BI ツールは後回し。

**コピペ用ボード（観点・見方つき）**: [`ops/cx-weekly-board.md`](./ops/cx-weekly-board.md)

---

## 8. 法務・ストア（P1 実装と同時）

- [x] プライバシーポリシーに「機能改善のための利用状況（本文を含まない）」を追記（リポ）
- [ ] kotoi.art/privacy へ同文言を反映
- [ ] App Privacy: Analytics / Usage Data を Connect で更新
- [x] 第三者分析ツールは使わない（L1）と明記

---

## 9. 実装タスク分解

| ID | タスク | 状態 |
|---|---|---|
| T1 | migration `analytics_events` + RLS | 実装済（未 push） |
| T2 | Edge `track-event` + 許可リスト | 実装済（未 deploy） |
| T3 | `lib/analytics.ts` 本番接続 | 実装済 |
| T4 | ★イベント埋込み | 実装済 |
| T5 | 週次 SQL スニペット | [`ops/cx-weekly-board.md`](./ops/cx-weekly-board.md) |
| T6 | 法務・Privacy 文言 | サイト反映済想定 |
| T7 | （任意）90日削除 cron | 未 |

**やらない（P1）**: PostHog、Metabase、オプトアウト、クラッシュ、実験基盤。

---

## 10. 受け入れ条件

- [ ] シミュレータで `shelf_opened` が1行 insert される  
- [ ] props にわざと `raw_text` を入れても Edge が落とす  
- [ ] 未知の `name` は 400  
- [ ] 週次 SQL が空でもエラーなく走る  
- [ ] メモ本文が `analytics_events.props` に現れないことをサンプリング確認  

---

## 11. 次のアクション

1. この推奨決定（L1・オプトアウトなし・P1薄く）でよいか確認  
2. OK なら T1〜T4 を実装スプリントに載せる  
3. NG なら L2 用の別紙（PostHog・キー・法務）を書く
