# セキュリティ・ストア準拠（KOTOI）

リリース前の自己チェック用ドキュメント群です。

| 文書 | 用途 |
|---|---|
| [self-check.md](./self-check.md) | **メイン**。実装・運用・App Store / Play のチェックリストと現状判定 |
| [secrets-audit.md](./secrets-audit.md) | Supabase / EAS Secrets の監査結果 |
| [pre-release-runbook.md](./pre-release-runbook.md) | 提出直前の手順（Console 設定・Secrets・審査メモ） |

**運用方針（環境・テスター）**: [plan-environments-and-testers.md](../plan-environments-and-testers.md) — **L1 採用・本番 override unset 済み**

関連:

- 法務正本: [docs/legal/](../legal/)
- 課金: [docs/plan-billing-revenuecat.md](../plan-billing-revenuecat.md)
- 認証: [docs/plan-auth.md](../plan-auth.md)

## 使い方

1. **初回**: `self-check.md` を上から読み、各項目の **現状** 列を確認する。
2. **変更のたび**: 認証・課金・データ収集・第三者 SDK を触ったら該当セクションだけ再チェック。
3. **提出前**: `pre-release-runbook.md` を実行し、Console 上の申告とアプリ実態が一致していることを確認。
4. **環境・テスター**: `plan-environments-and-testers.md` の採用方針に従う。

## ステータス凡例

| 記号 | 意味 |
|---|---|
| ✅ | 現状コード・設定で要件を満たす |
| ⚠️ | 一部対応済み。リリース前に要対応または手動確認 |
| ❌ | 未対応。リリースブロッカーになり得る |
| 🔍 | コードだけでは判定不可。Console / 実機 / 法務で確認 |

## 初回監査サマリー（2026-07-16）

| 領域 | 概況 |
|---|---|
| 秘密情報・API 鍵 | ✅ クライアントは anon のみ。AI 鍵は Edge |
| RLS・データ分離 | ✅ 全テーブル `user_id` + RLS |
| 認証 | ✅ Apple / Google / メール。Sign in with Apple あり |
| 課金 | ✅ RevenueCat 実装済み。本番 dev override **unset 済み** |
| 環境運用 | ✅ **L1** 採用（公開後しばらく継続可） |
| アカウント削除 | ❌ アプリ内手続・公開削除 URL なし（メールのみ） |
| 法務ページ | ⚠️ LP 正本。【】は LP 側で確定 |
| App Store 申告 | 🔍 App Privacy・審査用デモ未整備 |
| Play 申告 | 🔍 Data Safety・削除 URL 未整備 |

**最優先アクション**: アカウント削除（アプリ内 + 公開 Web）、`access_grants`（テスター本格運用時）
