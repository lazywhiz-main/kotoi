# T2 — RevenueCat Promotional で無料フル権限を渡す手順

最終更新: 2026-07-21  
用途: 少数のテスター／招待者に **課金なしで Pro 同等（`trial_state = subscribed`）** を渡す  
親方針: [`plan-environments-and-testers.md`](../plan-environments-and-testers.md) §4.3  
RC 初期設定: [`plan-billing-revenuecat.md`](../plan-billing-revenuecat.md)

**向いている**: いま〜数人、すぐ付与したいとき  
**向いていない**: 課金フローの QA（→ Sandbox T3）、人数が増えたら将来の `access_grants`（T1）

---

## 0. 前提（一度できていれば飛ばしてよい）

- [ ] RevenueCat に Entitlement **`pro`** がある（アプリ定数 `RC_ENTITLEMENT_PRO` と一致）
- [ ] Webhook → `revenuecat-webhook` が本番で動いている
- [ ] アプリがログイン時に `Purchases.logIn(supabaseUserId)` している（実装済み）
- [ ] 相手は **TestFlight / 本番ビルド**（Expo Go では課金 SDK が動かない）

---

## 1. 相手にやってもらうこと

案内文の例:

```
1. App Store / TestFlight から KOTOI を入れる
2. 次のメールアドレスでログインしてください: （指定メール）
3. ログインできたら「登録した」と返信してください
4. こちらで無料アクセスを付けたあと、アプリを一度終了→再起動するか、
   設定／ペイウォールの「購入を復元」を押してください
```

**ポイント**: 付与に必要なのは **Supabase の user UUID**。メールだけでは足りない。登録後に返信してもらうか、Dashboard でメール検索する。

---

## 2. user_id（UUID）を取る

### 方法 A — Supabase Dashboard（推奨）

1. [Supabase](https://supabase.com/dashboard) → 本番プロジェクト  
2. **Authentication → Users**  
3. 案内したメールで検索  
4. **User UID** をコピー（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）

### 方法 B — SQL（メールが分かっているとき）

```sql
select id, email, created_at
from auth.users
where email = 'tester@example.com';
```

この `id` が RevenueCat の **App User ID** になる。

---

## 3. RevenueCat で Promotional を付与

1. [RevenueCat Dashboard](https://app.revenuecat.com) → プロジェクト **KOTOI**
2. **Customers**（または検索）で App User ID = **上の UUID** を開く  
   - まだ Customer が無い場合: 相手が一度ログインしていれば `logIn` で作られる。無いときは先にアプリでログインしてもらう  
   - UUID をそのまま Customer として扱える UI なら、UUID で検索／作成
3. 該当 Customer → **Entitlements** / **Grant promotional access**（表記は RC の版で多少違う）
4. 設定例:

| 項目 | 値 |
|---|---|
| Entitlement | **`pro`** |
| Duration | 期限あり推奨（例: 7日 / 30日 / カスタム） |
| （任意）メモ | 誰向けか・理由 |

5. 付与を確定する

RC が Webhook を飛ばす（イベント種は環境により `NON_RENEWING_PURCHASE` / promotional 系など）。KOTOI の `revenuecat-webhook` は **有効化系**を受けて:

- `subscriptions.trial_state` → **`subscribed`**
- `store` → **`promotional`**（実装どおり）
- `current_period_end` → 期限があればセット

---

## 4. 反映を確認する

### 4a. DB

```sql
select user_id, trial_state, plan, store, current_period_end, updated_at
from subscriptions
where user_id = '（UUID）';
```

期待: `trial_state = subscribed`、`store` が promotional 系。

Webhook が来ていないとき:

- RC → Customer → イベント／履歴に Grant があるか
- Supabase → Edge Functions → `revenuecat-webhook` のログ
- Webhook URL / Authorization ヘッダ（[`plan-billing-revenuecat.md`](../plan-billing-revenuecat.md) §6）

### 4b. アプリ

相手に依頼:

1. アプリを完全終了→再起動  
2. だめなら Paywall または設定付近の **「購入を復元」**  
3. 設定のプラン表示が **購読中** 相当になること  
4. 見取り図2枚目が Paywall に阻まれないこと

---

## 5. 期限切れ・取り消し

| やりたいこと | 操作 |
|---|---|
| 期限どおり終了 | RC の promotional 期限に任せる → 期限後 Webhook で `read_only` 等へ（END 系イベント） |
| 早めに止める | RC Customer で promotional entitlement を **Revoke** |
| DB だけ直す | 原則しない。必ず RC 側を正にして Webhook に任せる |

取り消し後もアプリが「購読中」のままなら、再起動／復元を依頼。

---

## 6. 運用上の注意

- 設定画面では **本物の課金と同じ「購読中」** に見える（T2 の限界）
- 売上集計では `store = promotional` を除外する
- **Sandbox 課金テスターとリストを分ける**（混ざると「無料なのに課金手順」になる）
- UUID を間違えると別人に付く → 付与前にメールと UUID を再確認
- 本番 `trial-dev-override` は使わない

---

## 7. チェックリスト（1人分）

- [ ] 案内メール送信（登録メール指定）
- [ ] 相手がログイン完了
- [ ] UUID 取得
- [ ] RC で `pro` promotional 付与（期限入り）
- [ ] `subscriptions.trial_state = subscribed` を確認
- [ ] 相手に再起動／復元を依頼
- [ ] 「見取り図2枚目が使える」返信をもらう
- [ ] 期限・Revoke 予定をカレンダーかメモに残す

---

## 8. トラブル

| 症状 | 確認 |
|---|---|
| Customer が見つからない | アプリでログイン済みか。App User ID が UUID か（匿名 ID だと Webhook はスキップ） |
| DB が `subscribed` にならない | Webhook ログ・Authorization・イベント type |
| DB は subscribed だがアプリが Paywall | 再起動／復元。古いビルドでないか |
| 期限後もフル | RC で Revoke。Webhook END 系が来たか |

---

## 関連

- 課金・Entitlement 全体: [`plan-billing-revenuecat.md`](../plan-billing-revenuecat.md)
- テスター全体方針: [`plan-environments-and-testers.md`](../plan-environments-and-testers.md)
- Webhook 実装: `supabase/functions/revenuecat-webhook/index.ts`
