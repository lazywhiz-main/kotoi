# KOTOI — ハンドオフ仕様 v2

> **v2（2026-07-11）**: v1（`cursor-handoff/`）に **見取り図（graphic recording）** を体験②の正式要素として追加した版。  
> 実装の詳細・合意ログは既存の `docs/design-exploration-*.md` / `docs/plan-exploration-*.md` を正とする。  
> スキーマの正は引き続き `cursor-handoff/03_data-model.sql` と `supabase/migrations/`。

## v1 → v2 の差分（要約）

| 領域 | v1 | v2 |
|------|----|----|
| 体験② | 問いの棚／探究／問いの地図／ふりかえり | ＋ **見取り図**（探究の一枚絵） |
| 語彙 | （なし） | **見取り図** を UI 語彙に追加 |
| Edge Functions | cluster / weekly-review まで | ＋ `generate-exploration-graphic-rec`（Claude＋画像） |
| コスト | Anthropic 中心 | ＋ OpenAI 画像（見取り図） |
| 非同期 | research/deepdive | ＋ 見取り図・振り分けの待ち／プッシュ／stale |

## 読む順番

1. [`01_product-spec.md`](./01_product-spec.md) — 何を作るか（見取り図の位置づけ含む）
2. [`02_architecture.md`](./02_architecture.md) — 構成・Functions・コスト
3. [`07_graphic-rec.md`](./07_graphic-rec.md) — **見取り図の企画（本編）**
4. [`05_screens.md`](./05_screens.md) — 画面仕様の差分
5. [`06_build-roadmap.md`](./06_build-roadmap.md) — マイルストーン更新
6. 詳細実装・合意: リポジトリ `docs/design-exploration-digest.md` ほか
7. 元パッケージ: `../cursor-handoff/`（プロンプト全文・SQL・モック）

## 用語（UIコピー）

ルートメモ／育つスレッド／問い（深掘り・接続・反証・行動・拡張）／追記・質問・調べる・深掘り／問いの棚／探究／**見取り図**／問いの地図／今週のふりかえり／呼び戻し／新しい問いを振り分ける／束を組み直す。

## ビジュアル参照

- 体験①: `cursor-handoff/mocks/mock_thread_v3.html`
- 体験②: `cursor-handoff/mocks/mock_accumulate_v1.html`
- 見取り図実験・品質基準: `cursor-handoff/mocks/graphic-rec/`
