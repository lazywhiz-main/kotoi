# KOTOI

雑多に放り込むと、AIが分類し・要約し、そして「次の問い」を返す個人用ノートアプリ。

## スタック

- **フロント**: Expo (React Native) + expo-router + TypeScript
- **バックエンド**: Supabase (Postgres + Auth + Edge Functions)
- **AI**: Anthropic Claude API（Edge Functions 経由）

## セットアップ

### 1. 依存関係

```bash
npm install
```

Node.js **20.19.4 以上**が必要です（Expo 57 の要件）。

```bash
nvm use   # .nvmrc を参照
npm install
```

### 2. 環境変数

`env.example` を `.env` にコピーして値を設定:

```bash
cp env.example .env
```

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 3. Supabase

```bash
# ローカル開発（任意）
supabase start
supabase db reset

# リモートに適用
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 4. Edge Functions

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5
supabase secrets set DAILY_COST_LIMIT_USD=2.00

supabase functions deploy classify-note summarize-note generate-questions draft-thought \
  chat-turn run-research run-deepdive fetch-transcript fetch-link-preview \
  cluster-explorations weekly-review usage-summary register-push-token --use-api
```

新マイグレーション（未適用なら）:

```bash
supabase db push   # user_settings / push_tokens / appearance
```

### 5. Auth メールテンプレート

Supabase Dashboard → **Authentication** → **Email Templates** → **Magic Link**:

```html
<h2>KOTOI ログインコード</h2>
<p>アプリにこのコードを入力してください：</p>
<p><strong>{{ .Token }}</strong></p>
```

### 5b. ソーシャルログイン（Apple / Google）

Dashboard → **Authentication** → **Providers**:

1. **Apple** を有効化。Client IDs に iOS Bundle ID `app.kotoi` を追加（ネイティブ Sign in with Apple 用）
2. **Google** を有効化。Google Cloud の OAuth **Web** クライアント ID / Secret を登録
3. **URL Configuration** の Redirect URLs に `kotoi://auth/callback` を追加
4. 可能なら確認済みメールの **Automatic linking** をオン（二重アカウント防止）

詳細: [`docs/plan-auth.md`](./docs/plan-auth.md)

### 6. 起動

```bash
nvm use
npm start
```

`npm start` は `--offline` 付きです（Expo クラウド問い合わせの一時エラー回避）。
オンラインが必要なときだけ `npm run start:online` を使ってください。

## TestFlight（iOS）

Apple Developer Program 加入済みを前提とします。バンドル ID は `app.kotoi`（`app.json` で変更可）。

### 1. EAS CLI

```bash
npm install -g eas-cli   # または都度 npx eas-cli@latest
eas login
eas init                 # Expo プロジェクトとリンク（初回のみ）
```

### 2. ビルド用の環境変数（EAS に登録）

ローカルの `.env` はクラウドビルドに含まれません。EAS に登録します:

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR-PROJECT.supabase.co" --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY" --environment production --visibility plaintext
```

`EXPO_PUBLIC_*` はアプリに埋め込まれるため、anon key も **plaintext** にしてください（Supabase の anon key はクライアント公開前提）。`sensitive` のままだとビルドに載らないことがあります。既に `sensitive` で作った場合:

```bash
eas env:update --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY" --environment production --visibility plaintext
```

登録後は **必ず再ビルド**（`npm run build:ios`）。環境変数はビルド時に焼き込まれます。

### 3. iOS ビルド

```bash
npm run build:ios
# または: eas build --platform ios --profile production
```

初回は Apple 証明書・プロビジョニングを EAS が案内します（対話式）。

### 4. TestFlight へ提出

```bash
npm run submit:ios
# または: eas submit --platform ios --latest --profile production
```

App Store Connect にアプリ `KOTOI`（bundle: `app.kotoi`）が無ければ、初回 submit 時に作成されます。

### 5. TestFlight でテスト

1. [App Store Connect](https://appstoreconnect.apple.com/) → TestFlight
2. ビルドの処理完了を待つ（数分〜）
3. 自分を内部テスターに追加 → iPhone の TestFlight アプリからインストール
4. ログインは **Apple / Google / メール確認コード / パスワード** のいずれか。テスターはパスワードが便利です。
5. すでにメールで使っている人は、同じメールの Google／パスワードで入るか、入ったあと設定から Apple/Google を追加してください（Apple の「メールを隠す」に注意）

### よくあるつまずき

| 症状 | 対処 |
|---|---|
| ログインできない | Supabase Auth のメールテンプレートに `{{ .Token }}` があるか確認 |
| Supabase 未設定画面 | EAS の `EXPO_PUBLIC_*` が production に入っているか `eas env:list` で確認 |
| ビルド失敗 | `eas build:list` でログ URL を開く |

## プロジェクト構成

```
app/           # expo-router 画面
components/    # UI コンポーネント
hooks/         # データ取得フック
lib/           # supabase, types, theme, api
providers/     # AuthProvider
supabase/      # migrations, Edge Functions
cursor-handoff/ # 仕様パッケージ（参照用）
```

## 開発ロードマップ

| マイルストーン | 内容 | 状態 |
|---|---|---|
| M0 | 基盤（Expo + Supabase + 認証 + ホーム） | ✅ 完了 |
| M1 | Capture → 分類・要約・問い生成 | ✅ 実装済（デプロイ要） |
| M2 | スレッド対話（調べる・深掘り） | ✅ 実装済（デプロイ要） |
| M3 | 動画ルート（YouTube 文字起こし） | ✅ 実装済（デプロイ要） |
| M4 | 体験②（問いの棚・探究・ふりかえり） | ✅ 実装済（デプロイ要） |
| M5 | 仕上げ・配布（オープニング・ダークモード・通知・TestFlight） | ✅ 実装済 |

### M5 で入ったもの

- オープニング（Skia・初回のみ・スキップ）
- ダークモード（設定 → 外観）
- プッシュ通知（調べる/深掘り・ふりかえり完了）
- AI 利用状況（設定）
- TestFlight 向けスプラッシュ / ステータスバー調整

### TestFlight 前チェックリスト

```bash
# DB（未適用なら）
supabase db push

# Edge Functions
supabase functions deploy classify-note summarize-note generate-questions draft-thought \
  chat-turn run-research run-deepdive fetch-transcript fetch-link-preview \
  cluster-explorations weekly-review usage-summary register-push-token --use-api

# iOS ビルド（EAS 環境変数設定済みであること）
npm run build:ios
npm run submit:ios
```

TestFlight では `__DEV__` リンク（オープニング再表示など）は出ません。初回オープニングの確認は開発ビルドか、再インストールで行ってください。

詳細は `cursor-handoff/06_build-roadmap.md` を参照。

## 仕様

プロダクト仕様・AI プロンプト・画面モックは `cursor-handoff/` にあります。
