# 環境分離とテスター体験 — 運用方針（KOTOI）

最終更新: **2026-07-16**（採用決定）  
前提: **ソロ開発・チーム拡大なし（当分）**

> **正本**: 環境・テスター・公開後運用の決定事項はこの文書。Secrets 監査は [docs/security/secrets-audit.md](./security/secrets-audit.md)。リリース直前は [pre-release-runbook.md](./security/pre-release-runbook.md)。

---

## 採用方針（決定）

| 項目 | 決定 |
|---|---|
| **環境レベル（今〜公開後しばらく）** | **L1**（ローカル Supabase + 本番1プロジェクト） |
| **L2 Staging** | β拡大 or 本番 deploy が怖くなったら追加（半日〜1日） |
| **L3 CI** | 不要（チーム増なし） |
| **本番 `ALLOW_TRIAL_DEV_OVERRIDE`** | **unset 済み**（2026-07-16） |
| **開発用課金書き換え** | ローカル `supabase start` の Secrets のみ（`ALLOW_TRIAL_DEV_OVERRIDE=1`） |
| **テスター権限** | 将来 **`access_grants`**（T1）。当面は **RC Promotional**（T2）or Sandbox（T3） |
| **法務 L1〜L6** | **LP（kotoi.art）正本**。リポ Markdown は後追い同期 |

### ロードマップ

| 時期 | レベル | やること |
|---|---|---|
| **今** | L1 | 本番 override unset ✅、日常 `.env` はローカル向け |
| **公開〜数ヶ月** | **L1 継続** | Runbook 遵守。migration はローカル検証 → 本番 `db push` |
| **β 10人超 / 本番が怖い / 週次 schema** | L2 | Staging プロジェクト + EAS preview（下記チェックリスト） |
| **テスター本格運用** | L1/L2 + 実装 | `access_grants` migration + Edge 権限拡張 |

---

## L1 のまま公開後しばらく進める — 許容とリスク

**ソロなら L1 で数ヶ月〜半年は現実的。**

### 主なリスク

| リスク | 緩和策 |
|---|---|
| 本番 migration ミス | 必ずローカル `db reset` 後に `db push` |
| 本番 Edge デプロイミス | 小さく出す。ローカル `functions serve` で確認 |
| `.env` が本番を向く | 日常はローカル URL。本番は EAS production のみ |
| テスター付与の手作業ミス | 登録後連絡を案内に含める。将来 `access_grants` |

### L2 を検討し始めるサイン

- 本番 `db push` の前に毎回不安になる
- 本番だけの不具合が月1回以上
- クローズドβが 10人超
- migration を週1以上入れる

---

## L2 Staging 分離 — 完了チェックリスト（将来）

揃ったら **L2 完了**。

- [ ] Supabase Staging プロジェクト作成（例: `kotoi-staging`）
- [ ] 全 `supabase/migrations/*` を staging に `db push`
- [ ] 全 Edge Functions を staging に deploy
- [ ] Staging Secrets（`ALLOW_TRIAL_DEV_OVERRIDE=1` 可、AI 鍵、Webhook 別値）
- [ ] Staging Auth（Apple/Google、Redirect `kotoi://auth/callback`）
- [ ] EAS `preview` → Staging URL + anon key
- [ ] EAS `production` → 本番（現状維持）
- [ ] preview ビルドでログイン・メモ・AI が動く
- [ ] （任意・後回し可）RC Staging プロジェクト + Webhook → Staging DB
- [ ] 運用手順: feature → staging 試す → main → 本番 deploy

**工数目安**: 半日〜1日（RC まで分けると +半日）。  
**簡略**: Staging を課金なし機能テスト専用にし、RC は本番 Sandbox のままも可。

---

## テスター — 採用パターン

| 目的 | 方式 | 今すぐ |
|---|---|---|
| クローズドβ（課金なし） | T1 `access_grants`（未実装） | 実装後 |
| 少数に full 付与 | **T2 RC Promotional** | ✅ 手順: [`ops/t2-revenuecat-promotional.md`](./ops/t2-revenuecat-promotional.md) |
| Paywall・課金 QA | **T3 Sandbox** | ✅ |
| App Review | **T4** デモアカウント + seed | ✅ |
| 開発者シミュ | ローカル + override | ✅ |

**やらない**: 本番 `trial-dev-override` でテスター対応。

詳細フローは下記 §2 以降。

---

## 1. Git × Supabase の管理レベル（4段階）

