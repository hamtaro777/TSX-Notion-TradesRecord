// TopstepX Notion Trader - Content Script (Debug Enhanced)
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
      console.log('=== Manual sync started ===');
      console.log('Current URL:', window.location.href);
      console.log('Current settings:', this.settings);
      console.log('isEnabled:', this.isEnabled);
      
      // 設定の詳細チェック
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

      // ページの確認
      console.log('Checking page structure...');
      const tradesTab = this.findTradesTab();
      console.log('Trades tab found:', !!tradesTab);
      
      if (!tradesTab) {
        console.error('Trades tab not found. Available panels:', 
          document.querySelectorAll('[role="tabpanel"]').length);
        
        return {
          success: false,
          error: 'Tradesタブが見つかりません。Tradesタブを開いてから再実行してください。'
        };
      }

      // トレードデータの抽出
      console.log('Extracting trades...');
      const trades = this.extractTradesFromPage();
      console.log('Extracted trades:', trades.length, trades);
      
      if (trades.length === 0) {
        console.log('No trades found on page');
        return { 
          success: true, 
          count: 0, 
          message: 'ページにトレードデータが見つかりません。トレードがあることを確認してください。' 
        };
      }
      
      const newTrades = trades.filter(trade => !this.processedTrades.has(trade.id));
      console.log('New trades to sync:', newTrades.length, newTrades);
      
      if (newTrades.length === 0) {
        return { 
          success: true, 
          count: 0, 
          message: '新しいトレードはありません（既に同期済み）' 
        };
      }

      // 各トレードをNotionに送信
      let successCount = 0;
      let errorDetails = [];
      
      for (const trade of newTrades) {
        console.log('Sending trade to Notion:', trade);
        try {
          const success = await this.sendToNotion(trade);
          if (success) {
            this.processedTrades.add(trade.id);
            successCount++;
            console.log(`Trade ${trade.id} sent successfully`);
          } else {
            const errorMsg = `Trade ${trade.id} failed to send`;
            console.error(errorMsg);
            errorDetails.push(errorMsg);
          }
        } catch (error) {
          const errorMsg = `Trade ${trade.id} error: ${error.message}`;
          console.error(errorMsg);
          errorDetails.push(errorMsg);
        }
      }

      // 統計を更新
      if (successCount > 0) {
        await this.updateStats(successCount);
      }

      console.log('=== Manual sync completed ===');
      console.log('Success count:', successCount);
      console.log('Error details:', errorDetails);

      if (errorDetails.length > 0) {
        return {
          success: false,
          error: `一部のトレードで同期に失敗しました。成功: ${successCount}件, 失敗: ${errorDetails.length}件`
        };
      }

      return { 
        success: true, 
        count: successCount 
      };
    } catch (error) {
      console.error('Manual sync error:', error);
      console.error('Error stack:', error.stack);
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
    console.log('Searching for trades tab...');
    
    // Method 1: role="tabpanel"で探す
    const panels = document.querySelectorAll('[role="tabpanel"]');
    console.log('Found tabpanels:', panels.length);
    
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const headers = panel.querySelectorAll('.MuiDataGrid-columnHeaderTitle');
      const headerTexts = Array.from(headers).map(h => h.textContent);
      
      console.log(`Panel ${i} headers:`, headerTexts);
      
      // Tradesタブの特徴的なヘッダーを探す
      if (headerTexts.some(text => 
        text.includes('Symbol') || 
        text.includes('Entry') || 
        text.includes('Exit') ||
        text.includes('PnL') ||
        text.includes('Qty')
      )) {
        console.log('Found trades tab at panel', i);
        return panel;
      }
    }
    
    // Method 2: MuiDataGridを直接探す
    const dataGrids = document.querySelectorAll('.MuiDataGrid-root');
    console.log('Found MuiDataGrid elements:', dataGrids.length);
    
    for (let i = 0; i < dataGrids.length; i++) {
      const grid = dataGrids[i];
      const headers = grid.querySelectorAll('.MuiDataGrid-columnHeaderTitle');
      const headerTexts = Array.from(headers).map(h => h.textContent);
      
      console.log(`DataGrid ${i} headers:`, headerTexts);
      
      if (headerTexts.some(text => 
        text.includes('Symbol') || 
        text.includes('Entry') || 
        text.includes('Exit') ||
        text.includes('PnL') ||
        text.includes('Qty')
      )) {
        console.log('Found trades grid at index', i);
        return grid;
      }
    }
    
    console.log('Trades tab/grid not found');
    return null;
  }

  async checkTrades() {
    if (!this.isEnabled) return;

    try {
      const trades = this.extractTradesFromPage();
      const newTrades = trades.filter(trade => !this.processedTrades.has(trade.id));
      
      if (newTrades.length > 0) {
        console.log(`Found ${newTrades.length} new trades`);
        
        for (const trade of newTrades) {
          const success = await this.sendToNotion(trade);
          if (success) {
            this.processedTrades.add(trade.id);
          }
        }
        
        // 統計を更新
        await this.updateStats(newTrades.length);
      }
    } catch (error) {
      console.error('Error checking trades:', error);
    }
  }

  extractTradesFromPage() {
    const trades = [];
    const tradesTab = this.findTradesTab();
    
    if (!tradesTab) {
      console.log('Trades tab not found for extraction');
      return trades;
    }

    console.log('Extracting trades from tab...');
    
    // データ行を探す
    const dataRows = tradesTab.querySelectorAll('.MuiDataGrid-virtualScrollerRenderZone .MuiDataGrid-row[data-id]');
    console.log('Found data rows:', dataRows.length);
    
    // 行が見つからない場合、別の方法を試す
    if (dataRows.length === 0) {
      const alternativeRows = tradesTab.querySelectorAll('.MuiDataGrid-row');
      console.log('Alternative rows found:', alternativeRows.length);
      
      alternativeRows.forEach((row, index) => {
        try {
          const trade = this.extractTradeFromRow(row);
          if (trade && trade.symbol) {
            trades.push(trade);
            console.log(`Extracted trade ${index}:`, trade);
          }
        } catch (error) {
          console.error('Error extracting trade from alternative row:', error);
        }
      });
    } else {
      dataRows.forEach((row, index) => {
        try {
          const trade = this.extractTradeFromRow(row);
          if (trade && trade.symbol) {
            trades.push(trade);
            console.log(`Extracted trade ${index}:`, trade);
          }
        } catch (error) {
          console.error('Error extracting trade from row:', error);
        }
      });
    }

    console.log(`Extracted ${trades.length} trades from page`);
    return trades;
  }

  extractTradeFromRow(row) {
    console.log('Extracting trade from row:', row);
    
    const getCellValue = (fieldName) => {
      const cell = row.querySelector(`[data-field="${fieldName}"]`);
      const value = cell ? cell.textContent.trim() : '';
      console.log(`Field ${fieldName}: "${value}"`);
      return value;
    };

    // すべてのセルを出力してデバッグ
    const cells = row.querySelectorAll('[data-field]');
    console.log('All cells in row:');
    cells.forEach(cell => {
      console.log(`  ${cell.getAttribute('data-field')}: "${cell.textContent.trim()}"`);
    });

    // HTMLで確認したdata-field名に基づいて値を抽出
    const tradeId = getCellValue('id');
    const symbolName = getCellValue('symbolName');
    const positionSize = getCellValue('positionSize');
    const entryTime = getCellValue('entryTime');
    const exitedAt = getCellValue('exitedAt');
    const tradeDurationDisplay = getCellValue('tradeDurationDisplay');
    const entryPrice = getCellValue('entryPrice');
    const exitPrice = getCellValue('exitPrice');
    const pnl = getCellValue('pnL');
    const commissions = getCellValue('commisions'); // HTMLでは"commisions"とスペルミス
    const fees = getCellValue('fees');
    const direction = getCellValue('direction');

    // ユニークIDを生成（TopstepXのIDがある場合はそれを使用）
    const id = tradeId || this.generateTradeId(symbolName, entryTime, entryPrice, positionSize);

    const trade = {
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

    console.log('Extracted trade:', trade);
    return trade;
  }

  generateTradeId(symbolName, entryTime, entryPrice, positionSize) {
    const data = `${symbolName}-${entryTime}-${entryPrice}-${positionSize}`;
    return btoa(data).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
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

  async sendToNotion(trade) {
    try {
      console.log('Sending to Notion - Trade data:', trade);
      console.log('Sending to Notion - Token available:', !!this.settings.notionToken);
      console.log('Sending to Notion - Database ID available:', !!this.settings.databaseId);
      
      const response = await chrome.runtime.sendMessage({
        action: 'sendToNotion',
        trade: trade,
        token: this.settings.notionToken,
        databaseId: this.settings.databaseId
      });

      console.log('Notion API response:', response);

      if (response && response.success) {
        console.log('Trade sent to Notion successfully:', trade.symbolName);
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