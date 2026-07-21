# Supabase Auth 送信メール — 設定チェックリスト＆原稿

最終更新: 2026-07-21  
HTML 正本: [`supabase/templates/`](../../supabase/templates/)  
本番 Dashboard に貼る（ホスト済みプロジェクトは Dashboard が正。CLI の `config.toml` はローカル用）。

---

## 0. KOTOI で実際に送られるもの

| 優先 | Dashboard 名 | いつ送るか | アプリ側 |
|---|---|---|---|
| **必須** | **Magic Link** | `signInWithOtp`（確認コードログイン） | ログイン「確認コードを送る」 |
| 推奨 | Reset password | `resetPasswordForEmail` | 設定まわり／将来の復旧。主経路は OTP |
| 予備 | Confirm sign up | メール確認オン時の signUp | 現状 `enable_confirmations=false` 想定 |
| 予備 | Change email address | メール変更 | 現状ほぼ未使用 |
| 予備 | Invite user | 管理画面招待 | 運用で使うなら |
| 予備 | Reauthentication | 再認証が必要な操作 | 現状ほぼ未使用 |

**本線は Magic Link テンプレに `{{ .Token }}` を出すこと。** リンク（`ConfirmationURL`）だけだとメールクライアントのプリフェッチで無効化されやすい。

---

## 1. Dashboard 手順（本番）

1. [Authentication → Email](https://supabase.com/dashboard/project/_/auth/templates)（Email Templates）
2. 下表の **Subject** と **Body** を各テンプレに貼る（Body は対応 HTML ファイル全文）
3. Authentication → **Providers → Email** で OTP 長さがアプリと一致しているか確認（推奨 **6**。アプリ入力は最大8）
4. Authentication → **URL Configuration**
   - Site URL: `https://kotoi.art` またはアプリ用に決めた値
   - Redirect URLs に `kotoi://auth/callback`（および開発用があれば追加）
5. **Custom SMTP**（本番必須級）: Authentication → SMTP Settings  
   - 組み込みメールはレート制限が厳しい。Resend / SendGrid / Amazon SES 等
   - Sender: 例 `KOTOI <noreply@あなたのドメイン>`（SPF/DKIM 設定）
   - 問い合わせ表示と揃えるならドメインは lazywhiz / kotoi.art 側
6. SMTP 側の **クリック／オープン追跡はオフ**（リンク改変で Auth が壊れる）

---

## 2. 件名（Subject）一覧

| Template | Subject |
|---|---|
| Magic Link | `KOTOI ログインコード {{ .Token }}` |
| Confirm sign up | `KOTOI メールアドレスの確認` |
| Reset password | `KOTOI パスワード再設定コード` |
| Change email address | `KOTOI 新しいメールアドレスの確認` |
| Invite user | `KOTOI への招待` |
| Reauthentication | `KOTOI 確認コード {{ .Token }}` |

件名に `{{ .Token }}` を入れると、メール一覧だけでコードが分かる（Magic / Reauth）。不要なら件名から外してよい。

---

## 3. Body（HTML）

各ファイルをそのまま貼る:

| Template | ファイル |
|---|---|
| Magic Link | `supabase/templates/magic_link.html` |
| Confirm sign up | `supabase/templates/confirmation.html` |
| Reset password | `supabase/templates/recovery.html` |
| Change email address | `supabase/templates/email_change.html` |
| Invite user | `supabase/templates/invite.html` |
| Reauthentication | `supabase/templates/reauthentication.html` |

### 変数メモ

- `{{ .Token }}` … アプリに入力する数字コード（本線）
- `{{ .ConfirmationURL }}` … リンク確認用（予備）
- `{{ .NewEmail }}` … メール変更テンプレのみ

---

## 4. セキュリティ通知（任意・推奨）

Authentication → Email Templates の **Security notifications**（または Auth 設定の通知トグル）:

| 通知 | 推奨 |
|---|---|
| Password changed | ON |
| Email address changed | ON |
| Identity linked / unlinked | ON（Apple/Google 連携時） |
| MFA / Phone | 未使用なら OFF で可 |

文言は Dashboard 既定の英文でも動く。日本語にする場合は公式の notification テンプレを同トーンで短く。

---

## 5. ローカル（`supabase start`）用

`supabase/config.toml` にテンプレパスを接続済み。ローカルだけ効く。**本番ホストには自動では載らない**ので、本番は必ず §1 の Dashboard 貼り付け。

---

## 6. 受け入れテスト

- [ ] 実機／シミュレータで「確認コードを送る」→ 日本語メールが届く
- [ ] 本文の数字コードを入力してログインできる
- [ ] From 名が `KOTOI`（または決めた Sender）になっている
- [ ] 迷惑メールに入らない（SPF/DKIM）
- [ ] （任意）パスワード再設定メールもコードが表示される

---

## 7. トラブル

| 症状 | 見ること |
|---|---|
| メールが来ない | SMTP・レート制限・Auth Logs |
| 「Token expired / invalid」 | リンクプリフェッチ → Token 入力に統一 |
| リンクが壊れる | SMTP のトラッキング解除 |
| 英語のまま | Dashboard の該当テンプレが未保存／別プロジェクト |
