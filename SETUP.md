# Calendar Free Time Finder - セットアップガイド

## 事前準備：Google Cloud Console での設定

### 1. プロジェクト作成
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 「新しいプロジェクト」を作成（例: `calendar-free-finder`）

### 2. Google Calendar API を有効化
1. 左メニュー → 「APIとサービス」→「ライブラリ」
2. 「Google Calendar API」を検索して有効化

### 3. OAuth 2.0 クライアントIDを作成
1. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuthクライアントID」
2. アプリケーションの種類: **Chrome拡張機能**
3. 拡張機能のIDを入力（下記「拡張機能IDの取得方法」参照）
4. 作成後、**クライアントID** をコピー

### 4. manifest.json にクライアントIDを設定
`manifest.json` を開き、`YOUR_CLIENT_ID.apps.googleusercontent.com` を実際のクライアントIDに置き換えてください。

```json
"oauth2": {
  "client_id": "実際のクライアントID.apps.googleusercontent.com",
  ...
}
```

## Chrome拡張機能のインストール

### 1. デベロッパーモードを有効化
1. Chrome で `chrome://extensions/` にアクセス
2. 右上の「デベロッパーモード」をONにする

### 2. 拡張機能を読み込み
1. 「パッケージ化されていない拡張機能を読み込む」をクリック
2. `calendar-free-time-finder` フォルダを選択

### 3. 拡張機能IDの取得方法
1. 読み込み後、拡張機能の詳細に表示される **ID** をコピー
2. このIDをGoogle Cloud ConsoleのOAuthクライアントIDに設定

> ⚠️ IDが変わるとOAuth認証が失敗するので、最初にダミーで読み込んでIDを取得 → GCPに設定 → manifest.jsonを更新 → 再読み込み、の順で行ってください。

## 使い方

1. ツールバーの拡張機能アイコンをクリック
2. 「Googleアカウントでログイン」でOAuth認証
3. 3名のメールアドレスを入力
4. 期間・営業時間・最短スロットを設定
5. 「空き時間を検索」をクリック
6. **リストビュー**: 日付ごとに空きスロットを一覧表示
7. **グリッドビュー**: 2週間のカレンダー形式でヒートマップ表示

## 注意事項

- 同じ Google Workspace 組織内のユーザーのカレンダーのみアクセス可能です
- 外部ユーザーのカレンダーは、そのユーザーがカレンダーを共有している場合のみ閲覧できます
- FreeBusy API は予定の「あり/なし」のみ返すため、予定の詳細は表示されません（プライバシー保護）

## ファイル構成

```
calendar-free-time-finder/
├── manifest.json      # 拡張機能設定
├── popup.html         # ポップアップUI
├── popup.css          # スタイル
├── popup.js           # メインロジック
├── background.js      # Service Worker
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── SETUP.md           # このファイル
```
