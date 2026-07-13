# リネーム実行計画：MONDO → KOTOI

最終更新: 2026-07-13  
ステータス: **Phase 1 完了 → Phase 2（Dashboard）待ち**  
アイデンティティ正本: [`cursor-handoff/09_rename-mondo-to-kotoi.md`](../cursor-handoff/09_rename-mondo-to-kotoi.md)

---

## 0. 前提（合意済み）

| # | 決定 |
|---|------|
| 1 | 商標リスク回避のため表示名・技術 ID を **KOTOI** にフル切替 |
| 2 | 実ユーザー・ストア評価なし → **新規 Bundle（`app.kotoi`）でストア登録し直してよい** |
| 3 | **Supabase プロジェクト（データ）は継続**。作り直し・データ移行なし |
| 4 | Git は**同一リポジトリ継続**（新レポへのコピー移行はしない）。履歴書き換えなし |
| 5 | ロゴ（5本の枝）・機能・DB スキーマは変更しない |
| 6 | 公開ブランド URL / WM は **`kotoi.art`**（`mondo.app` の単純置換で `kotoi.app` にしてはいけない） |

### 確定値（要約）

| 項目 | After |
|---|---|
| 表示名 | `KOTOI` |
| Bundle / package | `app.kotoi`（所有ドメイン `kotoi.app` の reverse-DNS） |
| scheme | `kotoi` → `kotoi://` |
| Expo slug | `kotoi` |
| WM / 公開ドメイン | `kotoi.art`（所有済み） |
| 技術ドメイン | `kotoi.app`（所有済み・Bundle の由来） |
| タグライン | 問いが増える（据え置き） |

---

## 1. フェーズ

```text
Phase 0  保険 push（現状スナップショット）
Phase 1  リポ内コード・設定の置換（P0a）
Phase 2  Dashboard / ストア新規（Auth・EAS・ASC/Play）
Phase 3  検証（リネーム DoD）
Phase 4  後続（共有 Web / UL / LP / IAP）— リネームと分離
```

リポジトリ名の変更は Phase 1〜3 の**外**（任意・後追い）。

---

## 2. Phase 0 — 保険

1. ✅ 現状をコミット（`cb8b9fc`）＋タグ `pre-rebrand`
2. ✅ 作業ブランチ `rebrand/kotoi`
3. ⏳ **リモート push は未**（`git remote` 未設定・`gh` 未導入）。GitHub レポ作成後に `main` / タグ / `rebrand/kotoi` を push
4. **やらない:** 新 GitHub レポを作ってファイルコピー

---

## 2b. Phase 1 進捗（2026-07-13）

| 項目 | 状態 |
|---|---|
| `app.json` name/slug/scheme/bundle/package | ✅ |
| WM `kotoi.art` / UA | ✅ |
| UI・オープニング・paywall・storage keys | ✅ |
| `package.json` / config.toml / README Auth 記述 | ✅ |
| mocks / 残 docs（ai-costs 等）の MONDO 表記 | ✅ |
| Supabase Redirect / Apple Client / ASC 新規 | ⏳ Phase 2（**次はここ**） |
| 実機での表示確認 | ✅（ユーザー確認） |
| Bundle = `app.kotoi`（`kotoi.app` reverse-DNS） | ✅ 確定・変更しない |

## 3. Phase 1 — リポ内（置換順）

### 3.1 置換前チェック（必須）

```bash
rg -i 'mondo' --glob '!node_modules/**' --glob '!.git/**' --glob '!package-lock.json'
rg '問答' --glob '!node_modules/**' --glob '!.git/**'
```

出力をレビューしてから手を動かす。**盲目 `sed` 禁止。**

### 3.2 専用置換を先に

| 順 | Before | After | 主な場所 |
|---|---|---|---|
| 1 | `mondo.app` | `kotoi.art` | `lib/postGraphicRec.ts`、`linkPreview.ts`、docs / `08_sharing.md` |
| 2 | `app.mondo.notes` | `app.kotoi` | `app.json`、README、`docs/plan-auth.md` |
| 3 | 残り `MONDO` / `mondo` / scheme 等 | `KOTOI` / `kotoi` | 下記インベントリ |

### 3.3 コード・設定インベントリ（P0a）

| ファイル | 変更内容 |
|---|---|
| `app.json` | `name` / `slug` / `scheme` / `ios.bundleIdentifier` / `android.package` |
| `eas.json` | 新 ASC アプリ作成後に `submit.production.ios.ascAppId` を更新（旧 ID は旧 Bundle 向け） |
| `package.json` | `"name": "kotoi"` |
| `app/(auth)/login.tsx` | ブランド表示 |
| `app/(tabs)/index.tsx` | ヘッダー title |
| `app/paywall.tsx` | ブランド・コピー |
| `lib/errors.ts` | `PAYWALL_MESSAGE` |
| `components/opening/OpeningRippleSkiaSample.tsx` | 描画テキスト `KOTOI` |
| `components/opening/OpeningExperience.tsx` | web フォールバック |
| `app/dev/opening-skia.tsx` | dev ラベル（あれば） |
| `lib/postGraphicRec.ts` | `WATERMARK_TEXT = 'kotoi.art'` |
| `supabase/functions/_shared/linkPreview.ts` | UA |
| `lib/opening/storage.ts` | `kotoi_opening_completed` |
| `lib/tutorial/storage.ts` | `kotoi_tutorial_seen_*` 等 |
| `lib/auth/lastMethod.ts` | `kotoi_last_auth_method` |
| `lib/auth/passwordOffer.ts` | `kotoi_password_offer_*` |
| `providers/ThemeProvider.tsx` | `kotoi_appearance` |
| `supabase/config.toml` | `project_id = "kotoi"`（ローカルのみ） |
| `scripts/check-node.mjs` | CLI メッセージ |
| `.cursorrules` / `cursor-handoff/.cursorrules` | プロダクト名 |
| `README.md` / 主要 docs | 表示名・Bundle・Redirect の記述 |

