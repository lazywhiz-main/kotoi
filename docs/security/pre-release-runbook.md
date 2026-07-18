# リリース直前 Runbook（KOTOI）

提出の **48時間前** にこの順で実行する。`self-check.md` の ❌ / ⚠️ が残っていないことを前提とする。

---

## 1. Supabase（本番プロジェクト）

```bash
# ローカルから本番 ref を指定して確認（値は表示しない）
supabase secrets list --project-ref pshprbmoywstesqeljet
```

| Secret | 本番で期待する値 |
|---|---|
| `ALLOW_TRIAL_DEV_OVERRIDE` | **未設定** または `0`（`1` は禁止） |
| `REVENUECAT_WEBHOOK_AUTH` | RevenueCat Dashboard と一致する長いランダム文字列 |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | 有効。ローテーション済みであれば最新 |
| `DAILY_COST_LIMIT_USD` | 意図した上限（例: `2.00`） |

Edge Functions（変更があるたび再デプロイ）:

```bash
supabase functions deploy revenuecat-webhook --no-verify-jwt --project-ref pshprbmoywstesqeljet
# 他: classify-note, fetch-transcript, generate-questions 等
```

`supabase/config.toml` の `[functions.revenuecat-webhook] verify_jwt = false` がデプロイ設定と一致していること。

---

## 2. RevenueCat

- [ ] iOS / Android プロダクト ID が Store と一致（`kotoi.pro.monthly` / `kotoi.pro.annual`）
- [ ] Entitlement `pro` が Paywall と一致
- [ ] Webhook URL: `https://<project>.supabase.co/functions/v1/revenuecat-webhook`
- [ ] Webhook Authorization が `REVENUECAT_WEBHOOK_AUTH` と一致
- [ ] Sandbox で購入 → `subscriptions.trial_state` が `subscribed` に更新される

---

## 3. Supabase Auth Dashboard

- [ ] Redirect URLs: `kotoi://auth/callback`（開発用に `exp://` 系が必要なら追加）
- [ ] Apple Provider: Service ID / Key / Team 設定済み
- [ ] Google Provider: OAuth クライアント設定済み
- [ ] Site URL / Additional Redirect URLs がリネーム後（KOTOI）と一致

---

## 4. EAS / ビルド

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

- [ ] `app.json`: `bundleIdentifier` / `package` = `app.kotoi`
- [ ] `ITSAppUsesNonExemptEncryption` = false（輸出規制の申告と一致）
- [ ] バージョン・ビルド番号をインクリメント
- [ ] **開発用 UI**（設定の課金モード Switch 等）が `__DEV__` ブロック内のみであること

---

## 5. App Store Connect

| 項目 | 入力値の目安 |
|---|---|
| Privacy Policy URL | https://kotoi.art/privacy |
| Support URL | https://kotoi.art（または専用サポートページ） |
| App Privacy（データの収集） | `docs/legal/privacy-policy.md` 附录B を正とする |
| Sign in with Apple | 有効（第三者ログインあり） |
| 年齢制限 | ユーザー生成コンテンツなし → 通常 4+（要最終判断） |
| 審査メモ | デモアカウント（メール + パスワード）、バックエンド常時稼働、AI 機能の説明 |
| デモアカウント | `docs/sample-account-seed.md` のサンプル投入済みアカウント |

**審査メモに書くこと（例）:**

```
デモログイン:
  Email: （審査用アカウント）
  Password: （審査用パスワード）

メモ本文・URL を入力すると AI が要約・問いを生成します（数秒〜数十秒）。
課金は Sandbox。Paywall から月額/年額をテスト可能。復元ボタンあり。

バックエンド: Supabase（常時稼働）
AI: Anthropic Claude（サーバー側のみ）
```

---

## 6. Google Play Console

| 項目 | 入力値の目安 |
|---|---|
| Privacy policy URL | https://kotoi.art/privacy |
| Data safety | `self-check.md` §D と `privacy-policy.md` 附录A/B |
| Account deletion URL | **要公開** — 例: `https://kotoi.art/account-delete` |
| Target API level | Play 最新要件を満たすビルド |
| コンテンツレーティング | アンケート回答 |
| 広告 ID | 使用しない（現行） |

Data safety で申告する主なデータ（現行実装）:

- Email（任意・ログイン時）
- User-generated content（メモ・スレッド）
- User IDs
- App interactions / diagnostics（将来導入時は追記）
- Purchases（RevenueCat 経由）

---

## 7. 公開サイト（kotoi.art）

- [ ] `/terms` `/privacy` `/tokushoho` が 200 で開く（PDF ではない）
- [ ] 【】プレースホルダを公開前に埋める
- [ ] アカウント削除ページ（Play 必須）を追加
- [ ] 問い合わせ `contact_kotoi@lazywhiz.io` が受信可能

---

## 8. 提出前スモークテスト（実機）

- [ ] 新規登録 → メモ投入 → 要約・問いが出る
- [ ] Apple / Google ログイン
- [ ] パスワードリセット（メールリンク → `kotoi://auth/callback`）
- [ ] Paywall 購入（Sandbox）→ 機能解放
- [ ] 購入復元
- [ ] プッシュ通知（許可 → 登録 → タップで画面遷移）
- [ ] 設定 → 法務リンクが開く
- [ ] **アカウント削除**（実装後）が end-to-end で動く
- [ ] ログアウト → オープニング／ログイン（意図どおり）

---

## 9. 提出後

- [ ] クラッシュ・課金・Webhook ログを 24h 監視
- [ ] App Privacy / Data safety を実装変更時に同期更新
