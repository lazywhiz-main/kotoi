# 06 — ビルドロードマップ

MVP（体験①）を最短で自分の手元（TestFlight/Play）に載せ、問いの質を実データで検証することが目的。②は後。

## M0 — 基盤
- Expo + expo-router + TypeScript を scaffold。`.cursorrules` / `types.ts` を配置。
- Supabase プロジェクト作成、`03_data-model.sql` を migration 適用。
- Supabase Auth（emailマジックリンク）。`lib/supabase.ts`。
- `env.example` を元に環境変数設定。Edge Functions のデプロイ土台。
- 完了条件: ログインして自分の notes を空一覧で表示できる。

## M1 — Capture → 読むだけのスレッド（自動処理）
- Capture（テキスト＋URL）→ notes insert。
- Edge Functions: `classify-note` / `summarize-note` / `generate-questions`。
- note/[id] スレッド表示（要約＋問い、pending→反映）。
- 完了条件: メモを放り込むと、分類され・要約され・5類型の問いがぶら下がる。**ここでMVPの価値検証ができる**。

## M2 — スレッドが育つ（対話・依頼）
- composer（追記/質問/調べる/深掘り）＋ `chat-turn`。
- `run-research` / `run-deepdive`（承認制、pending→結果→新しい問い）。
- `usage_ledger` で日次コスト上限、承認フロー。
- 完了条件: どの問いからも枝を伸ばせ、結果からまた問いが生える。

## M3 — 動画ルート
- `fetch-transcript`（YouTube字幕）→要約→問い。失敗時フォールバック。
- 完了条件: 動画リンクを放り込むと文字起こし要約＋動画に沿った問いが出る。

## M4 — 体験②（溜まった後）
- 問いの棚（open_questions ＋類型フィルタ）。
- `cluster-explorations` → 探究一覧 → 問いの地図（react-native-svg）。
- `weekly-review` → ふりかえり＋呼び戻し。
- 完了条件: mock_accumulate_v1.html と同等の横断体験。

## M5 — 仕上げ
- 通知（Edge Function完了）、空状態/エラー、feeling配慮の微調整。
- TestFlight / 内部テスト配布。プロンプトを実データで反復改善。

## 検証の観点（作りながら常に問う）
- 生成される問いは「また考えたくなる」か、うるさいか。→ 多すぎるなら初期は1〜2問＋「もっと出す」。
- 意図ボタン方式は自然か、自動判定にすべきか。
- 分類の外れ率（classification_feedback を見る）。
