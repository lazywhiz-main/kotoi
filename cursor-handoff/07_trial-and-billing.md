# 07 — 到達トライアルと課金（開発仕様）

> この仕様は「いつ・何を条件に無料を終わらせ、どう課金に繋ぐか」を定義する。
> 価格の根拠は `../pricing_参照価格_v0.2.md`、収支は `../KOTOI_PL_model_v2.xlsx` を参照。
>
> **2026-07 更新**: ペイウォールは「見取り図の閲覧」ではなく、**2枚目を作ろうとしたとき**。1枚目は完全に渡す。

---

## 1. 思想 — これは課金画面ではなく、クライマックスである

一般的なアプリは「14日たったので払ってください」と言う。KOTOIはそれをやらない。

**KOTOIは「価値が出た瞬間」に課金する。**

原価分析でも判明している通り、KOTOIの価値はPhase A（最初の2〜4週）には出ない。メモが溜まり、束になり、探究が立ち上がって、**見取り図が1枚できたとき**に初めて「これは他にない」と分かる。

だから期間ではなく**到達**で切る。ただし訊くタイミングは「見せた直後」ではなく、**もっと欲しくなったとき**。

> **1枚目の見取り図は、そのまま渡す。**  
> （見る・保存する・あとで SNS に投稿する——ここまで無料）  
> **2枚目を作ろうとしたとき**に、「続きは、KOTOIと一緒に。」

**先に渡してから、訊く。** これが絶対の原則。ペイウォールで見取り図を人質にしてはいけない。  
「閲覧したから請求」は、渡し方として不自然なので採用しない。

---

## 2. トライアルの定義

### 無料で渡すもの（1枚目）

アカウントにつき、**成功した見取り図生成 1 枠**。

1. 探究が立っている
2. その探究で見取り図を生成し、`graphic_rec_status = done` まで完了した

この1枚は、閲覧・保存・（将来の）SNS投稿まで含めて **完全に無料**。ここでペイウォールは出さない。

### ペイウォールのトリガー（2枚目）

ユーザーが **別枠の見取り図生成** を始めようとしたとき（生成ボタン押下・Edge Function 呼び出しの直前）。

| 数え方 | 2枚目か |
|---|---|
| **別の探究**で新規に見取り図を作る | **はい** → 課金案内 |
| **同じ探究**の作り直し／`stale` 更新 | **いいえ**（1枠の延長） |
| 生成**失敗**後のリトライ | **いいえ**（成功するまで1枠） |
| チュートリアルの見本画像 | カウント外 |

課金前に `pending` ジョブを走らせない。ボタン押下 → 案内 → 購読後に初めて生成。

### マイルストーン（計測用）— `trial_achieved`

1枚目が `done` になったとき `trial_state = achieved` にしてもよい（aha の記録）。  
**この時点では entitlement は `full` のまま。ペイウォールは出さない。**

### 安全弁（2枚目を押さない人のための上限）

1枚目だけで満足し続ける／探究まで届かない人の無限無料を防ぐ。以下の**いずれか**に達したら、メモ・問いなどの新規AIは止め、課金案内へ寄せる。

| 安全弁 | 閾値 | 理由 |
|---|---|---|
| 経過日数 | **90日** | 十分な猶予。急かさない |
| メモ数 | **60本** | これだけ入れて探究が立たないのは、こちらの実装の問題 |
| 累計AI原価 | **$2.00** | `usage_ledger` で判定。暴走防止の最終防衛線 |

**例外（絶対）**: 安全弁後でも、**見取り図の無料1枠が未使用なら1枚目は生成できる。**  
「先に渡してから訊く」が安全弁より優先。見取り図を一度も受け取れないまま閲覧のみ、にはしない。

**ペイウォール画面へは、安全弁到達だけでは自動遷移しない。**  
ただし **見取り図の2枚目を自分で押したとき** は、安全弁後でもペイウォールへ進む（操作に応じた入口。ミスリードな「閲覧のみ」で止めない）。

静かな入口も残す:

- 閲覧のみバナー／メッセージ横の「続きを書く」（メモ等のAIが止まったとき）
- 設定の「プランを見る／続ける」

安全弁で終了した場合の文言は変える。「まだ探究は立っていませんが、ここまでの記録は残ります」——**責めない**。  
（すでに1枚受け取っている人には「これまでの記録と見取り図は残ります」など。）

---

## 3. 状態機械

