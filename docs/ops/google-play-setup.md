# Google Play / Android 課金 — 作業手順書（KOTOI）

最終更新: 2026-07-21  
Package: **`app.kotoi`**  
商品 ID（iOS と同じ）: **`kotoi.pro.monthly`** / **`kotoi.pro.annual`**  
価格（公開前）: 月 **¥1,200** / 年 **¥10,000**（学割は後回し可）

アプリコードは Android キーがあれば動く想定（`lib/purchases.ts` の `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`）。  
**未着手なのは主に Play Console・Play 課金商品・RC Android・EAS env・初回 AAB。**

関連: [`plan-billing-revenuecat.md`](../plan-billing-revenuecat.md) / [`pre-release-runbook.md`](../security/pre-release-runbook.md)

---

## 全体の順番（この順が楽）

| # | ブロック | 所要目安 | 依存 |
|---|---|---|---|
| **A** | Play Console アプリ作成・基本情報 | 30–60分 | Google Play 開発者アカウント |
| **B** | 課金（定期購入）商品 | 30–60分 | A + マーチャント／支払いプロフィール |
| **C** | RevenueCat に Android アプリ追加 | 20分 | B の Product ID |
| **D** | EAS に Android キー・初回 AAB | 40分〜 | C |
| **E** | 内部テストで購入スモーク | 30分 | D + ライセンステスター |
| **F** | Data safety・削除 URL・ストア掲載 | 60分 | privacy / account-delete 公開済み ✅ |

一度に全部やらなくてよい。**今日やるなら A→B→C** までがおすすめ。

---

## A. Play Console — アプリ作成

