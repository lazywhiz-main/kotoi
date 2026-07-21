# 週次 CX ボード — SQL と見方

最終更新: 2026-07-21  
場所: Supabase → **SQL Editor**（本番プロジェクト）  
所要: 毎週同じ曜日に **15分**。上から順に実行。

親企画: [`plan-cx-analytics.md`](../plan-cx-analytics.md) / [`plan-cx-analytics-impl.md`](../plan-cx-analytics-impl.md)

---

## 使い方

1. 下の観点を **①→⑤** の順に見る（飛ばさない）
2. 数字そのものより「先週比・違和感」をメモする（Notion 1行で十分）
3. イベントが少ない週は **DB指標（①③⑤）だけ**でも意思決定できる
4. `analytics_events` は本人 RLS あり。SQL Editor（service / postgres）なら全行見える

期間はすべて **直近7日**。変えたいときだけ `interval '7 days'` / `current_date - 7` を調整。

---

## ① 入口 — 新規とメモ

**見たいこと**: 人が来ているか／メモまで到達しているか。

### 1a. 新規ユーザー（Auth）

```sql
select count(*) as new_users
from auth.users
where created_at >= now() - interval '7 days';
```

**見方**
- 0 が続く → 配信・導線・審査前の想定どおりかも。公開後に増えなければストア／LP
- 増えたが次の 1b が小さい → ログイン後に何も書いていない（オンボーディング／初回メモ）

### 1b. メモした人数・件数

```sql
select
  count(distinct user_id) as users_who_noted,
  count(*) as notes_created
from notes
where created_at >= now() - interval '7 days';
```

**見方**
- `users_who_noted / new_users` が粗い Activation
- 件数だけ多く人数が少ない → ヘビーユーザー偏り（悪くないが全体健康は人数）

### 1c. 初回メモまでの時間（任意・深掘り）

```sql
with first_note as (
  select user_id, min(created_at) as first_note_at
  from notes
  group by user_id
)
select
  percentile_cont(0.5) within group (
    order by extract(epoch from (f.first_note_at - u.created_at)) / 3600.0
  ) as median_hours_to_first_note
from auth.users u
join first_note f on f.user_id = u.id
where u.created_at >= now() - interval '7 days';
```

**見方**: 中央値が何日もなら、初回体験が重い or 離脱。公開直後はサンプル少で無視してよい。

---

## ② コアループ — 棚と問い

**見たいこと**: メモしたあとに「問いの棚」へ来ているか。

### 2a. 棚を開いた人数（イベント）

```sql
select count(distinct user_id) as shelf_uu
from analytics_events
where name = 'shelf_opened'
  and created_at >= now() - interval '7 days';
```

**見方**
- `shelf_uu / users_who_noted` が低い → 棚タブの存在・価値が伝わっていない
- イベント0でもメモはある → クライアント未更新ビルド or 計測漏れを疑う

### 2b. 棚から問いを開いた回数

```sql
select
  count(*) as question_opens,
  count(distinct user_id) as question_open_uu,
  props->>'question_type' as question_type
from analytics_events
where name = 'question_opened'
  and created_at >= now() - interval '7 days'
group by 3
order by 1 desc;
```

**見方**: 類型に極端な偏りがあれば、生成・表示の偏りかも（すぐ変えなくてよい。観察）。

### 2c. スレッドを開いた人数

```sql
select count(distinct user_id) as thread_uu
from analytics_events
where name = 'thread_opened'
  and created_at >= now() - interval '7 days';
```

**見方**: 棚経由でもホーム経由でも入る。`note_created` と近い人数なら「作って見ている」。

---

## ③ 今日の問い — 呼び戻し

**見たいこと**: 届いたあと「残す」まで行っているか。イベントが薄くても deliveries で足りる。

### 3a. 配信ステータス（DB・本命）

```sql
select status, count(*) as n
from daily_question_deliveries
where delivered_on >= current_date - 7
group by 1
order by 2 desc;
```

**見方（status）**
- `active` … まだ未処理（当日のカード）
- `saved` … 残した → 価値あり
- `dismissed` … あとで
- `expired` … 翌日以降に未処理で落ちた
- `saved` が相対的に多いほど良い。行自体がほぼ無い → リズム off／対象少

### 3b. アクション内訳（イベント）

