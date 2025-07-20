// TopstepX Notion Trader - Content Script
class TopstepXNotionTrader {
  constructor() {
    this.settings = {};
    this.observer = null;
    this.processedTrades = new Set();
    this.lastTradeCheck = 0;
    this.isEnabled = false;
    this.init();
  }

  async init() {
    console.log('TopstepX Notion Trader: Initializing...');
    
    // 設定を読み込み
    await this.loadSettings();
    
    // メッセージリスナーを設定
    this.setupMessageListener();
    
    // DOM監視を開始
    if (this.settings.realTimeMonitoring) {
      this.startObserving();
    }
    
    // 既存のトレードデータをチェック
    setTimeout(() => this.checkTrades(), 2000);
  }

  async loadSettings() {
    try {
      this.settings = await chrome.storage.sync.get([
        'notionToken',
        'databaseId',
        'autoSync',
        'realTimeMonitoring'
      ]);
      
      console.log('Settings loaded:', {
        hasNotionToken: !!this.settings.notionToken,
        tokenLength: this.settings.notionToken ? this.settings.notionToken.length : 0,
        hasDatabaseId: !!this.settings.databaseId,
        databaseIdLength: this.settings.databaseId ? this.settings.databaseId.length : 0,
        autoSync: this.settings.autoSync,
        realTimeMonitoring: this.settings.realTimeMonitoring
      });
      
      this.isEnabled = this.settings.autoSync && 
                      this.settings.notionToken && 
                      this.settings.databaseId;
      
      console.log('Settings validation result:', {
        isEnabled: this.isEnabled,
        autoSync: this.settings.autoSync,
        hasToken: !!this.settings.notionToken,
        hasDatabase: !!this.settings.databaseId
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'settingsUpdated':
          this.handleSettingsUpdate(message.settings);
          sendResponse({ success: true });
          break;
          
        case 'manualSync':
          this.handleManualSync().then(sendResponse);
          return true; // 非同期レスポンス
          
        default:
          break;
      }
    });
  }

  handleSettingsUpdate(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.isEnabled = this.settings.autoSync && 
                    this.settings.notionToken && 
                    this.settings.databaseId;
    
    if (this.settings.realTimeMonitoring && !this.observer) {
      this.startObserving();
    } else if (!this.settings.realTimeMonitoring && this.observer) {
      this.stopObserving();
    }
    
    console.log('Settings updated, isEnabled:', this.isEnabled);
  }