いまの実態: **Git 1本**、Supabase **本番1プロジェクト**、EAS **development / preview / production**、ローカル `supabase start` は README 上対応。

| レベル | 名前 | Git | Supabase | アプリビルド | 向いている時期 |
|---|---|---|---|---|---|
| **L0** | 一本化 | `main` のみ | **本番1つ**だけ | TestFlight / 本番ビルドも本番 DB | 個人開発・超初期（**いまに近い**） |
| **L1** | ローカル分離 | `main` + feature ブランチ | **本番 + ローカル**（`supabase start`） | 日常開発はローカル `.env`、配布は本番 | **今すぐ移行しやすい推奨下限** |
| **L2** | Staging 分離 | `main`（本番）+ `develop` 任意 | **本番 + Staging プロジェクト** | preview → Staging、production → 本番 | **外部テスター拡大〜公開前** |
| **L3** | 運用型 | `main` + PR、タグでリリース | 本番 + Staging + ローカル | CI で migration 検証 → Staging → 本番 | チーム・継続リリース |

### L0 — 一本化（現状に近い）

```
開発者 Mac ──.env(本番URL)──► Supabase 本番
TestFlight ──────────────────► Supabase 本番
シミュ(__DEV__) ─────────────► Supabase 本番 + trial-dev-override（危険）
```

| 長所 | 短所 |
|---|---|
| 設定が最少 | 本番データを壊しやすい |
| TestFlight が本番と同じ挙動 | 開発用 override が本番に残りがち |
| | マイグレーションを試す場がない |

**判定**: 公開・外部テスターには **不十分**。`ALLOW_TRIAL_DEV_OVERRIDE` unset とセットで L1 以上へ。

---

### L1 — ローカル分離（推奨: 今すぐ）

```
日常開発 ──.env.local──► supabase start（Docker）
配布ビルド ──EAS production──► Supabase 本番のみ
```

**Git**

- `main`: リリース可能な状態
- feature ブランチ: マージ前にローカルで `db reset` + 手動テスト
- **本番 DB には手で SQL を打たない**（マイグレーション経由のみ）

**Supabase**

| 環境 | 用途 | Secrets |
|---|---|---|
| ローカル | スキーマ試行、UI、Edge デバッグ | `.env` + `supabase functions serve` |
| 本番 | TestFlight / 将来の App Store | `ALLOW_TRIAL_DEV_OVERRIDE` **なし** |

**運用ルール**

1. マイグレーションは `supabase/migrations/` にのみ追加
2. ローカル: `supabase db reset` で検証
3. 本番: `supabase db push`（または Dashboard SQL は緊急時のみ）
4. 開発者の `.env` は **本番キーを入れない**（入れるなら別ファイル `.env.production.local` を gitignore）

**コスト**: 追加 Supabase プロジェクト不要。  
**現実性**: ✅ 今日から可能。

---

### L2 — Staging 分離（推奨: 外部テスター前）

```
開発 ──► ローカル
内部 TF ──preview ビルド──► Staging Supabase
公開 TF / 本番 ──production──► 本番 Supabase
```

**Git**

- `main` → 本番デプロイ用
- `develop` または feature → Staging に先に `db push` / functions deploy
- リリース時: `main` にマージ → 本番へ同じ migration を適用

**Supabase 2プロジェクト**

| | Staging | Production |
|---|---|---|
| プロジェクト名例 | `kotoi-staging` | `kotoi-prod`（現行） |
| Auth redirect | `kotoi://` + staging 用 scheme 検討※ | `kotoi://` |
| Secrets | `ALLOW_TRIAL_DEV_OVERRIDE=1` **可** | **禁止** |
| データ | 捨ててよい・サンプル投入可 | 実ユーザー |

※ scheme を分けない場合、同一 `kotoi://auth/callback` で両方の Auth に URL を登録すれば動く（どちらの `.env` かで接続先が決まる）。

**EAS**

| profile | environment | Supabase |
|---|---|---|
| development | development | ローカル or Staging |
| preview | preview | **Staging の URL/anon** |
| production | production | **本番** |

**RevenueCat**

- Staging 用に **別 RC プロジェクト** または Sandbox のみ本番 RC を使う（後者は Webhook が本番 DB に飛ぶので **Staging では RC も分ける**のが安全）

**コスト**: Supabase Pro ×2、RC 無料枠内なら追加プロジェクト可。  
**現実性**: ✅ 1〜2日で構築可能。KOTOI の規模では **公開前の目標**として妥当。

