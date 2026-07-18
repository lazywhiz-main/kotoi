# セキュリティ・ストア準拠 自己チェックリスト

最終更新: **2026-07-16**（コードベース初回監査）

**記録方法**: 確認したら `[ ]` → `[x]`。判定が変わったら日付を追記。

参照ガイドライン:

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)（特に 2.1, 3.1, 5.1）
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Google Play Developer Program Policies](https://support.google.com/googleplay/android-developer/answer/17105854)
- [Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)

---

## A. 秘密情報・クライアント境界

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| A1 | AI API 鍵（Anthropic / OpenAI）がクライアントに無い | ✅ | `grep -r "ANTHROPIC\|OPENAI\|sk-" app/ lib/ components/ hooks/`（`.env` と Edge のみ） |
| A2 | `SUPABASE_SERVICE_ROLE_KEY` がクライアントに無い | ✅ | 同上 + `EXPO_PUBLIC_` 以外をクライアントで未使用 |
| A3 | クライアントは `EXPO_PUBLIC_SUPABASE_*` と RevenueCat 公開キーのみ | ✅ | `env.example`, `lib/supabase.ts`, `lib/purchases.ts` |
| A4 | `.env` が Git 管理外 | ✅ | `.gitignore` |
| A5 | EAS Secrets / Supabase Secrets に本番鍵のみ | 🔍 | EAS Dashboard + `supabase secrets list` |
| A6 | ローカル `.env` に service_role を置いていてもビルドに含まれない | ✅ | Expo は `EXPO_PUBLIC_*` のみバンドル |
| A7 | `scripts/graphic-rec-mock-server.mjs` が `.env` を読む（開発専用） | ✅ | 本番ビルドに含まれない。配布しない |

**運用ルール（`.cursorrules` 継続）**

- [x] AI・外部取得は Supabase Edge Functions 経由のみ
- [x] 新しい秘密情報は `env.example` にコメント付きで追記し、クライアント側変数は `EXPO_PUBLIC_` 接頭辞のみ

---

## B. 認証・セッション

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| B1 | Apple Sign In 実装（iOS） | ✅ | `expo-apple-authentication`, `app.json` `usesAppleSignIn` |
| B2 | Google OAuth 実装 | ✅ | `lib/auth/social.ts` |
| B3 | メール OTP / パスワード | ✅ | `AuthProvider.tsx` |
| B4 | 第三者ログインあり → Sign in with Apple 提供 | ✅ | Apple 審査 4.8 相当。ログイン画面に Apple ボタン |
| B5 | OAuth redirect `kotoi://auth/callback` | ✅ | `lib/supabase.ts` `getAuthRedirectUrl()` |
| B6 | セッション永続化 | ⚠️ | **AsyncStorage**（`lib/supabase.ts`）。SecureStore 未使用 |
| B7 | ログアウトでセッション破棄 | ✅ | `signOut()` |
| B8 | パスワードリセットフロー | ✅ | `resetPasswordForEmail` + recovery OTP |
| B9 | 二重アカウント（Hide My Email）への注意 | ⚠️ | `docs/plan-auth.md` に記載。UI 注意文の有無を再確認 |

**B6 推奨（任意強化）**

- [ ] リフレッシュトークンを `expo-secure-store` に移す検討（現状でも anon key + RLS 前提では一般的だが、端末紛失時のリスク低減）

**Apple 5.1.1(v) アカウント削除**

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| B10 | アプリ内からアカウント削除を開始できる | ❌ | 設定に削除 UI なし。規約は「アプリ内または連絡」だが実装はメールのみ |
| B11 | 削除でユーザーデータを消すバックエンド手続 | ❌ | Edge Function / Admin API 未実装 |
| B12 | 削除の確認ダイアログ・不可逆の明示 | ❌ | — |

**Google Play アカウント削除 URL**

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| B13 | 公開 HTTPS の削除請求ページ | ❌ | 例: `https://kotoi.art/account-delete` 未作成 |
| B14 | 削除ページがログイン不要でアクセス可能 | ❌ | — |
| B15 | 削除対象・残存データ・処理期間の説明 | ⚠️ | プライバシーポリシーに概要あり。専用ページなし |

---

## C. データベース・RLS・Storage

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| C1 | 全ユーザーデータ表に `user_id` | ✅ | `supabase/migrations/` |
| C2 | RLS: `user_id = auth.uid()` | ✅ | `20260708100000_init.sql` 他 |
| C3 | `subscriptions` はクライアント **SELECT のみ** | ✅ | `20260712090000_subscriptions_trial.sql` |
| C4 | 課金状態の書き込みは Webhook / service_role のみ | ✅ | `revenuecat-webhook`, `trial-dev-override` |
| C5 | Storage `exploration-graphic-rec` は本人フォルダのみ | ✅ | migration + signed URL |
| C6 | Edge Functions は JWT 検証後に service_role で DB 操作 | ✅ | `_shared/supabase.ts` `getUserFromRequest` |
| C7 | `usage_ledger` に authenticated INSERT grant | ⚠️ | RLS で own のみ。クライアント未使用。**余裕があれば grant を revoke** |
| C8 | 他ユーザーの note / thread が読めない | 🔍 | 2 アカウントで実機テスト |
| C9 | SQL マイグレーションが本番に適用済み | 🔍 | Supabase Dashboard → Migrations |

---

## D. ネットワーク・外部サービス

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| D1 | 本番 API は HTTPS のみ | ✅ | Supabase / Edge / RevenueCat / Expo Push |
| D2 | AI 呼び出しは Edge のみ | ✅ | `_shared/anthropic.ts`, `openaiImage.ts` |
| D3 | YouTube 字幕・記事本文取得は Edge のみ | ✅ | `fetch-transcript`, `_shared/articleBody.ts` |
| D4 | 日次コスト上限 | ✅ | `DAILY_COST_LIMIT_USD`, `usageLedger.ts` |
| D5 | 重い処理は承認制 + pending 状態 | ✅ | research / deepdive 等 |
| D6 | CORS は Edge で制御 | ✅ | `_shared/cors.ts` |
| D7 | プッシュ送信は Edge → Expo Push API | ✅ | `_shared/pushNotify.ts` |

---

## E. 課金（RevenueCat / Store）

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| E1 | デジタルコンテンツは IAP（RevenueCat） | ✅ | `react-native-purchases` |
| E2 | Expo Go では Purchases をスキップ | ✅ | `lib/purchases.ts` `Constants.appOwnership` |
| E3 | Paywall に購入復元 | ✅ | `app/paywall.tsx` `restorePurchases` |
| E4 | サブスク条項・価格表示 | ⚠️ | 特商法ページ + Paywall UI。Store 価格と文言一致を 🔍 |
| E5 | Webhook 認証（共有シークレット） | ✅ | `REVENUECAT_WEBHOOK_AUTH` |
| E6 | Webhook `verify_jwt = false` | ✅ | `supabase/config.toml` + deploy `--no-verify-jwt` |
| E7 | `ALLOW_TRIAL_DEV_OVERRIDE` 本番無効 | ✅ | **unset 済み**（2026-07-16）。ローカルのみ可 |
| E8 | 設定画面の「課金モード」が本番ビルドに出ない | ✅ | `__DEV__` ブロック内（`app/settings.tsx`） |
| E9 | 無料トライアル・自動更新の説明 | ⚠️ | Paywall / 特商法。Apple 3.1.2 要件を 🔍 |

**Apple 3.1 / Google 課金ポリシー**

- [x] 物理商品ではない → IAP 必須（遵守）
- [ ] サブスク管理 URL（iOS 設定への導線）を Paywall 近くに明示するか検討
- [ ] 無料試用の期間・課金開始タイミングを Paywall に明記

---

## F. 権限・端末アクセス

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| F1 | 通知許可 | ✅ | `expo-notifications` + purpose string |
| F2 | `NSUserNotificationsUsageDescription` が具体的 | ✅ | `app.json` — 用途が明確 |
| F3 | カメラ・写真・位置・連絡先・マイク未使用 | ✅ | `app.json` に該当 permission なし |
| F4 | 通知以外の権限を勝手に要求しない | ✅ | コード上の追加 permission なし |
| F5 | トラッキング（ATT） | ✅ | 広告 SDK なし。Tracking 申告「なし」想定 |
| F6 | Privacy Manifest（`PrivacyInfo.xcprivacy`） | ⚠️ | Expo managed。SDK 更新時に Xcode ビルドで要確認 |

---

## G. 法務・プライバシー開示

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| G1 | 利用規約 URL 公開 | ✅ | https://kotoi.art/terms |
| G2 | プライバシーポリシー URL 公開 | ✅ | https://kotoi.art/privacy |
| G3 | 特商法 URL 公開 | ✅ | https://kotoi.art/tokushoho |
| G4 | アプリ内から法務リンク | ✅ | 設定 → `lib/legal.ts` |
| G5 | 第三者（Supabase / Anthropic / OpenAI / RevenueCat / Expo Push）の記載 | ✅ | `privacy-policy.md` |
| G6 | 【】プレースホルダ解消 | ❌ | 法人名・住所等。`docs/legal/README.md` |
| G7 | 問い合わせ先 | ✅ | contact_kotoi@lazywhiz.io |
| G8 | データ保持・削除ポリシーの記載 | ✅ | privacy-policy §9–10 |
| G9 | 13歳未満向けではない旨 / 年齢 | 🔍 | 規約・ストア申告で明示 |

---

## H. Apple App Store 審査・申告

| # | 項目 | ガイドライン | 現状 | 確認方法 |
|---|---|---|---|---|
| H1 | 完成度（クラッシュ・プレースホルダなし） | 2.1 | 🔍 | TestFlight で全タブ通し |
| H2 | メタデータの正確性 | 2.3 | 🔍 | スクショ・説明が実アプリと一致 |
| H3 | プライバシーポリシー URL（Connect + アプリ内） | 5.1.1(i) | ✅ | |
| H4 | App Privacy 質問票 | 5.1.2 | 🔍 | 附录B を正に Connect 入力 |
| H5 | 目的文字列（permission）の正確さ | 5.1.1(ii) | ✅ | 通知のみ |
| H6 | アカウント作成あり → アプリ内削除 | 5.1.1(v) | ❌ | **ブロッカー** |
| H7 | Sign in with Apple | 4.8 | ✅ | |
| H8 | IAP でデジタル機能解放 | 3.1.1 | ✅ | |
| H9 | 復元購入 | 3.1.1 | ✅ | Paywall |
| H10 | 審査用デモアカウント | 2.1 | ⚠️ | `sample-account-seed.md` あり。Connect メモ未整備 |
| H11 | バックエンド審査中稼働 | 2.1 | 🔍 | Supabase 本番常時 |
| H12 | 輸出規制（暗号化） | — | ✅ | `ITSAppUsesNonExemptEncryption: false` |
| H13 | Support URL | — | ⚠️ | https://kotoi.art または専用ページを Connect に |
| H14 | AI 生成コンテンツの説明 | 1.1 / 2.1 | ⚠️ | 審査メモに「ユーザー入力を AI が要約・問い生成」と記載 |
| H15 | ユーザー生成コンテンツのモデレーション | 1.2 | ✅ | 個人ノート。公開・共有機能なし（現行） |

### App Privacy 申告メモ（附录B 同期）

`docs/legal/privacy-policy.md` 附录B を Connect に転記:

| データ種別 | 収集 | リンク | トラッキング | 用途 |
|---|---|---|---|---|
| Email | 任意 | あり | なし | App Functionality |
| User Content | あり | あり | なし | App Functionality |
| User ID | あり | あり | なし | App Functionality |
| Purchases | あり | あり | なし | App Functionality |
| Usage Data | あり得る | あり | なし | App Functionality |
| Diagnostics | なし（現行） | — | — | 将来入れたら更新 |

---

## I. Google Play 審査・申告

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| I1 | Data safety フォーム完了 | 🔍 | Play Console → App content |
| I2 | プライバシーポリシー URL | ✅ | Connect に https://kotoi.art/privacy |
| I3 | Data safety とポリシーの一致 | 🔍 | 附录A/B と照合 |
| I4 | アカウント削除 URL | ❌ | Play 必須。**ブロッカー** |
| I5 | 転送時暗号化（HTTPS） | ✅ | Data safety で「暗号化あり」申告可 |
| I6 | 第三者 SDK のデータ収集を申告 | 🔍 | Supabase, RevenueCat, Expo（Push） |
| I7 | `POST_NOTIFICATIONS`（Android 13+） | 🔍 | `expo-notifications` ビルドで自動付与。申告と一致 |
| I8 | Target API level 要件 | 🔍 | EAS ビルドの `compileSdk` / `targetSdk` |
| I9 | 課金は Play Billing（RevenueCat 経由） | ✅ | |
| I10 | 復元購入 | ✅ | Paywall |

### Data safety 申告ドラフト（現行実装）

| カテゴリ | 収集 | 共有 | 任意 | 暗号化 | 削除請求可 |
|---|---|---|---|---|---|
| Email | はい | いいえ | はい | はい | はい（要プロセス） |
| アプリの活動（メモ等 UGC） | はい | いいえ | いいえ（コア機能） | はい | はい |
| デバイス ID 等 | いいえ | — | — | — | — |
| アプリ情報（クラッシュ） | いいえ（現行） | — | — | — | — |
| 財務情報（購入） | はい | RevenueCat/Store | いいえ | はい | Store 経由 |

---

## J. 運用・インシデント

| # | 項目 | 現状 | 確認方法 |
|---|---|---|---|
| J1 | 依存パッケージの脆弱性スキャン | 🔍 | `npm audit` / Dependabot |
| J2 | Supabase RLS の定期レビュー | 🔍 | 新テーブル追加時に migration レビュー |
| J3 | API 鍵ローテーション手順 | ⚠️ | 文書化のみ。手順を Runbook に追記可 |
| J4 | Webhook 失敗の監視 | ⚠️ | Supabase Functions ログ |
| J5 | 個人情報漏えい時の連絡体制 | ⚠️ | プライバシーポリシーに概要。社内手順は別途 |

---

## K. 優先アクション（リリースブロッカー）

実装・公開が必要な順:

### K1. アカウント削除（Apple 必須 / Play 必須）— ❌

- [ ] Edge Function `delete-account`（service_role で Auth user 削除 + 関連データ CASCADE または明示削除）
- [ ] 設定画面に「アカウントを削除」（確認 2 段階）
- [ ] 公開ページ `https://kotoi.art/account-delete`（メールフォーム or 手順 + `contact_kotoi@lazywhiz.io`）
- [ ] プライバシーポリシー・Data safety・App Privacy を更新

### K2. 法務【】の確定 — ❌

- [ ] 法人名・住所・代表・電話・管轄裁判所
- [ ] kotoi.art と `docs/legal/` を同時更新

### K3. 本番 Secrets 監査 — 🔍

- [ ] `ALLOW_TRIAL_DEV_OVERRIDE` 無効
- [ ] `REVENUECAT_WEBHOOK_AUTH` 設定済み
- [ ] 不要な開発用 secrets 削除

### K4. ストア申告 — 🔍

- [ ] App Store Connect: App Privacy + 審査メモ + デモアカウント
- [ ] Play Console: Data safety + 削除 URL

### K5. 任意強化 — ⚠️

- [ ] セッションの SecureStore 化
- [ ] `usage_ledger` の INSERT grant 削除
- [ ] Privacy Manifest の Xcode 確認

---

## L. 定期レビュー

| タイミング | やること |
|---|---|
| 機能追加（認証・課金・収集・SDK） | §A–I の該当行だけ |
| 月次 | `npm audit`、Supabase ログ異常 |
| 提出前 | [pre-release-runbook.md](./pre-release-runbook.md) 全実行 |
| ポリシー改定時 | `docs/legal/` + 両ストア申告を同期 |

---

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-07-16 | 初版。コードベース監査に基づく現状判定 |
