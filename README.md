# TopstepX Notion Trader

TopstepXのトレードデータをNotionデータベースに自動同期するChrome拡張機能です。

## 機能

- **自動同期**: TopstepXのTradesタブのデータをリアルタイムで監視し、新しいトレードを自動でNotionに登録
- **手動同期**: ボタン一つで既存のトレードデータを一括同期
- **アカウント情報同期**: アカウントタイプ、アカウント名、アカウントIDを自動抽出・同期 ⭐ **NEW**
- **統計表示**: 同期したトレード数の統計を表示
- **設定管理**: Notion APIトークンとデータベースIDの設定・保存
- **エラーハンドリング**: 接続エラーや同期失敗の詳細なエラー表示

## セットアップ

### 1. Notion側の準備

1. **インテグレーションの作成**
   - [Notion Integrations](https://www.notion.so/my-integrations)にアクセス
   - 「新しいインテグレーション」をクリック
   - 名前を入力（例: TopstepX Trader）
   - 「送信」をクリック
   - **Internal Integration Token**をコピーして保存

2. **データベースの準備**
   - Notionで新しいデータベースを作成
   - 以下のプロパティを追加：

   | プロパティ名 | タイプ | 説明 |
   |-------------|--------|------|
   | Trade ID | タイトル | トレードID |
   | Symbol | セレクト | トレードシンボル |
   | Direction | セレクト | Long/Short |
   | Size | 数値 | 取引数量 |
   | Entry Price | 数値 | エントリー価格 |
   | Exit Price | 数値 | エグジット価格 |
   | PnL | 数値 | 損益 |
   | Fees | 数値 | 手数料 |
   | Commissions | 数値 | 手数料 |
   | Entry Time | 日付 | エントリー日時 |
   | Exit Time | 日付 | エグジット日時 |
   | Duration | テキスト | トレード期間 |
   | Extracted At | 日付 | データ取得時刻 |
   | Result | セレクト | Win/Loss/Breakeven |
   | **AccountType** | **セレクト** | **アカウントタイプ** ⭐ |
   | **AccountName** | **セレクト** | **アカウント名** ⭐ |
   | **AccountId** | **セレクト** | **アカウントID** ⭐ |

3. **データベースの共有**
   - データベースページの右上「共有」をクリック
   - 作成したインテグレーションを招待
   - データベースURLから**Database ID**をコピー
     - URLの形式: `https://www.notion.so/xxx...xxx?v=yyy...yyy`
     - Database IDは`xxx...xxx`の部分（32文字）

### 2. 拡張機能のインストール

1. **ファイルの準備**
   ```
   topstepx-notion-trader/
   ├── manifest.json
   ├── popup.html
   ├── popup.js
   ├── content.js
   ├── background.js
   ├── styles.css
   └── README.md
   ```

2. **Chromeに読み込み**
   - Chrome拡張機能ページ（`chrome://extensions/`）を開く
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - フォルダを選択

### 3. 設定

1. **拡張機能アイコンをクリック**
2. **Notion設定を入力**
   - Notion Integration Token
   - Database ID
3. **「接続テスト」をクリック**して設定を確認
4. **「設定を保存」をクリック**
5. **自動同期を有効化**

## 使い方

### 自動同期
1. TopstepXのトレード画面を開く
2. 拡張機能で「自動同期を有効化」と「リアルタイム監視」をON
3. 新しいトレードが自動的にNotionに同期されます

### 手動同期
1. TopstepXのTradesタブを開く
2. 拡張機能ポップアップで「手動同期実行」をクリック
3. 既存のトレードデータが一括でNotionに登録されます（Tradesタブに表示されているトレードデータ）

## データマッピング

| TopstepX | Notion | 説明 |
|----------|--------|------|
| id | Trade ID | トレードID |
| symbolName | Symbol | トレードシンボル |
| direction | Direction | Long/Short |
| positionSize | Size | 取引数量 |
| entryPrice | Entry Price | エントリー価格 |
| exitPrice | Exit Price | エグジット価格 |
| pnL | PnL | 損益 |
| fees | Fees | 手数料 |
| commisions | Commissions | 手数料（スペルミス対応） |
| entryTime | Entry Time | エントリー日時（コンマ秒切り捨て） |
| exitedAt | Exit Time | エグジット日時（コンマ秒切り捨て） |
| tradeDurationDisplay | Duration | トレード期間 |
| - | Extracted At | データ取得時刻 |
| pnL | Result | Win/Loss/Breakeven（PnLから自動判定） |
| **アカウントセレクター** | **AccountType** | **アカウントタイプ** ⭐ |
| **アカウントセレクター** | **AccountName** | **アカウント名** ⭐ |
| **アカウントセレクター** | **AccountId** | **アカウントID** ⭐ |

## アカウント情報の抽出 ⭐ **NEW**

拡張機能は TopstepX のアカウントセレクターから以下の情報を自動抽出します：

### パターン1: AccountNameがある場合
```html
$50K Trading Combine | NotionTest001 (50KTC-V2-140427-18973963)
```
- **AccountType**: `$50K Trading Combine`
- **AccountName**: `NotionTest001`
- **AccountId**: `50KTC-V2-140427-18973963`

### パターン2: AccountNameがない場合
```html
$150K PRACTICE | PRACTICEMAY2614173937
```
- **AccountType**: `$150K PRACTICE`
- **AccountName**: `null`（空白）
- **AccountId**: `PRACTICEMAY2614173937`

### 注意事項
- アカウント情報は各トレードに自動的に付与されます
- AccountNameが空白の場合、Notionでは空の値として保存されます
- アカウント情報はページ読み込み時に1回抽出され、その後はキャッシュされます

## トラブルシューティング

### よくある問題

1. **「接続テスト失敗」**
   - Notion Integration Tokenが正しいか確認
   - Database IDが正しいか確認（32文字）
   - インテグレーションがデータベースに招待されているか確認

2. **「同期されない」**
   - TopstepXのTradesタブが開いているか確認
   - 拡張機能の自動同期が有効か確認
   - ブラウザコンソールでエラーメッセージを確認

3. **「重複データ」**
   - 拡張機能は同じトレードIDで重複チェックを行います
   - 手動同期を複数回実行しても重複は作成されません

4. **「アカウント情報が取得されない」** ⭐
   - TopstepXのアカウントセレクターが表示されているか確認
   - ページを再読み込みして再度同期を試行
   - ブラウザコンソールで「Extracting account information...」ログを確認

### デバッグ

1. **ブラウザコンソールを開く**（F12 → Console）
2. **フィルターに「TopstepX」を入力**
3. **エラーメッセージを確認**

アカウント情報のデバッグ用ログ：
- `Extracting account information...`
- `Found spans in account selector: X`
- `Extracted account info: {...}`

## セキュリティ

- Notion APIトークンはChromeの同期ストレージに暗号化されて保存
- トークンは外部に送信されません（Notion API以外）
- ローカルでのみデータ処理を実行

## ライセンス

MIT License

## サポート

問題が発生した場合は、以下の情報と共にお問い合わせください：
- ブラウザコンソールのエラーメッセージ
- TopstepXのページURL
- 拡張機能のバージョン
- 実行環境（OS、Chromeバージョン）

## 更新履歴

### v1.1.0 ⭐ **NEW**
- アカウント情報の自動抽出・同期機能を追加
- AccountType、AccountName、AccountIdをNotionに送信
- アカウント名が空白の場合の処理に対応

### v1.0.0
- 初期リリース
- 基本的な同期機能
- 設定管理
- 統計表示