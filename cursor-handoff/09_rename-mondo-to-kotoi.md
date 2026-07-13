# 09 — リネーム指示書：MONDO → KOTOI

> **背景（一行）**: 「MONDO」は日本の商標で第9類（ソフトウェア）・第42類（SaaS）が既に他社に登録されており、そのまま公開するとストアから削除される恐れがある。名称を **KOTOI** に変更する。
> **変わるのは文字列とアプリ識別子だけ。** ロゴ（5本の枝）・機能・仕様・データモデル・Supabase プロジェクト（データ）は変えない。
>
> **実行手順の正本**はリポジトリの [`docs/plan-rename-kotoi.md`](../docs/plan-rename-kotoi.md)。本ファイルは**確定アイデンティティと置換ルール**。

---

## 0. 新しいアイデンティティ（確定値）

| 項目 | 値 |
|---|---|
| プロダクト名 | **KOTOI** |
| 表記ルール | **ローマ字 `KOTOI` で統一。漢字「言問」は併記しない**（読みが「こととい」で混同するため） |
| 由来 | 古語「言問ふ（ことどふ）」＝ものを尋ねる、語りかける |
| タグライン | 問いが増える（変更なし） |
| **主ドメイン（ブランド）** | **`kotoi.art`** — LP・共有ページ・OGP・ウォーターマーク |
| 技術ドメイン | **`kotoi.app`** — Universal Link / App Links の予備、`kotoi.art` へのリダイレクト |
| `.com` 受け皿 | **`kotoiapp.com`** — `kotoi.art` へリダイレクトのみ |
| **iOS bundle ID** | **`app.kotoi`**（`kotoi.app` の reverse-DNS。旧 `app.mondo.notes`） |
| **Android package** | **`app.kotoi`**（同上） |
| URLスキーム | **`kotoi://`**（現行は `mondo://`） |
| Expo slug | **`kotoi`**（現行は `mondo`） |
| X | `@kotoi_app` |
| Instagram | `@kotoi.app` |

