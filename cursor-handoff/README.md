# MONDO — Cursor 実装ハンドオフパッケージ

> MONDO は「雑多に放り込むと、AIが分類し・要約し・調べ、そして"次の問い"を返す」個人用ノートアプリ。答えではなく**問いを増やす**ことに全処理を収束させるのが独自性。

このフォルダは、Cursor（AIコーディング）に渡してMONDOを実装するための仕様＋雛形一式です。**フル実装コードは含みません**。Cursorがこの仕様に沿ってコードを生成します。

## スタック
- **フロント**: Expo (React Native) / expo-router / TypeScript
- **バックエンド**: Supabase (Postgres + Auth + Edge Functions)
- **AI**: Supabase Edge Functions から Anthropic Claude API を呼ぶ（APIキーはサーバ側のみ）
- **配布**: TestFlight / Google Play（個人利用 → 継続すればリリース）

## 読む順番（Cursorへの指示）
1. `01_product-spec.md` — 何を作るか。2つの体験、分類、5類型の問い。
2. `02_architecture.md` — 全体構成、Expo/Supabaseの責務分担、Edge Functions一覧。
3. `03_data-model.sql` — Supabaseスキーマ（これをそのままmigrationとして適用）。
4. `04_ai-prompts.md` — 分類・要約・問い生成・動画・調査のプロンプト仕様（**プロダクトの生命線**）。
5. `05_screens.md` — 画面ごとの実装仕様。visualモックは `mocks/mock_*.html` が真実。
6. `06_build-roadmap.md` — マイルストーン（MVPから）。
7. `07_trial-and-billing.md` — 到達トライアルと課金（M6・将来）。
8. `08_sharing.md` — **SNS投稿導線**（M7・将来）。※ファイル名は履歴上 `sharing`。中身の用語は「投稿」。Web公開ページは一旦見送り。
9. `09_rename-mondo-to-kotoi.md` — **MONDO → KOTOI** の確定アイデンティティと置換ルール。実行手順の正本は [`docs/plan-rename-kotoi.md`](../docs/plan-rename-kotoi.md)。
10. `.cursorrules` — リポジトリ規約。生成コードはこれに従う。
11. `types.ts` — 共有TypeScript型（スキーマと一致）。
12. `env.example` — 必要な環境変数。

## ビジュアルの真実（モック）
実際の画面挙動は、同梱の対話モックが基準：
- `mocks/mock_thread_v3.html` — 体験①：ルートメモのスレッド（テキスト/動画ルート）
- `mocks/mock_accumulate_v1.html` — 体験②：問いの棚 / 探究（問いの地図） / ふりかえり
- `mocks/mock_B_memo-detail_v1.html` — メモ詳細の初期3案比較（参考）

## 最初の一歩（Cursorに投げる指示例）
> このパッケージの README → 01 → 02 → 03 を読んで、Expo + Supabase のモノレポを scaffold して。まず `03_data-model.sql` を supabase migration として作成し、`.cursorrules` と `types.ts` に従ってプロジェクト構成を作って。実装は `06_build-roadmap.md` の M0→M1 の順で進めて。

## 用語（UIコピーはこの語彙で統一）
ルートメモ／育つスレッド／問い（5類型: 深掘り・接続・反証・行動・拡張）／依頼アクション（追記・質問・調べる・深掘り）／問いの棚／探究／問いの地図／**見取り図**／今週のふりかえり／呼び戻し。  
見取り図の**保存**（端末）と**投稿**（外の SNS）は別体験。「アプリ内シェア」とは言わない（MONDO 内の他人への受け渡しに聞こえるため）。

## 版について
- **v1（このフォルダ）**: 初期ハンドオフ一式。
- **v2（見取り図を製品仕様に正式追加）**: リポジトリの [`docs/handoff-v2/`](../docs/handoff-v2/README.md) を参照。スキーマ正本・プロンプト全文・モック実体は引き続きこの `cursor-handoff/` に置く。