```sql
select
  props->>'action' as action,
  count(*) as n,
  count(distinct user_id) as uu
from analytics_events
where name = 'daily_question_action'
  and created_at >= now() - interval '7 days'
group by 1
order by 2 desc;
```

**見方**: `save` が `open` / `dismiss` に対してどれだけか。カードが出ていない週は 0 で正常。

### 3c. オンにした／スキップ（イベント）

```sql
select
  props->>'action' as action,
  count(*) as n
from analytics_events
where name = 'daily_question_enable'
  and created_at >= now() - interval '7 days'
group by 1;
```

**見方**: `skip` ばかりなら誘導カードの出し方・コピーを見直す候補。

---

## ④ 課金 — Paywall と年額

**見たいこと**: 見せたあとに買っているか。理由別の詰まり。

### 4a. Paywall 表示 → 購入結果

```sql
-- 表示
select
  props->>'reason' as reason,
  count(*) as shown,
  count(distinct user_id) as uu
from analytics_events
where name = 'paywall_shown'
  and created_at >= now() - interval '7 days'
group by 1
order by 2 desc;

-- 結果
select
  props->>'result' as result,
  props->>'plan' as plan,
  count(*) as n,
  count(distinct user_id) as uu
from analytics_events
where name = 'purchase_result'
  and created_at >= now() - interval '7 days'
group by 1, 2
order by 3 desc;
```

**見方**
- `shown` はあるが `purchase_result` の `ok` が無い → 価格・コピー・Sandbox／本番の差
- `cancel` が多いのは普通。`fail` が目立つならストア／RevenueCat
- `reason`（例: 2枚目見取り図）で偏りがあれば、そのゲートの説明を優先改善

### 4b. 月額→年額アップグレード（設定）

```sql
select name, props->>'result' as result, count(*) as n
from analytics_events
where name in ('annual_upgrade_tapped', 'annual_upgrade_result')
  and created_at >= now() - interval '7 days'
group by 1, 2
order by 1, 3 desc;
```

**見方**: tapped 多く result が cancel → CTA は見えているが魅力不足。tapped 自体が少ない → 導線が弱い。

### 4c. 購読状態のスナップショット（DB）

```sql
select trial_state, plan, count(*) as n
from subscriptions
group by 1, 2
order by 3 desc;
```

**見方**: 週次の「ストック」。フロー（4a）とストック（4c）を両方見る。

---

## ⑤ 原価 — usage_ledger

**見たいこと**: 体験が動いている日にコストも跳ねていないか。暴走の早期検知。

### 5a. 日次コスト合計

```sql
select
  (created_at at time zone 'Asia/Tokyo')::date as day_jst,
  round(sum(cost_usd)::numeric, 4) as cost_usd,
  count(*) as rows,
  count(distinct user_id) as users
from usage_ledger
where created_at >= now() - interval '7 days'
group by 1
order by 1;
```

**見方**: 特定日だけ跳ねたら、同日のメモ人数・research/deepdive を疑う。

### 5b. 機能別コスト

```sql
select
  fn,
  round(sum(cost_usd)::numeric, 4) as cost_usd,
  count(*) as calls
from usage_ledger
where created_at >= now() - interval '7 days'
group by 1
order by 2 desc
limit 20;
```

**見方**: 表示名は `lib/usageLabels.ts`。重い fn が上位固定なら上限・承認制の効きを確認。

---

## ⑥ 健全性チェック（月1・任意）

### イベント種別の有無

```sql
select name, count(*) as n, count(distinct user_id) as uu
from analytics_events
where created_at >= now() - interval '7 days'
group by 1
order by 2 desc;
```

**見方**: 許可リスト外が無いこと。`paywall_shown` だけあって `shelf_opened` が無い週が続く → 利用実態か計測欠落。

### props に本文っぽいキーが無いか（サンプリング）

```sql
select name, props, created_at
from analytics_events
order by created_at desc
limit 50;
```

**見方**: `raw_text` / 長文 / メールらしき文字列が無いこと。あれば Edge のサニタイズを直す。

---

## 週次メモの型（コピー用）

```
日付:
① 新規 / メモ人数:
② 棚 UU:
③ 今日の問い status:
④ Paywall → purchase:
⑤ 日次コストピーク:
気になったこと1つ:
来週やること（0〜1個）:
```

来週やることが2個以上なら、やらない。数字は観察、施策は一つ。