**所有ドメイン（確定）:** `kotoi.app` / `kotoi.art` / `kotoiapp.com`（＋コーポレート `lazywhiz.io`）。  
Bundle はブランド顔の `.art` ではなく、技術ドメイン `.app` の逆引き **`app.kotoi`** とする（[Apple glossary](https://developer.apple.com/help/glossary/bundle-id/) の reverse-DNS）。段数が2なのはドメインが2ラベルだからで問題ない。

**⚠️ bundle ID / package name は、ストア公開後は二度と変更できない。** ここを間違えると取り返しがつかない。

**方針（2026-07 時点）**
- 実ユーザー・ストア評価履歴はまだない → **新規ストア登録（新 Bundle）でフル切替**してよい
- **Supabase プロジェクト（データ）はそのまま継続**。Redirect URL / Apple Client ID だけ新 Bundle・scheme に付け替える
- Git は**同一リポジトリ継続**（新レポへコピーしない）。履歴の書き換えもしない。リポ名変更は後追いで可

---

## 1. 置換表（機械的置換して良いもの）

| Before | After | 注意 |
|---|---|---|
| `app.mondo.notes` | `app.kotoi` | **先にこれを置換**（あとから `mondo`→`kotoi` すると壊れない） |
| `mondo://` | `kotoi://` | scheme。Auth redirect とセット |
| `mondo.app` | **`kotoi.art`** | **TLD が変わる。** `s/mondo/kotoi` だけだと誤って `kotoi.app` になる |
| `MONDO` | `KOTOI` | 表示名 |
| `Mondo` | `Kotoi` | ほぼ未使用だが念のため |
| `mondo` | `kotoi` | slug / storage key 接頭辞 / package.json 名など。**上の専用行を先に処理してから** |
| `mondo.pro.*` / `mondo.student.*` | `kotoi.pro.*` / `kotoi.student.*` | 仕様・将来 IAP。コード未登録でも docs は揃える |

**このリポにほぼ／全く無いもの（盲目置換の対象にしない）**
- `com.mondo` / `com.mondo.app` — **現行 Bundle は `app.mondo.notes`**。存在したら `app.kotoi` へ
- `MONDO_*` 環境変数 — クライアントは **`EXPO_PUBLIC_*`**。`MONDO_` 接頭辞は実質未使用
- Edge Function 名に `mondo` — **現状なし**（`classify-note` 等）。確認してスキップ可
- Storage バケット名に `mondo` — **現状なし**（例: `exploration-graphic-rec`）

---

## 2. ⚠️ 機械的に置換してはいけないもの（手で直す）

**「MONDO＝問答」という語源を説明している文章は、単純置換すると意味が壊れる。**

例（LP の「なぜ問いなのか」セクション想定）:

```
❌ 置換後: 「KOTOI＝問答。投げ込むと、返ってくる。」   ← 意味が通らない
```

**該当箇所は、以下の新テキストに差し替える。**

> **KOTOI ＝ 言問（こととい）。**
> 「言問ふ」は、ものを尋ねる、語りかける、という古語。
> 問いを投げ、問いが返る。その往復のことだ。

**表記ルールとの関係:** UI・ストア・WM では漢字「言問」を併記しない。語源説明の**文章の中だけ**「言問（こととい）」を使ってよい。

**手で直す必要がある場所（想定）**
- LP（**この Expo リポ外の可能性が高い**。リポ内に本番 LP `index.html` は無い）
- ストア説明文 / TestFlight 説明文（ASC / Play Console）
- ペイウォール・オンボーディングで語源に触れているコピー（あれば）
- README・企画書の由来説明

**まず `grep -rin "問答"` で洗い出すこと。**（2026-07 時点、アプリ本体コードにはほぼ無し。docs / 外部 LP を重点）

---

## 3. 変更対象 — 優先度順

### 🔴 P0a：アプリ／設定に今すぐ出す（法務・公開露出）

| 対象 | 現行（コード実態） | 備考 |
|---|---|---|
| **iOS bundle ID / Android package** | `app.mondo.notes` → `app.kotoi` | Expo は **`app.json`** が正本（CNG。`ios/` `android/` ディレクトリは無い） |
| **URLスキーム** | `mondo` → `kotoi` | `app.json` `scheme`。Auth の `kotoi://auth/callback` と同時 |
| アプリ表示名 | `name: "MONDO"` | `app.json` → ホーム画面ラベル |
| Expo slug | `mondo` → `kotoi` | |
| UI ブランド文字列 | login / paywall / ホーム / オープニング | |
| **見取り図 WM** | `lib/postGraphicRec.ts` の `mondo.app` → **`kotoi.art`** | SNS で最も広く出回る |
| Link preview UA | `MONDO/1.0 (+https://mondo.app; …)` | Edge Shared |
| AsyncStorage 接頭辞 | `mondo_*` → `kotoi_*` | 実ユーザーなし → **移行コード不要**で置換してよい |
| Auth / OAuth（Dashboard） | Redirect・Apple Client ID | **新 Bundle・新 scheme と同日** |
| ASC / Play **新規アプリ** | 旧 `ascAppId` は旧 Bundle 向け | 新 Bundle で listing 作り直し |
| メールテンプレ | Dashboard「MONDO ログインコード」等 | |

### 🔴 P0b：公開物だが、未着手／リポ外（着手時に必須）

| 対象 | 備考 |
|---|---|
| **Universal Links / App Links** | 現状 `associatedDomains` **未設定**。共有 Web（`08_sharing.md`）着手時に `applinks:kotoi.art`（＋必要なら `kotoi.app`）と AASA / `assetlinks.json` を**初回設定** |
| 共有ページ | 仕様上将来 `kotoi.art/s/{token}`。**初期スコープ外**（`08`）。リネーム DoD には含めない |
| LP / OGP / ストア画像のワードマーク | リポ外 or 未作成なら、作るときに `KOTOI` / `kotoi.art` |
| **ストア商品 ID**（IAP） | 仕様は `kotoi.pro.monthly` 等。**Store 未登録なら登録時にこの名前で**。RevenueCat 未導入 |
| サポート・問い合わせメール | ドメイン確定後 |
| SNS アカウント | `@kotoi_app` / `@kotoi.app` |

### 🟡 P1：非公開だが、今のうちに変えると楽

| 対象 | 備考 |
|---|---|
| `package.json` の `name` | `mondo` → `kotoi` |
| `supabase/config.toml` の `project_id` | ローカル区別用 `"mondo"` → `"kotoi"`。**リモート project ref は変えない** |
| Supabase **表示名**（Dashboard） | 任意。データ・ref はそのまま |
| Git リポジトリ名 / ローカルフォルダ | 後追いで可。コピー新レポはしない |
| docs / handoff / mocks の表示名 | 語源は §2。本ファイル `09` 自体に `mondo` が残るのは意図的（指示書） |
| コメントヘッダの `MONDO` | あれば `KOTOI` に。型名・クラス名の大掃除は**対象がほぼ無い**ので深追いしない |

### ⚪ やらなくていい

- **Git のコミット履歴・過去のブランチ名**の書き換え
- 過去の TestFlight ビルド（**破棄して新 Bundle で作り直す**）
- DB テーブル名・カラム名（`notes` 等は汎用。変更不要）
- Edge Function の**ディレクトリ名**（`mondo` を含まない）
- Storage バケット名（`mondo` を含まない）
- **`MONDO_*` env の一掃**（実在しない）
- **ロゴ（5本の枝）の再制作**
- Supabase プロジェクトの作り直し／データ移行
- 新 Git レポへのファイルコピー移行

---

## 4. 実行手順（要約）

詳細・ファイル一覧・検証は **`docs/plan-rename-kotoi.md`**。

1. 置換前に `mondo` / `問答` を grep してレビュー（盲目 `sed` 禁止）
2. **先に** `mondo.app` → `kotoi.art`、`app.mondo.notes` → `app.kotoi`
3. `app.json` / UI / WM / storage keys / UA / docs
4. 語源テキストを手直し（§2）
5. Dashboard: Redirect / Apple・Google / メール / ASC・Play 新規 / EAS
6. ビルド・Auth・WM を検証（§5 と plan の DoD）

---

## 5. 完了条件（Definition of Done）

### リネーム完了（今のマイルストーン）

- [ ] アプリ表示・オープニング・ペイウォール・ホームに `MONDO` / `mondo` が残っていない
- [ ] `app.json` の bundle / package = `app.kotoi`、scheme = `kotoi`
- [ ] `kotoi://` で Auth callback が通る（Supabase Redirect 設定済み）
- [ ] 見取り図投稿書き出しの WM が **`kotoi.art`**
- [ ] Link preview UA が KOTOI / `kotoi.art`（または意図した新表記）
- [ ] AsyncStorage キーが `kotoi_*`
- [ ] `問答` の誤置換が無い（語源は言問テキスト、または該当なし）
- [ ] iOS / Android が `app.kotoi` でビルドできる
- [ ] 起動 → メモ → 問い → 見取り図 → 投稿、まで通る

### 除外してよい `mondo` ヒット

- 本指示書 `09_rename-mondo-to-kotoi.md`（履歴・Before 列）
- `.git` / `node_modules` / ビルド生成物
- 「リネーム前の記録」として残すアーカイブ注記

### 後続マイルストーン（共有 Web / LP 着手時）

- [ ] `kotoi.art/s/{token}` と Universal Link / App Links
- [ ] LP・OGP・ストア画像に `MONDO` が無い
- [ ] IAP を載せるなら Product ID が `kotoi.*`

---

## 6. やってはいけないこと

- **盲目的な `sed -i 's/mondo/kotoi/g'`** — `mondo.app` → 誤って `kotoi.app`（正: **`kotoi.art`**）。語源説明も壊れる
- **コミット履歴の書き換え**
- **bundle ID を後回しにする**
- **ロゴを作り直す**（5本の枝は5類型。名前非依存）
- **新レポへコピーして二重管理する**（保険の push は同一リモートで十分）
- **Supabase を作り直す**（不要。Redirect と OAuth Client だけ更新）

---

## 7. 補足：なぜドメインが分かれているのか

| | 役割 |
|---|---|
| **`kotoi.art`** | **ブランドの顔。** 人が見るのは全部こっち。LP・共有ページ・ウォーターマーク。手描きの1枚絵が主役なので署名は `.art` |
| **`kotoi.app`** | **技術の骨格。** Universal Link の予備、`.art` へのリダイレクト。ユーザーはほぼ見ない |
| `kotoiapp.com` | `.com` の受け皿。リダイレクトのみ |

**公開 URL・WM は原則すべて `kotoi.art` に寄せる。**