---

### L3 — 運用型（将来）

L2 + 以下:

- PR で `supabase db lint` / migration diff
- Staging 自動 deploy（GitHub Actions → `supabase db push` + `functions deploy`）
- 本番 deploy はタグ `v1.0.1` または手動承認
- `access_grants` 付与は SQL ではなく **監査ログ付き admin 手順**（後述）

**現実性**: ソロ〜少人数では **公開後に足す**でよい。最初から L3 は過剰。

---

### 推奨ロードマップ（KOTOI）— 上記「採用方針」に統合

| 時期 | 目標レベル | アクション |
|---|---|---|
| **今** | **L1** | 本番 override unset ✅。日常 `.env` をローカル向けに |
| **公開後しばらく** | **L1 継続** | Runbook。チーム増なしなら L3 不要 |
| **β拡大時** | **L2** | Staging + EAS preview（完了チェックリスト参照） |
| **テスター本格** | + `access_grants` | Edge 権限拡張 |

---

## 2. テスター権限の方式（再掲・体験の前提）

本番では **`trial-dev-override` は使わない**。代わりに:

| 方式 | ユーザー体験上の見え方 | 管理側 |
|---|---|---|
| **A. access_grants**（推奨） | 購読と同じ機能。設定に「テスターアクセス」等の表示（任意） | SQL / 将来 admin API |
| **B. RevenueCat Promotional** | 購読と同じ。設定は「購読中」 | RC Dashboard |
| **C. Sandbox 購入** | 本番ユーザーと同一フロー（Paywall → 課金） | ASC Sandbox テスター |

以下のフローは **A（access_grants）を主**、審査・課金検証は **B/C** を併用する想定。

---

## 3. 一般ユーザー — アプリダウンロードから

### 3.1 ユーザー体験（時系列）

| # | 段階 | ユーザーが見るもの | 裏側 |
|---|---|---|---|
| U1 | App Store からインストール | アイコン・ストア説明 | — |
| U2 | 初回起動 | オープニング（未完了時） | 端末ローカル状態 |
| U3 | ログイン / 新規登録 | Apple / Google / メール | Supabase Auth |
| U4 | ホーム | 空 or チュートリアル | `subscriptions` 行が自動作成（trial `active`） |
| U5 | メモ投入 | 分類・要約・問い | Edge AI |
| U6 | 使い続ける | トライアル継続（full） | `active` → 条件で `achieved` |
| U7 | 見取り図1枚目 | 無料枠で生成可 | `free_graphic_rec_exploration_id` |
| U8 | 2枚目 or 安全弁 | Paywall | `expired` / `read_only` / `paywall_required` |
| U9 | 購読 | Paywall → Store 課金 | RevenueCat → Webhook → `subscribed` |
| U10 | 継続 | 全機能 | RC 更新イベント |
| U11 | 解約 | 期間末まで利用可 | `cancelled_at`、満了で `read_only` |

**ストア審査員**は U3 でデモアカウントを使う（U9 は Sandbox で任意）。

### 3.2 管理側タスク（一般公開時）

| # | タスク | 頻度 | 担当 |
|---|---|---|---|
| M0 | 本番 Secrets 監査（override なし） | リリース前 | 開発 |
| M1 | マイグレーション本番適用 | リリース時 | 開発 |
| M2 | Edge Functions デプロイ | リリース時 | 開発 |
| M3 | RevenueCat / Webhook 健全性 | リリース前・障害時 | 開発 |
| M4 | 法務 LP 更新 | 変更時 | 運営 |
| M5 | ユーザーサポート（メール） | 随時 | 運営 |
| M6 | 課金トラブル | 随時 | 運営 + Store |

**現実性**: ✅ いまの実装で成立。未実装はアカウント削除（別途）。

---

## 4. 案内されたテスター（購読同等 grant）— 詳細フロー

### 4.1 前提

- テスターには **事前に案内文**（メール or Notion）で URL・期待することを伝える
- 付与は **サインアップ後の `user_id`（UUID）** が分かってから（メールだけでは UUID が分からない）

### 4.2 パターン T1 — 招待テスター（access_grants・推奨）

#### ユーザー体験

