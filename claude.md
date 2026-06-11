# たかすスポーツクラブ 会員管理システム

## プロジェクト概要

一般社団法人たかすスポーツクラブの会員管理・請求管理を行うウェブアプリケーション。
会員側（登録・情報修正・教室選択）と事務局側（名簿管理・請求管理）の2系統の画面を持つ。

## 技術スタック

- フロントエンド: React 19 + TypeScript + Tailwind CSS v4（@tailwindcss/vite）
- ビルド: Vite
- ルーティング: react-router-dom（HashRouter）
- Excel出力: SheetJS (xlsx)
- ホスティング: GitHub Pages
- バックエンド: Google Apps Script (GAS)
- データストア: Google スプレッドシート
- コスト: 完全無料構成

## 開発環境セットアップ

```bash
npm install
npm run dev
```

GAS未接続でもlocalStorageベースのデモモードで全機能が動作する。
事務局デモアカウント: admin@takasu-sc.jp / admin123

## ディレクトリ構成

```
src/
  api/client.ts          GAS API通信レイヤー（本番用）
  components/
    AuthContext.tsx       認証コンテキスト（sessionStorage）
    Header.tsx           ヘッダー・ナビゲーション
    UI.tsx               共通UIコンポーネント（Button, Card, Table, Modal等）
  pages/
    member/
      Login.tsx          会員ログイン
      Register.tsx       新規会員登録フォーム
      MyPage.tsx         マイページ（情報確認・編集・教室変更）
    admin/
      AdminLogin.tsx     事務局ログイン
      MemberList.tsx     会員一覧・検索・Excel出力
      MemberDetail.tsx   会員詳細・編集・退会処理
      CourseRoster.tsx   教室別名簿・Excel出力
      Billing.tsx        月次請求管理（生成・ステータス管理・調整入力）
      GroupBilling.tsx   団体請求管理（手動登録）
      UnpaidBilling.tsx  引落不能管理（再請求）
  types/index.ts         TypeScript型定義
  utils/
    constants.ts         教室マスタ・ラベル定数・費用定数
    store.ts             デモ用localStorageデータストア
  App.tsx                ルーティング定義
  main.tsx               エントリーポイント
gas/
  Code.gs                GASバックエンドコード
```

## ルーティング（HashRouter）

### 会員側
- `#/` - ログイン画面
- `#/register` - 新規会員登録
- `#/mypage` - マイページ（要認証）

### 事務局側
- `#/admin` - 事務局ログイン
- `#/admin/members` - 会員一覧・検索
- `#/admin/member/:id` - 会員詳細・編集
- `#/admin/courses` - 教室別名簿
- `#/admin/billing` - 月次請求管理
- `#/admin/billing/group` - 団体請求管理
- `#/admin/billing/unpaid` - 引落不能管理

## 会員種別と費用体系

### 会員種別
| 種別 | 対象 | 備考 |
|------|------|------|
| 一般会員(general) | 成人 | 教室参加あり |
| ジュニア会員(junior) | 未成年 | 教室参加あり |
| 団体会員(group) | 団体 | 教室参加なし、年会費・保険料・大会参加費等を一括請求 |

### 年会費
- 一般: 1,000円
- ジュニア（町内）: 0円
- ジュニア（町外）: 500円
- 団体: 1,000円

### 保険料
- 一般: なし
- ジュニア: 800円/人
- 団体: 800円×人数

### 教室一覧（src/utils/constants.ts に定義済み）
17教室。支払方式は monthly / term3 / term1 / ticket の4種。
町内外で参加費が異なる教室あり。

### 期払いの定義
| 期 | 対象月 | 引き落とし日 |
|----|--------|-------------|
| 第1期 | 5〜7月 | 6月29日 |
| 第2期 | 8〜12月 | 9月28日 |
| 第3期 | 1〜3月 | 1月27日 |

- 1期払い教室は事務局が引落日を個別設定（時期未定）
- 3期払い教室の途中参加は事務局が月割調整額を手動入力

### 支払い方法
- 口座振替のみ
- 毎月払い引落日: 毎月27日
- 手続き締切: 毎月10日

### 請求ステータス
pending（未請求）→ billed（請求済）→ completed（引落完了） or failed（引落不能）
引落不能 → 翌月に自動繰越

## コーディング規約

- コンポーネントは関数コンポーネント + hooks
- 状態管理はReact Context（AuthContext）+ ローカルstate
- UIコンポーネントは src/components/UI.tsx に集約
- 日本語UIテキストはコンポーネント内に直接記述
- Excel出力はSheetJS (xlsx) を使用
- CSSはTailwind utilityクラスのみ（カスタムCSSなし）

## GAS接続の切り替え

現在はsrc/utils/store.tsのlocalStorage実装を直接呼び出している。
本番移行時は src/api/client.ts 経由でGAS Web Appに接続する。
環境変数 VITE_GAS_URL にGASデプロイURLを設定すると切り替わる。

## 今後の開発予定

1. 動作確認・UI改善
2. GASバックエンド接続
3. GitHub Pagesデプロイ
4. 既存会員データ移行（約400名）
5. 将来: チケット管理、メール通知、全銀フォーマット出力