```
signed_up
   │
   ▼
trial_active ──(1枚目の見取り図が done)──► trial_achieved
   │                                            │
   │(安全弁)                                     │(2枚目の生成を試みる)
   ▼                                            ▼
trial_expired                            paywall_shown
   │                                            │
   │ 閲覧のみを表現。                            │
   │ ペイウォールには自動遷移しない。              ├─ subscribed
   │ 1枚目未作成なら見取り図だけは可。            └─ dismissed（追加見取り図のみ不可）
   ▼
（既存データは残る。課金したい人は設定などから自発的に）
```

**ペイウォールを閉じただけのとき**: アプリ全体をすぐ `read_only` にしない。  
1枚目と、メモ／問い／探究の閲覧・追加は続けられる。**追加の見取り図生成だけ止める。**  
安全弁で期限が来たら、従来どおり書き込み全般を `read_only` に落とす。

**重要**: `read_only` は**データを消さない**。メモも問いも探究も見取り図も、すべて残り、閲覧・エクスポート・（既存の）保存／投稿できる。新規の書き込みと新規AI処理だけが止まる。

理由: 人文層のデータは**その人の思考の履歴**。人質に取った瞬間、この層からの信用を失う。

---

## 4. トライアル中にできること

| 機能 | trial_active / achieved | 2枚目ペイウォール後（未購読） | read_only（安全弁・失効後） |
|---|---|---|---|
| メモの放り込み | **○ 無制限** | ○ | × |
| 分類・要約 | **○** | ○ | × |
| **問いの生成** | **○ 無制限** | ○ | × |
| 追記・質問 | ○ | ○ | × |
| 調べる／深掘り | ○（日次コスト上限内） | ○ | × |
| 探究の整理 | ○ | ○ | × |
| 見取り図の生成 | **○（成功1枠＋同探究の更新）** | **×（案内）** | **1枠未使用なら○／2枚目操作ならペイウォール** |
| 既存データの閲覧 | ○ | ○ | **○** |
| エクスポート／保存 | ○ | ○ | **○** |
| SNS投稿（将来） | ○ | ○ | **○**（既存画像） |

**問いの生成は絶対に制限しない。** トライアル中も、これがプロダクトの核。

---

## 5. プランと価格

| プラン | 表示価格（税込） | 備考 |
|---|---|---|
| **一般・月払い** | **¥1,200 / 月** | |
| **一般・年払い** | **¥10,000 / 年**（月換算 ≈¥833） | **推奨として提示**（デフォルト選択） |
| **学割・月払い** | ¥600 / 月 | 一般の半額目安 |
| **学割・年払い** | ¥5,000 / 年 | 一般の半額目安 |

### ペイウォールの見せ方

- **年払いをデフォルト選択**にする（churnが2%まで落ちる。事業インパクトが最大）
- 「月に本1冊分」というフレーミングを使う（人文層に最も効く参照点）
- 残量・使用量は**一切表示しない**。「無制限」で通す（ソフトキャップは¥1,200でも原価上は余裕を見て設計）
- コピーの核: **「次の見取り図から、続ける」**（1枚目を取り上げない）

### 学割の認証

- `.ac.jp` / `.edu` ドメインのメールアドレス確認で足りる（初期実装）
- 年1回の再確認
- 濫用は許容範囲。**院生は最高の伝道師なので、多少漏れても撒く価値がある**

---

## 6. データモデル（追加分）

`03_data-model.sql` に追加するマイグレーション。

```sql
create type trial_state as enum
  ('active','achieved','expired','subscribed','read_only');
create type plan_kind as enum
  ('monthly','annual','student_monthly','student_annual');

-- ユーザーの課金状態
create table subscriptions (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  trial_state        trial_state not null default 'active',
  trial_started_at   timestamptz not null default now(),
  trial_achieved_at  timestamptz,          -- 1枚目の見取り図が done になった時刻
  paywall_shown_at   timestamptz,          -- 2枚目試行 or 安全弁で訊いた時刻
  free_graphic_rec_exploration_id uuid,    -- 無料1枠を消費した探究（同探究の更新判定用）
  plan               plan_kind,
  is_student         boolean not null default false,
  student_verified_at timestamptz,
  store              text,                  -- 'apple' | 'google'
  store_txn_id       text,                  -- レシート/購入トークン
  current_period_end timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();

alter table subscriptions enable row level security;
create policy own_sub on subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- トライアル進捗（安全弁・表示用）
create view trial_progress as
  select
    s.user_id,
    s.trial_state,
    s.trial_started_at,
    s.free_graphic_rec_exploration_id,
    (select count(*) from notes n where n.user_id = s.user_id) as note_count,
    (select count(*) from explorations e where e.user_id = s.user_id) as exploration_count,
    (select count(*) from explorations e
       where e.user_id = s.user_id and e.graphic_rec_status = 'done') as graphic_rec_done_count,
    (select coalesce(sum(cost_usd),0) from usage_ledger u where u.user_id = s.user_id) as total_cost_usd,
    extract(day from now() - s.trial_started_at) as days_elapsed
  from subscriptions s;
```

