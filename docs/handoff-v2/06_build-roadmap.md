# 06 — ビルドロードマップ（v2）

> ベース: `cursor-handoff/06_build-roadmap.md`  
> **v2**: M4 以降に見取り図・振り分け消化・非同期を明示。

## M0〜M3
v1 どおり（基盤 → Capture 縦串 → 対話 → 動画）。

## M4 — 体験②（溜まった後）
- 問いの棚
- 探究クラスタ → 一覧 → **問いの地図**
- ふりかえり＋呼び戻し
- 完了条件: mock_accumulate 相当の横断体験

## M4.5 / M5a — 見取り図（v2）
- `generate-exploration-graphic-rec`（非同期・pending・プッシュ）
- 詳細・一覧の生成／待ち／done／error
- Storage 保存・端末保存
- 完了条件: 探究に一枚絵を手動で付けられる

## M5b — 振り分けの消化（v2）
- 増分「新しい問いを振り分ける」＋ ID 維持 upsert
- 変更探究の見取り図 `stale`（自動再生成しない）
- 「束を組み直す」は確認付きフル再編
- 完了条件: `docs/design-exploration-digest.md` の合意どおり

## M5c — 仕上げ
- 通知・空状態・feeling・TestFlight
- チュートリアル層（T0〜T5・R0）
- 認証手段の拡張（任意・`docs/plan-auth.md`）

## 将来（未着手メモ）
- **M6** 到達トライアルと課金（**1枚目は渡し、2枚目生成で案内**）… `cursor-handoff/07_trial-and-billing.md`
- **M7** SNS投稿導線（IG 等）。**保存とは別** … `cursor-handoff/08_sharing.md`
- Web 公開ページは 08 §5 どおり **一旦見送り／将来候補**

## 検証の観点（追加）
- 見取り図は「また開きたくなる顔」か、装飾で終わっていないか
- stale の促しはうるさいか、足りないか
- 地図と見取り図の役割がユーザーに混ざっていないか
