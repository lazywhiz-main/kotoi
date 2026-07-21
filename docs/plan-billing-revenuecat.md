# RevenueCat 手作業ガイド（KOTOI）

最終更新: 2026-07-21  
前提: ASC に `kotoi.pro.monthly` / `kotoi.pro.annual` が登録済み、Bundle `app.kotoi`  
表示価格（公開前）: **月 ¥1,200 / 年 ¥10,000**（学割目安: 月 ¥600 / 年 ¥5,000）

---

## 1. プロジェクト作成

1. [RevenueCat](https://app.revenuecat.com) にログイン
2. **Create new project** → 名前 `KOTOI`
3. **Add App** → iOS
   - App name: `KOTOI`
   - Bundle ID: **`app.kotoi`**
   - App Store Connect App を紐付け（In-App Purchase Key / Shared Secret の案内に従う）

Android は後で追加可。

---

## 2. Apple 接続（必須）

RevenueCat の iOS App 設定で、次のいずれか／両方を設定（ダッシュボードの手順に従う）:

- **In-App Purchase Key**（.p8）— ASC → Users and Access → Integrations → In-App Purchase（推奨・現行）
- **App Store Connect API Key**（商品インポート用）

### アプリ用共有シークレット（Shared Secret）

ASC の「アプリ用共有シークレット」は、**Apple のレシート検証 API（verifyReceipt 系）にアプリ側／サーバが提示する共有鍵**です。

| 誰が使うか | 用途 |
|---|---|
| **RevenueCat** | RC が App Store の購読レシートを検証するとき（RC の iOS App 設定に貼る） |
| 自前サーバ | いまの KOTOI では **使わない**（課金検証は RC + Webhook） |

審査フローで発行を求められた場合も、**発行して RevenueCat の Apple アプリ設定に入れておけば足りる**ことが多い。アプリの `.env` やクライアントコードには **入れない**（秘密情報）。

既に In-App Purchase Key（.p8）を RC に入れていれば、Shared Secret はダッシュボードが求めるときだけ併用／移行用として扱う。

---

## 3. Products

**Products** → **+ New**（または App Store から Import）

| Product ID | Type |
|---|---|
| `kotoi.pro.monthly` | Subscription |
| `kotoi.pro.annual` | Subscription |

ASC と同じ ID であること。

---

## 4. Entitlement

**Entitlements** → **+ New**

- Identifier: **`pro`**（コード・Webhook と一致させる。変更しない）
- Attach: `kotoi.pro.monthly` と `kotoi.pro.annual`

---

## 5. Offering

**Offerings** → **+ New**（または default を編集）

- Identifier: **`default`**（`current` にする）
- Packages:
  - **Monthly** → `kotoi.pro.monthly`（`$rc_monthly` でも可だが、コードは product id / package type で解決）
  - **Annual** → `kotoi.pro.annual`

**Make current** にする。

---

## 6. API Keys（クライアント）

**Project settings → API keys**

- **Apple** の **Public app-specific key**（`appl_...`）を控える
- これを EAS / `.env` に:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_xxxxx
```

Android 用は後で:

```bash
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_xxxxx
```

EAS:

```bash
eas env:create --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "appl_..." --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "appl_..." --environment preview --visibility plaintext
```

---

## 7. Webhook（サーバ）

Edge Function `revenuecat-webhook` をデプロイしたあと:

1. RevenueCat → **Integrations → Webhooks**
2. URL: `https://<PROJECT_REF>.supabase.co/functions/v1/revenuecat-webhook`
Authorization: 任意の長いランダム文字列を Authorization ヘッダに設定。  
同じ値をそのまま Supabase Secret に入れる（実装はヘッダ全体の一致）:

```bash
# 例: Dashboard で Authorization = "Bearer kotoi_rc_wh_...." と設定した場合
supabase secrets set REVENUECAT_WEBHOOK_AUTH="Bearer kotoi_rc_wh_...."
# JWT 検証を切る（必須）。切らないと RC の Authorization がゲートで 401 になる
supabase functions deploy revenuecat-webhook --no-verify-jwt
```

`config.toml` に `[functions.revenuecat-webhook] verify_jwt = false` もある。

Events: 最低でも  
`INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `CANCELLATION`, `UNCANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`

---

## 8. アプリ側の前提

- `react-native-purchases` は **ネイティブモジュール** → **Expo Go では本番購入不可**
- 検証は **TestFlight ビルド**（または development build）＋ **Sandbox テスター**

---

## 9. 完了チェック

- [ ] iOS App `app.kotoi` が RC に紐づいている
- [ ] Products 2本が Entitlement `pro` に付いている
- [ ] Offering `default` が Current
- [ ] Public API Key を env / EAS に入れた
- [ ] Webhook URL + Auth を設定した
- [ ] TestFlight で購入 → Supabase `subscriptions.trial_state = subscribed`
