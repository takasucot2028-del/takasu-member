# たかすスポーツクラブ 会員管理システム

## 技術スタック

- **フロントエンド**: React + TypeScript + Tailwind CSS
- **ホスティング**: GitHub Pages
- **バックエンド**: Google Apps Script (GAS)
- **データベース**: Google スプレッドシート

## クイックスタート（デモモード）

フロントエンドはlocalStorageを使ったデモモードで動作します。GAS接続なしで全機能を試せます。

```bash
cd takasu-member
npm install
npm run dev
```

### デモ用アカウント

**事務局ログイン**
- メール: `admin@takasu-sc.jp`
- パスワード: `admin123`

**会員ログイン**
- 新規登録画面から会員を作成してください

## デプロイ手順

### 1. フロントエンド（GitHub Pages・自動デプロイ）

`.github/workflows/deploy.yml` により、`main` ブランチへの push で自動的にビルド＆GitHub Pagesへ公開されます。

セットアップ（初回のみ）:
1. GitHubリポジトリの **Settings → Pages** で Source を **GitHub Actions** に設定
2. `main` に push（または Actions タブから手動実行）

`vite.config.ts` の `base` は `'./'`（相対パス）のため、リポジトリ名に合わせた変更は不要です。ルーティングは HashRouter のため SPA の 404 リライト設定も不要です。

手動ビルドする場合:
```bash
npm run build   # dist/ に出力
```

### 2. バックエンド（GAS）

1. Google Apps Script で新規プロジェクトを作成
2. `gas/Code.gs` の内容をエディタに貼り付け
3. `SPREADSHEET_ID` を実際のスプレッドシートIDに変更
4. `setupSpreadsheet()` を1回実行（シートとマスタデータの初期化）
5. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」として公開
6. デプロイURLをコピー

### 3. フロントエンドとGASの接続

**ローカル**: プロジェクト直下に `.env` を作成（`.env.example` をコピー）:
```
VITE_GAS_URL=https://script.google.com/macros/s/★デプロイID★/exec
```

**GitHub Pages（CI）**: リポジトリの **Settings → Secrets and variables → Actions → Variables** に
`VITE_GAS_URL` を登録すると、自動デプロイ時のビルドに反映されます。

`VITE_GAS_URL` 未設定の場合は localStorage デモモードでビルドされます。データアクセスは
`src/api/data.ts` に集約されており、この環境変数の有無だけで GAS / デモを切り替えます。

## 画面構成

### 会員側
| パス | 画面 |
|------|------|
| `/` | ログイン |
| `/register` | 新規会員登録 |
| `/mypage` | マイページ |

### 事務局側
| パス | 画面 |
|------|------|
| `/admin` | 事務局ログイン |
| `/admin/members` | 会員一覧 |
| `/admin/member/:id` | 会員詳細 |
| `/admin/courses` | 教室別名簿 |
| `/admin/billing` | 月次請求管理 |
| `/admin/billing/group` | 団体請求管理 |
| `/admin/billing/unpaid` | 引落不能管理 |