**書き込み権限は Edge Function（service_role）からのみ**。クライアントから `trial_state` を書き換えられてはいけない。

---

## 7. Entitlement（権限判定）

**単一モジュールに集約する。** 各画面で個別に条件を書くと必ず漏れる。

```ts
// lib/entitlements.ts
export type Entitlement = 'full' | 'read_only';

export function entitlementOf(sub: Subscription): Entitlement {
  if (sub.trial_state === 'subscribed') return 'full';
  if (sub.trial_state === 'active' || sub.trial_state === 'achieved') return 'full';
  return 'read_only';   // expired / read_only
}

/** 見取り図の新規生成（別探究）が可能か。同探究の更新は別判定。 */
export function canStartGraphicRec(
  sub: Subscription,
  explorationId: string,
): 'allow' | 'paywall' | 'read_only' {
  if (sub.trial_state === 'subscribed') return 'allow';
  if (sub.trial_state === 'expired' || sub.trial_state === 'read_only') return 'read_only';
  // active / achieved
  if (!sub.free_graphic_rec_exploration_id) return 'allow'; // まだ1枠未使用
  if (sub.free_graphic_rec_exploration_id === explorationId) return 'allow'; // 同探究の更新
  return 'paywall'; // 2枚目
}
```

**全てのEdge Function（AIを呼ぶもの）は、冒頭で entitlement を検証する。** `read_only` なら 402。  
**`generate-exploration-graphic-rec` は加えて `canStartGraphicRec`。** `paywall` なら 402（または専用コード）で、ジョブを開始しない。

---

## 8. 課金の実装

- **iOS**: StoreKit 2 の自動更新サブスクリプション
- **Android**: Google Play Billing
- **推奨**: **RevenueCat** を挟む。両OSのレシート検証・状態同期・解約検知を肩代わりしてくれる。個人開発で自前実装するのは割に合わない。
- **サーバ側検証は必須**。クライアントの申告だけで `subscribed` にしない。
- RevenueCat の Webhook → Supabase Edge Function → `subscriptions` を更新。

**ストアの商品ID**
```
kotoi.pro.monthly          ¥1,200
kotoi.pro.annual           ¥10,000
kotoi.student.monthly      ¥600
kotoi.student.annual       ¥5,000
```

---

## 9. 計測イベント

PLモデルのファネルと1対1で対応させる。

| イベント | 意味 | PLの対応行 |
|---|---|---|
| `install` | 初回起動 | インストール |
| `first_note_created` | 初回メモ | 初回メモ |
| `phase_a_passed` | メモ10本超 | Phase A通過 |
| `exploration_formed` | 探究が初成立 | — |
| `graphic_rec_first_done` | **1枚目の見取り図が完成** | **aha** |
| `graphic_rec_second_attempted` | **2枚目生成を試みた** | — |
| `paywall_shown` | ペイウォール表示（理由: second_graphic / safety） | — |
| `subscribed` | 課金成立（plan別） | 新規有料 |
| `trial_expired_by_safety` | 安全弁で終了 | （離脱分析用） |
| `subscription_cancelled` | 解約 | churn |

**最重要の転換率**: `graphic_rec_second_attempted`（または `paywall_shown` reason=second）→ `subscribed`。  
補助: `graphic_rec_first_done` → 後日の second_attempted（1枚目の価値が効いているか）。

旧案の `graphic_rec_viewed` は使わない。

---

## 10. エッジケース

| ケース | 挙動 |
|---|---|
| 探究が立たないまま90日 | 安全弁で終了。責めない文言。データは残す |
| 見取り図の生成に失敗 | 1枠は消費しない。再生成を促す。ペイウォールにしない |
| 同探究の stale 更新 | 1枠のまま許可（未購読でも可） |
| **安全弁後だが見取り図1枚目未作成** | **1枚目は生成可。** メモ／問い等の他AIは止めたまま |
| 安全弁後に2枚目を試みた | **ペイウォール**（押した操作への応答。閲覧のみメッセージで止めない） |
| 2枚目ボタン → ペイウォールを閉じた | 全体は read_only にしない。追加見取り図のみ不可 |
| 課金後に解約 → 期間終了 | `current_period_end` まで `full`、以降 `read_only` |
| 学割の期限切れ | 一般価格へ自動移行（事前に通知） |
| 再課金 | `read_only` から `full` に復帰。データはそのまま |
| ストアの返金 | Webhookで `read_only` に落とす |
| トライアル中にAI原価が$2超 | 安全弁で終了。**ただし重い処理の承認制が効いていれば、まず起きない** |

