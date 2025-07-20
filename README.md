# TopstepX Notion Trader

TopstepXのトレードデータをNotionデータベースに自動同期するChrome拡張機能です。

## 機能

- **自動同期**: TopstepXのTradesタブのデータをリアルタイムで監視し、新しいトレードを自動でNotionに登録
- **手動同期**: ボタン一つで既存のトレードデータを一括同期
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
3. 既存のトレードデータが一括でNotionに登録されます

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

### デバッグ

1. **ブラウザコンソールを開く**（F12 → Console）
2. **フィルターに「TopstepX」を入力**
3. **エラーメッセージを確認**

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

### v1.0.0
- 初期リリース
- 基本的な同期機能
- 設定管理
- 統計表示