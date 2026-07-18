# Secrets 監査レポート

監査日: **2026-07-16**  
対象: Supabase 本番 `pshprbmoywstesqeljet`、EAS `production` / `preview` / `development`

---

## サマリー

| 判定 | 件数 | 内容 |
|---|---|---|
| ❌ 要対応 | **0** | ~~本番 `ALLOW_TRIAL_DEV_OVERRIDE`~~ → **unset 済み** |
| ⚠️ 推奨 | 3 | 日次上限の明示、Android RC キー、preview の RC キー |
| ✅ 問題なし | 多数 | AI 鍵・service_role は Edge のみ、クライアントは `EXPO_PUBLIC_*` のみ |

---

## A. Supabase Edge Secrets（本番）

`supabase secrets list --project-ref pshprbmoywstesqeljet` の結果（**値は表示せず名前のみ**）。

| Secret | 状態 | 用途 | 判定 |
|---|---|---|---|
| `SUPABASE_URL` | 設定済み | Edge DB 接続 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | 設定済み | Edge の DB 書き込み | ✅ |
| `SUPABASE_ANON_KEY` | 設定済み | JWT 検証用 | ✅ |
| `ANTHROPIC_API_KEY` | 設定済み | AI テキスト | ✅ |
| `ANTHROPIC_MODEL` | 設定済み | モデル指定 | ✅ |
| `OPENAI_API_KEY` | 設定済み | 見取り図画像 | ✅ |
| `OPENAI_IMAGE_MODEL` | 設定済み | 画像モデル | ✅ |
| `OPENAI_IMAGE_QUALITY` | 設定済み | 画質 | ✅ |
| `REVENUECAT_WEBHOOK_AUTH` | 設定済み | Webhook 認証 | ✅ |
| `YOUTUBE_TRANSCRIPT_SUPADATA_API_KEY` | 設定済み | 字幕取得 | ✅ |
| `ALLOW_TRIAL_DEV_OVERRIDE` | **本番から削除済み**（2026-07-16） | 開発用課金上書き | ✅ unset 完了 |
| `DAILY_COST_LIMIT_USD` | **未設定** | 日次 AI コスト上限 | ⚠️ コード既定 `2.00` USD で動作 |
| `ANTHROPIC_THINKING` | 未設定 | thinking モード | ✅ 既定 `disabled` |
| `YOUTUBE_TRANSCRIPT_PROXY_URL` | 未設定 | 字幕プロキシ | ✅ Supadata で代替 |
| `YOUTUBE_API_KEY` | 未設定 | 未使用 | ✅ |

Supabase 管理用（自動注入）: `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` — 触らない。

### ✅ 対応済み: `ALLOW_TRIAL_DEV_OVERRIDE`

2026-07-16 に本番から unset 済み。開発用書き換えは **ローカル Supabase** のみで `ALLOW_TRIAL_DEV_OVERRIDE=1` を使う（[運用方針](../plan-environments-and-testers.md)）。

~~digest が `6b86b27…` = **値 `"1"`** と一致。~~  
~~認証済みユーザーが `trial-dev-override` Edge Function で **購読状態を任意に書き換え可能**。~~

```bash
# 実施済み（2026-07-16）
supabase secrets unset ALLOW_TRIAL_DEV_OVERRIDE --project-ref pshprbmoywstesqeljet
```

ローカル開発で override が必要なとき:

```bash
# ローカル Edge のみ（本番には設定しない）
supabase secrets set ALLOW_TRIAL_DEV_OVERRIDE=1
```

### ⚠️ 推奨: `DAILY_COST_LIMIT_USD` を明示

```bash
supabase secrets set DAILY_COST_LIMIT_USD=2.00 --project-ref pshprbmoywstesqeljet
```

意図した上限が `2.00` 以外ならその値に変更。

---

## B. EAS Environment Variables

### production ✅（iOS リリース向け）

| 変数 | 状態 | 判定 |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | 設定済み | ✅ |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 設定済み（plaintext） | ✅ |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | 設定済み（`appl_…`） | ✅ |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | **未設定** | ⚠️ Android 提出前に追加 |
| `EXPO_PUBLIC_REVIEW_DEV_MOCK` | 未設定 | ✅ 本番ではオフ |

### preview ⚠️

| 変数 | 状態 |
|---|---|
| `EXPO_PUBLIC_SUPABASE_*` | 設定済み |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | **未設定** — TestFlight 課金テスト時は追加 |

### development ✅

変数なし — ローカル `.env` 依存で問題なし。

### Android RC キー追加（Play 提出前）

```bash
eas env:create \
  --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY \
  --value "goog_..." \
  --environment production \
  --visibility plaintext
```

---

## C. クライアントに入ってはいけないもの

| 秘密情報 | クライアント | 判定 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | なし | ✅ |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | なし | ✅ |
| `REVENUECAT_WEBHOOK_AUTH` | なし | ✅ |
| `.env` | `.gitignore` 済み | ✅ |

クライアントが読むのは `EXPO_PUBLIC_*` のみ（`lib/supabase.ts`, `lib/purchases.ts`）。

---

## D. Edge Function 設定

| Function | `verify_jwt` | 判定 |
|---|---|---|
| `revenuecat-webhook` | `false` | ✅ 共有 Authorization 方式。`config.toml` + deploy `--no-verify-jwt` |
| その他 | 既定 `true` | ✅ JWT 必須 |

---

## E. RevenueCat Webhook 整合

- [x] `REVENUECAT_WEBHOOK_AUTH` が本番 Secrets に存在
- [ ] RevenueCat Dashboard の Authorization ヘッダと **完全一致** を手動確認（値は Dashboard 側）
- [ ] Webhook URL: `https://pshprbmoywstesqeljet.supabase.co/functions/v1/revenuecat-webhook`

---

## F. ローカル `.env`（参考）

リポジトリ外。開発用に `service_role` を置いても **Expo バンドルには含まれない**（`EXPO_PUBLIC_` 以外は除外）。

開発者マシンでは:

- [ ] `.env` を共有・コミットしない
- [ ] 本番 `service_role` をローカルに置く場合、端末紛失・画面共有に注意

---

## G. 監査後チェックリスト

- [x] `ALLOW_TRIAL_DEV_OVERRIDE` を本番から削除（2026-07-16）
- [ ] `DAILY_COST_LIMIT_USD` を明示設定（任意だが推奨）
- [ ] Android 提出前に `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` を EAS production に追加
- [ ] preview で課金テストするなら iOS RC キーも preview に追加
- [ ] RevenueCat Webhook Authorization の一致確認
- [ ] 鍵ローテーション時は Supabase Secrets と RevenueCat を同時更新

---

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-07-16 | 初回監査。`ALLOW_TRIAL_DEV_OVERRIDE=1` を本番で検出 |
| 2026-07-16 | 本番から `ALLOW_TRIAL_DEV_OVERRIDE` unset。L1 運用方針を [plan-environments-and-testers.md](../plan-environments-and-testers.md) に決定 |