  async handleManualSync() {
    try {
      console.log('Manual sync started with duplicate checking');
      console.log('Current settings:', this.settings);
      console.log('isEnabled:', this.isEnabled);
      
      if (!this.isEnabled) {
        const missingSettings = [];
        if (!this.settings.notionToken) missingSettings.push('Notion Token');
        if (!this.settings.databaseId) missingSettings.push('Database ID');
        if (!this.settings.autoSync) missingSettings.push('Auto Sync (disabled)');
        
        const errorMessage = `Notion設定が不完全です。不足項目: ${missingSettings.join(', ')}`;
        console.error('Settings validation failed:', errorMessage);
        
        return { 
          success: false, 
          error: errorMessage 
        };
      }

      const trades = this.extractTradesFromPage();
      console.log('Extracted trades:', trades);
      
      let successCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const trade of trades) {
        console.log(`Processing trade ${successCount + duplicateCount + errorCount + 1}/${trades.length}:`, trade.symbolName);
        
        const result = await this.sendToNotion(trade);
        if (result === true) {
          successCount++;
          console.log(`Trade ${trade.id} sent successfully`);
        } else if (result && result.reason === 'duplicate') {
          duplicateCount++;
          console.log(`Trade ${trade.id} skipped (duplicate)`);
        } else {
          errorCount++;
          console.error(`Failed to send trade ${trade.id}`);
        }
      }

      // 統計を更新
      await this.updateStats(successCount);

      const message = successCount > 0 || duplicateCount > 0 ? 
        `成功: ${successCount}件, 重複スキップ: ${duplicateCount}件${errorCount > 0 ? `, エラー: ${errorCount}件` : ''}` :
        '新しいトレードはありません';

      return { 
        success: true, 
        count: successCount,
        duplicateCount: duplicateCount,
        errorCount: errorCount,
        message: message
      };
    } catch (error) {
      console.error('Manual sync error:', error);
      return { 
        success: false, 
        error: `同期エラー: ${error.message}` 
      };
    }
  }

  startObserving() {
    if (this.observer) return;

    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    };

    this.observer = new MutationObserver((mutations) => {
      // 頻繁な更新を避けるためにデバウンス
      clearTimeout(this.checkTimeout);
      this.checkTimeout = setTimeout(() => {
        this.checkTrades();
      }, 1000);
    });

    // Tradesタブを監視
    const tradesTab = this.findTradesTab();
    if (tradesTab) {
      this.observer.observe(tradesTab, config);
      console.log('Observer started for trades tab');
    } else {
      // タブが見つからない場合はbody全体を監視
      this.observer.observe(document.body, config);
      console.log('Observer started for document body');
    }
  }

  stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      console.log('Observer stopped');
    }
  }

  findTradesTab() {
    console.log('Looking for Trades tab...');
    
    // 方法1: タブボタンから現在アクティブなTradesタブを探す
    const tabButtons = document.querySelectorAll('[role="tab"]');
    let activeTradesTabId = null;
    
    for (const tab of tabButtons) {
      const tabText = tab.textContent?.trim();
      console.log('Found tab:', tabText, 'aria-selected:', tab.getAttribute('aria-selected'));
      
      if ((tabText === 'Trades' || tabText.includes('Trade')) && 
          tab.getAttribute('aria-selected') === 'true') {
        // aria-controlsからタブパネルIDを取得
        activeTradesTabId = tab.getAttribute('aria-controls');
        console.log('Found active Trades tab with controls:', activeTradesTabId);
        break;
      }
    }

    // 方法2: アクティブなTradesタブパネルを直接探す
    if (activeTradesTabId) {
      const tradesPanel = document.getElementById(activeTradesTabId);
      if (tradesPanel) {
        console.log('Found trades panel by ID:', activeTradesTabId);
        return tradesPanel;
      }
    }

    // 方法3: タブパネル内のヘッダーからTradesタブを特定
    const panels = document.querySelectorAll('[role="tabpanel"]');
    console.log('Checking', panels.length, 'tab panels...');
    
    for (const panel of panels) {
      // パネルが表示されているかチェック
      const style = window.getComputedStyle(panel);
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue;
      }

      const headers = panel.querySelectorAll('.MuiDataGrid-columnHeaderTitle');
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim());
      
      console.log('Panel headers:', headerTexts);
      
      // Tradesタブの特徴的なヘッダーを確認
      // Ordersタブにはない、Tradesタブ特有のカラムを探す
      const tradesSpecificHeaders = [
        'Exit Time', 'Exit Price', 'PnL', 'P&L', 'Profit/Loss',
        'Duration', 'Trade Duration', 'Exit', 'Closed'
      ];
      
      const ordersSpecificHeaders = [
        'Order Type', 'Status', 'Time in Force', 'TIF', 'Pending', 'Filled'
      ];
      
      const hasTradesHeaders = tradesSpecificHeaders.some(header => 
        headerTexts.some(text => text && text.toLowerCase().includes(header.toLowerCase()))
      );
      
      const hasOrdersHeaders = ordersSpecificHeaders.some(header => 
        headerTexts.some(text => text && text.toLowerCase().includes(header.toLowerCase()))
      );
      
      // 基本的なトレード関連ヘッダーもチェック
      const hasBasicTradeHeaders = ['Symbol', 'Entry', 'Size', 'Qty'].some(header =>
        headerTexts.some(text => text && text.toLowerCase().includes(header.toLowerCase()))
      );
      
      console.log('Panel analysis:', {
        hasTradesHeaders,
        hasOrdersHeaders,
        hasBasicTradeHeaders,
        isVisible: style.display !== 'none'
      });
      
      // Tradesタブの特徴があり、Ordersタブの特徴がない場合
      if (hasBasicTradeHeaders && hasTradesHeaders && !hasOrdersHeaders) {
        console.log('Found Trades tab panel');
        return panel;
      }
    }
    
    // 方法4: データ行の内容からTradesタブを判定
    for (const panel of panels) {
      const style = window.getComputedStyle(panel);
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue;
      }

      const dataRows = panel.querySelectorAll('.MuiDataGrid-virtualScrollerRenderZone .MuiDataGrid-row[data-id]');
      
      if (dataRows.length > 0) {
        // 最初の行のデータを確認
        const firstRow = dataRows[0];
        const cells = firstRow.querySelectorAll('.MuiDataGrid-cell');
        
        let hasExitData = false;
        let hasPnLData = false;
        
        for (const cell of cells) {
          const fieldName = cell.getAttribute('data-field');
          const cellText = cell.textContent?.trim();
          
          if (fieldName && (fieldName.includes('exit') || fieldName.includes('Exit'))) {
            hasExitData = !!cellText && cellText !== '0' && cellText !== '-';
          }
          
          if (fieldName && (fieldName.includes('pnl') || fieldName.includes('PnL') || fieldName.includes('P&L'))) {
            hasPnLData = !!cellText && cellText !== '0' && cellText !== '-';
          }
        }
        
        // 終了したトレードのデータがあればTradesタブ
        if (hasExitData || hasPnLData) {
          console.log('Found Trades tab by data content');
          return panel;
        }
      }
    }
    
    console.log('Trades tab not found');
    return null;
  }

  async checkTrades() {
    if (!this.isEnabled) return;

    try {
      const trades = this.extractTradesFromPage();
      const newTrades = trades.filter(trade => !this.processedTrades.has(trade.id));
      
      if (newTrades.length > 0) {
        console.log(`Found ${newTrades.length} new trades`);
        
        let successCount = 0;
        for (const trade of newTrades) {
          const result = await this.sendToNotion(trade);
          if (result === true) {
            this.processedTrades.add(trade.id);
            successCount++;
          }
        }
        
        // 統計を更新
        if (successCount > 0) {
          await this.updateStats(successCount);
        }
      }
    } catch (error) {
      console.error('Error checking trades:', error);
    }
  }

  extractTradesFromPage() {
    const trades = [];
    const tradesTab = this.findTradesTab();
    
    if (!tradesTab) {
      console.log('Trades tab not found');
      return trades;
    }

    console.log('Extracting trades from Trades tab');
    const dataRows = tradesTab.querySelectorAll('.MuiDataGrid-virtualScrollerRenderZone .MuiDataGrid-row[data-id]');
    console.log(`Found ${dataRows.length} data rows in Trades tab`);
    
    dataRows.forEach((row, index) => {
      try {
        const trade = this.extractTradeFromRow(row);
        if (trade && trade.symbol) {
          trades.push(trade);
          console.log(`Extracted trade ${index + 1}:`, trade.symbol, trade.direction, trade.pnl);
        }
      } catch (error) {
        console.error('Error extracting trade from row:', error);
      }
    });

    console.log(`Extracted ${trades.length} trades from Trades tab`);
    return trades;
  }

  extractTradeFromRow(row) {
    const getCellValue = (fieldName) => {
      const cell = row.querySelector(`[data-field="${fieldName}"]`);
      return cell ? cell.textContent.trim() : '';
    };

    // すべてのセルのdata-fieldを確認してデバッグ
    const allCells = row.querySelectorAll('.MuiDataGrid-cell[data-field]');
    const fieldNames = Array.from(allCells).map(cell => cell.getAttribute('data-field'));
    console.log('Available fields in row:', fieldNames);

    // HTMLで確認したdata-field名に基づいて値を抽出
    const tradeId = getCellValue('id');
    const symbolName = getCellValue('symbolName').replace(/\//g, '') || getCellValue('symbol').replace(/\//g, '');
    const positionSize = getCellValue('positionSize') || getCellValue('size') || getCellValue('qty');
    const entryTime = getCellValue('entryTime') || getCellValue('entryTimestamp');
    const exitedAt = getCellValue('exitedAt') || getCellValue('exitTime') || getCellValue('exitTimestamp');
    const tradeDurationDisplay = getCellValue('tradeDurationDisplay') || getCellValue('duration');
    const entryPrice = getCellValue('entryPrice');
    const exitPrice = getCellValue('exitPrice');
    const pnl = getCellValue('pnL') || getCellValue('pnl') || getCellValue('profitLoss');
    const commissions = getCellValue('commisions') || getCellValue('commissions'); // HTMLでは"commisions"とスペルミス
    const fees = getCellValue('fees');
    const direction = getCellValue('direction') || getCellValue('side');

    // セルの値をデバッグ出力
    console.log('Extracted cell values:', {
      tradeId, symbolName, positionSize, entryTime, exitedAt, 
      entryPrice, exitPrice, pnl, direction
    });

    // トレードとして有効かチェック（終了済みのトレードのみ）
    if (!symbolName || !entryPrice || (!exitPrice && !exitedAt)) {
      console.log('Skipping incomplete trade data');
      return null;
    }

    // ユニークIDを生成（TopstepXのIDがある場合はそれを使用）
    const id = tradeId || this.generateTradeId(symbolName, entryTime, entryPrice, positionSize, direction);

    return {
      id,
      tradeId: tradeId,
      symbolName: symbolName,
      symbol: symbolName, // symbolNameをsymbolとしても保持
      positionSize: this.parseNumber(positionSize),
      size: this.parseNumber(positionSize), // positionSizeをsizeとしても保持
      entryTime: this.parseDateTime(entryTime),
      exitedAt: this.parseDateTime(exitedAt),
      tradeDurationDisplay: tradeDurationDisplay,
      entryPrice: this.parseNumber(entryPrice),
      exitPrice: this.parseNumber(exitPrice),
      pnl: this.parseNumber(pnl),
      commissions: this.parseNumber(commissions),
      fees: this.parseNumber(fees),
      direction: direction,
      type: direction, // directionをtypeとしても保持
      extractedAt: new Date().toISOString()
    };
  }

  // === 改良されたトレードID生成 ===
  generateTradeId(symbolName, entryTime, entryPrice, positionSize, direction) {
    // 複数の要素を組み合わせて一意性を向上
    const elements = [
      symbolName || '',
      entryPrice || '',
      positionSize || '',
      direction || '',
      entryTime ? new Date(entryTime).getTime() : Date.now()
    ];
    
    const dataString = elements.join('-');
    return this.simpleHash(dataString);
  }

  // === シンプルなハッシュ関数 ===
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    return Math.abs(hash).toString(36);
  }

  parseNumber(str) {
    if (!str) return null;
    const cleaned = str.replace(/[,$%]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  parseDateTime(str) {
    if (!str) return null;
    
    try {
      // TopstepXの日時フォーマット: "2025-07-19 03:37:12.621" (コンマ秒あり)
      const dateTimeMatch = str.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
      if (dateTimeMatch) {
        const [, year, month, day, hours, minutes, seconds] = dateTimeMatch;
        
        // コンマ秒は切り捨て、ISO形式に変換
        const isoString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
        const date = new Date(isoString);
        
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      
      // 他の形式も試行
      const date = new Date(str);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      // パースできない場合は元の文字列を返す
      return str;
    } catch (error) {
      console.error('Error parsing datetime:', str, error);
      return str;
    }
  }

  // === Notion重複チェック付きの送信メソッド ===
  async sendToNotion(trade) {
    try {
      console.log('Sending to Notion - Trade data:', trade);
      console.log('Sending to Notion - Token available:', !!this.settings.notionToken);
      console.log('Sending to Notion - Database ID available:', !!this.settings.databaseId);
      
      // === Notion側重複チェック ===
      console.log('Checking for duplicates in Notion...');
      const duplicateCheck = await this.checkNotionDuplicate(trade);
      
      if (duplicateCheck.isDuplicate) {
        console.log('Duplicate trade found in Notion, skipping:', trade.id);
        // 重複は成功として扱う（すでにNotionに存在するため）
        this.processedTrades.add(trade.id);
        return { success: true, reason: 'duplicate' };
      }

      const response = await chrome.runtime.sendMessage({
        action: 'sendToNotion',
        trade: trade,
        token: this.settings.notionToken,
        databaseId: this.settings.databaseId
      });

      console.log('Notion API response:', response);

      if (response && response.success) {
        console.log('Trade sent to Notion successfully:', trade.symbolName);
        this.processedTrades.add(trade.id);
        return true;
      } else {
        console.error('Failed to send trade to Notion:', response?.error || 'Unknown error');
        return false;
      }
    } catch (error) {
      console.error('Error sending trade to Notion:', error);
      return false;
    }
  }

  // === 新しいメソッド：Notion重複チェック ===
  async checkNotionDuplicate(trade) {
    try {
      // Background scriptに重複チェックを依頼
      const response = await chrome.runtime.sendMessage({
        action: 'checkNotionDuplicate',
        trade: trade,
        token: this.settings.notionToken,
        databaseId: this.settings.databaseId
      });

      console.log('Duplicate check response:', response);
      return response || { isDuplicate: false };
    } catch (error) {
      console.error('Error checking Notion duplicate:', error);
      // エラー時は重複なしとして処理を続行
      return { isDuplicate: false, error: error.message };
    }
  }

  async updateStats(newTradeCount) {
    try {
      const stats = await chrome.storage.local.get(['totalTrades', 'todayTrades', 'lastStatsUpdate']);
      
      const today = new Date().toDateString();
      const isNewDay = stats.lastStatsUpdate !== today;
      
      const updatedStats = {
        totalTrades: (stats.totalTrades || 0) + newTradeCount,
        todayTrades: isNewDay ? newTradeCount : (stats.todayTrades || 0) + newTradeCount,
        lastStatsUpdate: today
      };

      await chrome.storage.local.set(updatedStats);
      console.log('Stats updated:', updatedStats);
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }

  // クリーンアップ
  destroy() {
    this.stopObserving();
    this.processedTrades.clear();
  }
}

// ページ読み込み完了後に初期化
let traderInstance = null;

function initializeTrader() {
  try {
    // 既存のインスタンスがあれば破棄
    if (traderInstance) {
      traderInstance.destroy();
    }
    
    // TopstepXのページでのみ実行
    if (window.location.hostname.includes('topstepx.com')) {
      traderInstance = new TopstepXNotionTrader();
      console.log('TopstepX Notion Trader: Initialized successfully');
    }
  } catch (error) {
    console.error('TopstepX Notion Trader: Initialization error:', error);
  }
}

// DOM読み込み後に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeTrader, 1500);
  });
} else {
  setTimeout(initializeTrader, 1500);
}