| # | 段階 | 体験 | 一般ユーザーとの差 |
|---|---|---|---|
| T1-1 | 案内メール受信 | 「TestFlight / App Store からインストール → このメールで登録してください」 | 同じ |
| T1-2 | インストール・起動 | オープニング〜ログイン | 同じ |
| T1-3 | **登録完了** | 通常どおりホーム | 同じ |
| T1-4 | **（数分以内）** | 全機能が使える（Paywall に阻まれない） | **差**: 安全弁後も grant があれば full |
| T1-5 | 設定画面（任意実装） | 「テスターアクセス（〜日まで）」 | 購読中とは文言が違う |
| T1-6 | 見取り図 | 枚数制限なし（`subscribed` 同等） | 同じ |
| T1-7 | 期限切れ | grant 失効 → 通常トライアル/Paywall へ | 事前案内で期限を伝える |

**ユーザーがやること**: インストール → 登録 → 使うだけ（**課金操作不要**）。

#### 管理側タスク

| # | タスク | タイミング | 手段（案） |
|---|---|---|---|
| A1 | テスター募集・NDA 任意 | 事前 | メール |
| A2 | TestFlight 招待 or 公開リンク | 事前 | ASC |
| A3 | 案内文送付（登録メールを指定） | 招待時 | メール |
| A4 | テスターが登録 | — | — |
| A5 | **user_id 特定** | 登録後 | Supabase Dashboard → Auth → Users でメール検索 |
| A6 | **grant 付与** | A5 後 5分以内推奨 | SQL または将来 `admin-grant-access` Edge |
| A7 | 付与確認 | 任意 | テスターに「使えたか」返信 |
| A8 | 期限前リマインド | 期限 3日前 | 手動メール |
| A9 | 失効 or 延長 | 期限後 / 継続時 | `revoked_at` or `expires_at` 更新 |

**付与 SQL 例（未実装・運用イメージ）**

```sql
insert into access_grants (user_id, tier, reason, expires_at, note, granted_by)
values (
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  'pro',
  'tester',
  '2026-10-16T00:00:00+09:00',
  'クローズドβ 第1弾',
  'lazywhiz'
);
```

#### 現実性チェック

| 観点 | 判定 | メモ |
|---|---|---|
| 技術 | ⚠️ **要実装** | `access_grants` + Edge の `entitlementOf` 拡張 |
| 運用 | ✅ | テスター 5〜20人なら Dashboard で UUID 検索は現実的 |
| UX | ✅ | ユーザーは課金なしで普通に使える |
| リスク | ✅ | 本番 override より安全（期限・理由が残る） |
| ボトルネック | ⚠️ | **「登録したよ」連絡待ち** → 案内文で「登録後に返信ください」と書く |

---

### 4.3 パターン T2 — RevenueCat Promotional Entitlement

#### ユーザー体験

| # | 体験 |
|---|---|
| T2-1〜3 | T1 と同じ（インストール・登録） |
| T2-4 | 管理側が RC で付与後、**アプリ再起動 or 購入復元**で `subscribed` 反映 |
| T2-5 | 設定は **「購読中」** と表示（grant と区別つかない） |

#### 管理側

| # | タスク |
|---|---|
| B1 | RC Dashboard → Customer → app_user_id = **Supabase user UUID** |
| B2 | Grant promotional entitlement `pro`、期限設定 |
| B3 | Webhook が `subscriptions.trial_state=subscribed` を更新 |
| B4 | テスターに「一度アプリを開き直す or 購入を復元」を依頼 |

#### 現実性チェック

| 観点 | 判定 | メモ |
|---|---|---|
| 技術 | ✅ **ほぼ今すぐ** | Webhook 実装済み。`Purchases.logIn(userId)` 済み |
| 運用 | ✅ | RC UI で付与可能 |
| UX | ⚠️ | 反映に再起動/復元が必要なことがある |
| 課金テストとの混同 | ⚠️ | 「購読中」表示が本物の課金と同じ |
| Sandbox 併用 | ✅ | 課金フロー検証用テスターには T3 を使い分け |

---

### 4.4 パターン T3 — Sandbox 購入テスター（課金経路の検証）

#### ユーザー体験

一般ユーザーと **完全同一**。Paywall → Sandbox 課金 → 復元テスト。

#### 管理側

| # | タスク |
|---|---|
| C1 | ASC Sandbox テスター Apple ID 作成 |
| C2 | TestFlight ビルド配布 |
| C3 | 案内: Sandbox アカウントで Paywall から購入 |
| C4 | Webhook / `subscriptions` を確認 |

#### 現実性チェック