### 3.4 語源（§2）

- `問答` ヒットを手直し。該当なければスキップ
- UI では「言問」併記しない（語源説明文のみ可）

### 3.5 触らない（確認済み）

- Edge Function ディレクトリ名
- Storage バケット名
- DB マイグレーションのテーブル名
- アプリアイコン画像（文字なし。差し替え任意）
- Supabase の remote project ref / anon URL（env の値はそのまま）

---

## 4. Phase 2 — Dashboard / ストア（同日推奨）

コードの scheme / Bundle と**同じタイミング**で更新する。

| # | 作業 | 内容 |
|---|---|---|
| 1 | Apple Developer | App ID `app.kotoi`、Sign in with Apple |
| 2 | App Store Connect | **新規アプリ**（Bundle `app.kotoi`）。旧 MONDO listing は配信停止 or 削除 |
| 3 | Google Play | 新規アプリ（applicationId `app.kotoi`） |
| 4 | EAS | 新 Bundle で credentials。`eas.json` の `ascAppId` を新 listing に合わせる |
| 5 | Supabase Auth | Redirect URLs に `kotoi://auth/callback`（旧 `mondo://` は削除してよい） |
| 6 | Supabase Apple | Client IDs に `app.kotoi` |
| 7 | Google OAuth | 必要なら iOS/Android クライアントを新 Bundle 向けに追加 |
| 8 | メールテンプレ | 「KOTOI ログインコード」等 |
| 9 | （任意）Supabase 表示名 | プロジェクト名を KOTOI に。**ref・DB は不変** |

IAP / RevenueCat は未実装 → Product ID は **登録するときに** `kotoi.pro.*` 等（`09` / `07_trial-and-billing.md`）。

---

## 5. Phase 3 — 検証（リネーム DoD）

- [ ] 表示名がすべて `KOTOI`（login / ホーム / paywall / opening）
- [ ] `app.json`: bundle & package `app.kotoi`、scheme `kotoi`
- [ ] TestFlight or 実機で Apple / Google / メールログイン
- [ ] パスワードリセットの redirect が `kotoi://` で戻る
- [ ] 見取り図 SNS 書き出しの WM = `kotoi.art`
- [ ] 起動 → メモ投入 → 問い → 見取り図 → 投稿
- [ ] `rg -i mondo` の残りが「除外リストのみ」（`09` の Before 列、意図的アーカイブ、lockfile 等）

**リネーム完了に含めない**

- `kotoi.art/s/{token}` の Universal Link
- LP / OGP 一式（リポ外・未作成なら別タスク）
- IAP 購入フロー

---

## 6. Phase 4 — 後続（共有・マーケ）

`08_sharing.md` 着手時:

1. ホスト `kotoi.art` で共有ページ
2. `app.json` に associated domains（`applinks:kotoi.art`、必要なら `kotoi.app`）
3. AASA / `assetlinks.json`
4. `kotoiapp.com` / `kotoi.app` → `kotoi.art` リダイレクト

LP・ストアスクショはワードマーク再生成時に `KOTOI` のみ。

---

## 7. リスクと回避

| リスク | 回避 |
|---|---|
| scheme だけ変えて Redirect 忘れ → Auth 全滅 | Phase 1 と 2 を同日。ログイン E2E を DoD に |
| `mondo`→`kotoi` 一括で WM が `kotoi.app` に | **先に** `mondo.app`→`kotoi.art` |
| 語源が「KOTOI＝問答」になる | `問答` grep → 手直し |
| 旧 Bundle の EAS/ASC を触り続ける | 新 listing・新 `ascAppId`。旧は捨てる |
| AsyncStorage キー変更 | 実ユーザーなし → リセット許容。移行コード不要 |
| 新レポコピーで二重管理 | しない。同一 Git + 必要なら後で Rename |

---

## 8. 工数目安

| 領域 | 目安 |
|---|---|
| Phase 1（リポ内） | 0.5〜1 日 |
| Phase 2（Dashboard・ストア手作業） | 0.5〜1 日＋審査待ち |
| Phase 3（検証） | 半日 |
| Phase 4 | 共有 Web スコープに依存（リネーム外） |

ボトルネックは名前確定済みなので **手作業の Console 設定と審査**。コード置換自体は小さい。

---

## 9. 実装開始時の最初のコミット案（参考）

実装に入るときは、ユーザー依頼後に例えば:

1. `app.json` + Auth 関連 docs の ID / scheme
2. UI・オープニング・WM・storage keys・UA
3. handoff / mocks / 残 docs

コミットは依頼があるまで作らない。
