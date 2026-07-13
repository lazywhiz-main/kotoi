# 05 — 画面仕様

ビジュアルの真実は同梱モック。実装時は必ず参照:
- `mocks/mock_thread_v3.html`（体験①スレッド／テキスト・動画ルート）
- `mocks/mock_accumulate_v1.html`（体験②：問いの棚・探究・問いの地図・ふりかえり）
- `mocks/mock_B_memo-detail_v1.html`（初期3案比較・参考）

トーン: 温かい・静か・余白多め。フラット（グラデ/影は最小）。UIコピーはREADMEの語彙で統一。

---

## Capture（放り込む） — `app/capture.tsx`（モーダル）
- テキスト入力＋URL貼り付け（動画URL含む）。1タップで保存。
- 保存時: notes に insert → `classify-note` を発火（裏で type/is_video判定）→ learn/seed なら `summarize-note`＋`generate-questions`、video なら `fetch-transcript`→要約→問い。
- ユーザーは待たない。保存後すぐスレッド画面へ遷移、AI要素は `status=pending` から順次埋まる。
- 摩擦最小が最優先。

## メモスレッド（体験①） — `app/note/[id].tsx`
- 上部: ルートメモ（type/videoチップ、生テキスト、動画ならサムネ＋タイトル＋「文字起こし取得済み」）。
- 本体: 左レール付きの1本のスレッド。thread_items を created_at 昇順で表示。
  - kind=summary → 要約カード（AI）
  - kind=question → 問いカード（AI、類型タグ色）。各カードに「調べる／深掘り」ボタン（枝を伸ばす）。
  - author=user → 追記/依頼カード（区別できる配色）
  - kind=result（agent） → 結果カード。status=pending は「調査中…」。完了で本文＋末尾に新しい問い。
- 下部composer: 意図ボタン（追記 / 質問 / 調べる / 深掘り）＋入力＋送信。選択modeで `chat-turn` を呼ぶ。
- research/dig は承認制: 送信時にコスト目安を出し、GOでEdge Function起動→pending item→完了通知。
- 挙動は mock_thread_v3.html と一致させる。

## 問いの棚 — `app/(tabs)/shelf.tsx`
- `open_questions` ビューから未回答の問いを新しい順に一覧。
- 上部に類型フィルタ（すべて/深掘り/接続/反証/行動/拡張）。
- 各行: 類型タグ＋問い＋元メモ名。押すと `note/[id]` の該当アイテムへ。

## 探究一覧 — `app/(tabs)/explorations.tsx`
- explorations を updated_at 降順で。カード: タイトル／メモ数・問い数・回答数／synthesis（この束が示唆すること）／進行度バー。
- 「この探究を開く」→ `exploration/[id]`。

## 探究詳細＝問いの地図 — `app/exploration/[id].tsx`
- 中心=探究(short_label)、まわり=メモ(exploration_notes)、外側=類型色の問い(exploration_questions)のネットワーク図。
- react-native-svg で放射状レイアウト（中心→メモ→問いドット）。問いドットは番号、下に番号対応の問いリスト。
- リストの問いを押すと元スレッドへ。
- 挙動は mock_accumulate_v1.html の「探究を開く」と一致。

## ふりかえり — `app/(tabs)/review.tsx`
- `weekly-review` の結果を表示: 統計カード4つ（メモ/問い/回答/探究）、くり返したテーマ、未回答で熱い問い、呼び戻しカード、問いの地図への導線。

## ホーム — `app/(tabs)/index.tsx`
- 最近のメモ一覧（notes 新しい順、type/videoチップ、未回答問い数バッジ）。＋ボタンで Capture。

## 横断ナビ
- タブ: ホーム / 問いの棚 / 探究 / ふりかえり。
- Captureは＋ボタン（モーダル）でどこからでも。

## 空状態・エラー
- 分類/要約/問いが pending の間はスケルトン。
- 文字起こし失敗は「文字起こし未対応。リンクとタイトルから軽い問いだけ出しました」。
- feeling メモでは問い生成を控える旨をさりげなく。