| 観点 | 判定 |
|---|---|
| 技術 | ✅ 今すぐ |
| 用途 | **課金・Paywall・復元の QA**（「無料で使わせたい」には向かない） |
| UX | Sandbox は本番ユーザーと同じ |

---

### 4.5 パターン T4 — ストア審査用デモアカウント

#### ユーザー体験（審査員）

| # | 体験 |
|---|---|
| R1 | 審査メモの ID/パスでログイン |
| R2 | サンプルデータ入りホーム（任意） |
| R3 | メモ追加・AI・探究が動く |
| R4 | Paywall は見れるが購入は Sandbox（審査員環境） |

#### 管理側

| # | タスク |
|---|---|
| D1 | 専用アカウント作成（`docs/sample-account-seed.md` で投入） |
| D2 | **grant `reason=review`** または RC Promo（審査中だけ full） |
| D3 | App Store Connect 審査メモに ID/パス/操作手順 |
| D4 | 審査期間中バックエンド稼働監視 |
| D5 | 審査後 grant 失効 or アカウント削除 |

#### 現実性チェック

| 観点 | 判定 |
|---|---|
| 技術 | ✅ seed ドキュメントあり |
| 運用 | ✅ 1アカウント固定で管理しやすい |
| Apple 要件 | ✅ デモアカウント必須に近い |

---

## 5. フロー比較 — どれをいつ使うか

| 目的 | 推奨パターン | ユーザー課金 | 管理の手間 |
|---|---|---|---|
| クローズドβ（5〜30人） | **T1 access_grants** | 不要 | 中（UUID 取得） |
| 課金・Paywall QA | **T3 Sandbox** | Sandbox のみ | 低 |
| インフルエンサー1週間無料 | **T1** or **T2** | 不要 | 中 |
| App Review | **T4** + 任意 T3 | 不要〜Sandbox | 低（事前準備） |
| 開発者のシミュ | **L1 ローカル** + override | — | 低 |

**やらない**: 本番 `ALLOW_TRIAL_DEV_OVERRIDE` でテスター対応（D パターン）。

---

## 6. エンドツーエンド図（案内テスター・推奨 T1）

```
【管理】                          【ユーザー】
  │                                  │
  ├─ TF 招待 / リンク送付 ──────────► App インストール
  ├─ 案内メール（登録メール指定） ──► 起動 → ログイン/新規登録
  │                                  │
  │◄──────── 「登録しました」メール ─┤（任意・推奨）
  ├─ Auth で UUID 確認
  ├─ access_grants INSERT
  │                                  ├─ アプリ利用（full）
  ├─ 「使えます」返信 ─────────────► 見取り図・深掘り等
  │                                  │
  ├─ 期限前リマインド ──────────────►
  ├─ expires_at 到来
  │                                  └─ Paywall（通常フローへ）
```

**所要時間（管理）**: 1人あたり **5〜10分**（UUID 検索 + SQL）。  
**10人バッチ**: 1時間以内は現実的。

---

## 7. 実装・運用の依存関係

| 順 | 項目 | ブロッカー |
|---|---|---|
| 1 | 本番 `ALLOW_TRIAL_DEV_OVERRIDE` unset | なし |
| 2 | 日常開発を L1（ローカル Supabase）へ | なし |
| 3 | `access_grants` migration + Edge 権限拡張 | T1 の前提 |
| 4 | 設定画面に「テスターアクセス」表示（任意） | 3 |
| 5 | Staging プロジェクト（L2） | 外部テスター増加時 |
| 6 | grant 用 admin Edge（監査ログ） | テスター 30人超 or 複数運営者 |

---

## 8. 結論

| 質問 | 回答 |
|---|---|
| Unset は必要か | **公開前は必要**。安全方針で進めるなら **早めに unset** + シミュは L1 ローカル |
| Git/DB の管理レベル | **今 L1、公開前 L2** が KOTOI に現実的 |
| テスター UX | **登録後しばらくして full**（grant）。課金 UI は触らない |
| 管理タスク | UUID 特定 → grant 付与が中心。**登録連絡**を案内に含めれば運用可能 |
| 実装不足 | `access_grants` が無いと T1 は未着手。**T2/T3/T4 は今すぐ部分可能** |

---

## 9. 法務 L1〜L6

LP（kotoi.art）正本で埋める方針で問題なし。アプリは URL リンクのみ。リポ `docs/legal/` は後追い同期でよい。