---

## 11. 開発スコープ

`06_build-roadmap.md` の **M6** として追加する（M4 体験②の後、M5 仕上げと並行可）。

**M6 — トライアルと課金**
1. `subscriptions` テーブル＋ `trial_progress` ビューのマイグレーション
2. `entitlementOf` / `canStartGraphicRec` と、全 Edge Function への検証の差し込み
3. 1枚目 `done` → `trial_achieved` ＋ `free_graphic_rec_exploration_id` 記録
4. 2枚目試行 → ペイウォール（生成ジョブは開始しない）
5. 安全弁の判定（日次バッチ）
6. ペイウォール画面（年払いデフォルト・「月に本1冊分」・「次の見取り図から」）
7. RevenueCat 統合＋Webhook受け
8. `read_only` モードのUI（閲覧・エクスポートのみ）
9. 計測イベント

**完了条件**: 見取り図を1枚受け取ったユーザーが、**別探究で2枚目を作ろうとしたとき**にペイウォールが出て、課金でき、解約後も自分のデータが読める。

### 実装メモ（2026-07）

- [x] migration `subscriptions` / `trial_progress` / 新規ユーザー trigger
- [x] `lib/entitlements.ts` + Edge `_shared/entitlements.ts`
- [x] 見取り図 2 枚目ゲート（402 `paywall_required`）+ 1 枚目記録
- [x] 主要 AI Function の `read_only` ガード（classify / chat-turn / cluster）
- [x] `/paywall` UI（年払いデフォルト。ストア接続はプレースホルダ）
- [x] `trial-dev-override`（状態切替のみ。安全弁の無効化はしない）
- [x] RevenueCat / 本番購入（iOS）。Android は [`docs/ops/google-play-setup.md`](../docs/ops/google-play-setup.md)
- [ ] 残りの Edge Function への entitlement 差し込み
- [ ] `read_only` 専用 UI の仕上げ

### 11.5 App Store 3.1.2 / 2.1.0 — ペイウォール必須表示（リジェクト対応 2026-07）

Apple は **購入画面（ペイウォール）上** に次を要求する（ガイドライン 3.1.2）:

1. **タイトルと期間**（月払い／年払い）
2. **価格**（**StoreKit / RevenueCat から取得。アプリに円額をハードコードしない**）
3. **自動更新の説明**（更新される旨・更新時課金・解約方法。期間終了24時間前までに解約しない限り更新、等）
4. **利用規約（EULA）とプライバシーポリシーへの機能するリンク**

KOTOI 実装場所: `app/paywall.tsx`  
リンク正本: https://kotoi.art/terms / https://kotoi.art/privacy  
審査メモ: [`docs/ops/app-store-review-notes.md`](../docs/ops/app-store-review-notes.md)

**2.1.0 App Completeness** で併発しやすい原因:

- ASC のサブスク商品メタデータ未完成（Missing Metadata）→ 審査員が購入できない
- 到達トライアルのみだとペイウォールに辿り着けない → **設定 → プラン → プランを見る** で開けること＋ Review メモに手順

再提出前: 商品を「提出準備完了」にし、バイナリと一緒に提出。Review Notes にデモ手順を貼る。

### 11.6 設定 → サブスクリプションを管理

購読中ユーザー向けに、設定のプラン欄から **OS の購読管理画面**へ開ける導線を置く（アプリ内解約 UI は作らない）。

- 文言: 「サブスクリプションを管理」
- iOS: `Purchases.showManageSubscriptions()`（失敗時は App Store の購読 URL）
- Android: Play の購読 URL（`package=app.kotoi`）
- 実装: `lib/purchases.ts` の `openManageSubscriptions` / `app/settings.tsx`

---

## 12. やらないこと（初期）

- **使用量メーター・残量表示**（思想と衝突する。¥1,200でも原価的にメーターは不要）
- 見取り図の**閲覧**を課金トリガーにすること
- 1枚目をペイウォールの向こうに置くこと
- 複数の有料ティア（ヘビー向け上位プラン等）
- 従量課金・クレジット制
- Web課金（ストア経由のみ）
- ファミリープラン・チームプラン
