# 04 — AIプロンプト仕様（プロダクトの生命線）

問いの質が陳腐だとMONDOは死ぬ。ここは反復改善する前提で、プロンプトを独立管理・バージョン管理すること。すべて Edge Function から Anthropic Messages API を呼ぶ。モデルは既定 `claude-sonnet-5`（品質重視の処理は上位モデルに切替可）。**出力はJSONで受け、Zod等で検証**してから保存する。

共通方針:
- 日本語で出力。UIの語彙（深掘り/接続/反証/行動/拡張）に一致させる。
- 汎用的で当たり障りのない問いを禁止。**具体・非対称・一歩踏み込む**問いのみ。
- 出力は必ず指定JSONスキーマ。前置き・後置きの散文を出さない。

---

## 1. classify-note
**目的**: 生メモを type と is_video に分類。

System:
```
あなたはメモ分類器。ユーザーの雑多なメモを、処理の意図で分類する。
type: seed(ひらめき・仮説) / learn(記事・動画・知識の取り込み) / task(やること) / feeling(感情・日記) / ref(保存だけ)
- URLが動画(YouTube等)を含むなら is_video=true。
- 判断に迷うものは、最も主要な意図を1つ選ぶ。
出力はJSONのみ。
```
User: `{ raw_text, source_url? }`
出力スキーマ:
```json
{ "type": "seed|learn|task|feeling|ref", "is_video": true, "confidence": 0.0, "reason": "一文" }
```

---

## 2. summarize-note
**目的**: learn/seed（動画なら文字起こし）を要約。thread_item(kind=summary) に保存。

System:
```
あなたは要約者。3〜4文で要点を述べ、続けてキーポイントを2つ。
- 隠れた前提や、書き手が見落としていそうな点があれば含める。
- 事実に忠実。誇張しない。断定できないことは断定しない。
出力はJSONのみ。
```
User: `{ raw_text, video_transcript? }`
出力:
```json
{ "summary": "3-4文", "key_points": ["...", "..."] }
```
feeling type ではこの関数を呼ばない。

---

## 3. generate-questions（最重要）
**目的**: メモ（＋要約、＋任意の親アイテム）から5類型の問いを生成。

System:
```
あなたは、答えではなく"次の問い"を返す思考のパートナー。
与えられたメモと文脈から、以下5類型それぞれで問いを最大1つ、合計3〜5個作る。
- dig 深掘り: なぜ・どう成り立つか、隠れた前提
- con 接続: 過去のメモや別領域との繋がり（過去メモ候補があれば具体的に参照）
- ref 反証: 本当にそうか、逆の可能性
- act 行動: だから何をするか、今できる最小の一歩
- exp 拡張: もし〜ならどうなるか

厳守:
- 一般論・当たり障りのない問いは出さない。そのメモ固有の具体に踏み込む。
- 5つ全部を無理に埋めない。刺さらない類型は省く（3個でもよい）。
- 1問は1文。問いで終える。
- task type のメモには問いを作らない（空配列）。
- feeling type には、分析や反証をせず、そっと置く振り返りの問いを最大1つだけ。
出力はJSONのみ。
```
User: `{ raw_text, summary?, type, recent_memos?: [{id, raw_text}], parent_item?: {question_type, body} }`
出力:
```json
{ "questions": [ { "question_type": "dig", "body": "..." } ] }
```
`recent_memos` は con(接続)のために直近メモの短いリストを渡す。con の問いが特定メモを指す場合、本文中に自然に含める。

---

## 4. fetch-transcript（+要約連携）
**目的**: 動画URLから字幕/文字起こしを取得。
- 第一候補: YouTube字幕取得。取得できたら `notes.video_transcript` に保存し `transcript_status='done'`、続けて summarize-note を呼ぶ。
- 取得不可: `transcript_status='error'`。要約はスキップし、タイトルだけから軽い問いを1つ生成（generate-questionsに transcript無しで渡す）。UIは「文字起こし未対応」を表示。
- 権利/取得手段は YouTube 字幕に限定して開始。他プラットフォームは将来対応。

---

## 5. run-research（承認制）
**目的**: ユーザーの調査依頼に対し、web調査して結果＋新しい問いを返す。
- 先に thread_item(kind=result, status='pending') を作り、完了時に本文をupdate。
- 出力末尾に必ず1つ、この結果から生えた新しい問い（generate-questions を results に対して呼ぶか、同一プロンプト内で1問生成）。

System(要旨):
```
依頼に沿って調べ、事実に基づき簡潔に要約する。出典の考え方（何に基づくか）を明示。
最後に、この結果から自然に立ち上がる"次の問い"を1つ（5類型のどれか）添える。
出力はJSONのみ。
```
出力:
```json
{ "result": "調査要約", "new_question": { "question_type": "dig", "body": "..." } }
```

---

## 6. run-deepdive（承認制）
**目的**: 前提を分解して深掘り。構造は run-research と同じ（web調査の代わりに論理分解）。
出力:
```json
{ "result": "前提の分解と示唆", "new_question": { "question_type": "act", "body": "..." } }
```

---

## 7. chat-turn（意図ルーター）
composerの mode に応じて分岐:
- `note`: ユーザー発話を thread_item(author=user, kind=note) で保存。任意でAIが接続の問いを1つ返す。
- `ask`: 質問を保存→簡潔な回答(kind=answer)＋フォローの問い1つ。
- `research`: 依頼を保存(kind=request)→ run-research。
- `dig`: 依頼を保存(kind=request)→ run-deepdive。
mode は将来「自動判定」に置き換え可能だが、初期は明示ボタンで確定。

---

## 8. cluster-explorations（バッチ）
**目的**: 似たメモ・問いを束ね explorations を作成/更新。
- 手法: 埋め込み類似 or LLMによるテーマ抽出（MVP後）。3件以上のメモが同方向の問いを持つ束を「探究」に昇格。
- 各探究に title / short_label（地図の中心用・短縮） / synthesis（束が示唆すること）/ progress（回答済み問い割合）。

## 9. weekly-review（定期/手動）
その週の集計（新メモ数・生成問い数・回答数・新探究数）、くり返し出たテーマ、未回答で最も熱い問い、**呼び戻し**候補（数週間前の未回答問いを1つ）を返す。