1. [Google Play Console](https://play.google.com/console) → **アプリを作成**
2. アプリ名: **KOTOI**
3. デフォルト言語: 日本語
4. アプリ／ゲーム: **アプリ**
5. 無料／有料: **無料**（アプリ自体は無料。中の定期購入で課金）
6. 宣言（広告・AI 等）は現行実装に合わせて回答  
   - 広告: **いいえ**（現行）  
   - 子ども向け専用: **いいえ**

### A2. パッケージ名

- 初回アップロード前に **`app.kotoi`** で固定される（AAB の applicationId）
- `app.json` の `android.package` は既に `app.kotoi`

### A3. すぐ埋めてよい URL

| 項目 | URL |
|---|---|
| プライバシーポリシー | https://kotoi.art/privacy |
| アカウント削除 | https://kotoi.art/account-delete |
| サポート／問い合わせ | contact_kotoi@lazywhiz.io または https://kotoi.art |

**App content → アカウント削除** で削除 URL を登録（Play 必須）。

---

## B. Play 課金 — 定期購入（Subscriptions）

### B1. 事前

- Play Console → **設定 → お支払い設定**（マーチャントアカウント）が有効であること
- 日本向け販売・税の設定が済んでいること

### B2. 定期購入を作る

**収益化 → 商品 → 定期購入 → 作成**

**推奨**: iOS と同じく **サブスクリプショングループを1つ**（例: `kotoi_pro`）に月額・年額を入れる。  
→ 月額→年額アップグレードがストア側で扱いやすい（iOS と同様）。

| 項目 | 月額 | 年額 |
|---|---|---|
| Product ID | **`kotoi.pro.monthly`** | **`kotoi.pro.annual`** |
| 名称（ストア表示） | KOTOI Pro 月額 | KOTOI Pro 年額 |
| 請求期間 | 1ヶ月 | 1年 |
| 価格 | ¥1,200 | ¥10,000 |
| グループ | 同じグループ | 同じグループ |

学割（`kotoi.student.*`）は **後回しで可**（アプリは ID 解決できるが、Play に無いと選べないだけ）。

### B3. 有効化

- 各商品を **有効** にする（下書きのままだと RC／端末で見えない）
- 初回は「アプリが未公開」でも、内部テスト＋ライセンステスターで課金テスト可能

### B4. ライセンステスター

**設定 → ライセンステスト** に、購入テスト用 Google アカウントを追加。  
実課金なしで購読フローを試せる。

---

## C. RevenueCat — Android

1. RC → プロジェクト **KOTOI** → **Add App** → **Google Play**
2. Package name: **`app.kotoi`**
3. Play との接続（RC の案内に従う）:
   - **Google Play service credentials**（サービスアカウント JSON）を RC に登録  
   - Play Console でそのサービスアカウントに API アクセス権限を付与（RC ドキュメントの手順）
4. **Products**  
   - Import from Google Play、または手動で  
     `kotoi.pro.monthly` / `kotoi.pro.annual`
5. 既存 Entitlement **`pro`** に Android 商品も Attach（iOS と同じ `pro`）
6. Offering **`default`**（Current）の Monthly / Annual に、Android 側商品が載っていることを確認  
   - 多くの場合「同じ Product 識別子」でクロスプラットフォームになる。RC UI で iOS/Android 両方にチェックがあるか確認
7. **API keys** → Google の **Public app-specific key**（`goog_...`）を控える

Webhook は **iOS と共用でよい**（既に `revenuecat-webhook` がある）。追加設定不要。

---

## D. EAS / アプリ側

### D1. 環境変数

```bash
# production / preview 両方推奨
eas env:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY \
  --value "goog_xxxxx" \
  --environment production \
  --visibility plaintext

eas env:create --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY \
  --value "goog_xxxxx" \
  --environment preview \
  --visibility plaintext
```

ローカル検証用なら `.env` にも同じキー（`env.example` 参照）。

### D2. 初回 Android ビルド

```bash
# 内部配布用 APK（実機インストールしやすい）
eas build --platform android --profile preview

# または Play 提出用 AAB
eas build --platform android --profile production
```

初回は EAS がキーストアを作成（Expo 管理で可）。  
Play に上げるなら **production（AAB）** を **内部テスト** トラックにアップロード。

### D3. `eas submit`（任意）

`eas.json` の `submit.production` にまだ **Android 欄が無い**。初回は Console から AAB 手動アップロードでもよい。慣れたら:

```json
"android": {
  "serviceAccountKeyPath": "./path-to-play-service-account.json",
  "track": "internal"
}
```

を足す（鍵はリポにコミットしない）。

---

## E. 購入スモーク（内部テスト）

1. 内部テストにテスター（Google アカウント）を追加 → オプトインリンクでインストール
2. ライセンステスターのアカウントでログイン
3. KOTOI にログイン（Supabase）→ Paywall で月額 or 年額購入
4. 確認:

```sql
select user_id, trial_state, plan, store, current_period_end, updated_at
from subscriptions
where user_id = '（UUID）';
```

期待: `trial_state = subscribed`、`store = google`

5. 復元・再インストールでも維持されるか確認

---

## F. ストア掲載・コンプライアンス（提出前）

| 項目 | 内容 |
|---|---|
| Data safety | Email / UGC / User ID / Purchases / App interactions（Analytics）等。Tracking なし |
| アカウント削除 | https://kotoi.art/account-delete |
| プライバシー | https://kotoi.art/privacy |
| 特商法 | サイトにあり。ストア説明やサポートから辿れるとよい |
| コンテンツレーティング | アンケート完了 |
| 対象 API | EAS ビルドの targetSdk が Play 要件を満たすこと |
| スクリーンショット | 電話／7インチ等、必須枚数 |
| 短い説明／詳細説明 | 日本語。AI・個人ノートである旨 |
| 通知 | Android 13+ `POST_NOTIFICATIONS`（expo-notifications） |

Data safety の目安は `docs/legal/privacy-policy.md` 附录・[`self-check.md`](../security/self-check.md) §I。

---

## Google ログイン（Android）メモ

アプリに「Google で続ける」はある。Play 提出とは別だが、Android 実機では次が必要なことが多い:

- Google Cloud OAuth **Web** クライアント（Supabase Google provider 用・既存）
- 加えて **Android** クライアント（パッケージ `app.kotoi` + 署名 SHA-1）

EAS の署名 SHA-1:

```bash
eas credentials -p android
```

または Play App signing の SHA-1 を Cloud Console の Android OAuth クライアントに登録。  
未設定だと Android だけ Google ログインが失敗する。

---

## やらない／後回し

- 本番 `trial-dev-override` で Android テスター対応 → T2 Promotional を使う（[`t2-revenuecat-promotional.md`](./t2-revenuecat-promotional.md)）
- 学割商品（Play 側）— Pro 2本が通ってから
- closed testing 以外の本番公開 — 内部テストで課金確認後

---

## 今日の最小ゴール（チェック）

- [ ] Play Console に `KOTOI` / `app.kotoi` アプリがある
- [ ] 定期購入 `kotoi.pro.monthly` / `kotoi.pro.annual` が同じグループで有効
- [ ] RC に Android アプリ + `goog_` キー取得
- [ ] EAS production/preview に `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`
- [ ] （次セッション）preview or production AAB → 内部テストで1回購入

---

## トラブル

| 症状 | 見ること |
|---|---|
| Offering が空 | Play 商品が有効か／RC の Import・`pro` Attach |
| 購入できない | ライセンステスター／内部テストオプトイン／正しい署名のビルド |
| Webhook 来ない | iOS と同じ URL・Auth。RC の Google レシート検証権限 |
| `subscribed` にならない | `app_user_id` が UUID か（ログイン後か） |
| Google ログインだけ失敗 | SHA-1 + Android OAuth クライアント |
