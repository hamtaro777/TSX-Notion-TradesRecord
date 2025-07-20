// TopstepX Notion Trader - Fixed Content Script
class TopstepXNotionTrader {
  constructor() {
    this.settings = {};
    this.observer = null;
    this.accountObserver = null;
    this.processedTrades = new Set();
    this.lastTradeCheck = 0;
    this.isEnabled = false;
    this.accountInfo = null;
    this.lastAccountSelectorText = null;
    this.init();
  }

  async init() {
    console.log('TopstepX Notion Trader: Initializing...');

    await this.loadSettings();
    this.setupMessageListener();
    this.startAccountObserver();

    if (this.settings.realTimeMonitoring) {
      this.startObserving();
    }

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

      this.isEnabled = this.settings.autoSync &&
        this.settings.notionToken &&
        this.settings.databaseId;

      console.log('Settings loaded, isEnabled:', this.isEnabled);
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
          return true;

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

    if (!this.accountObserver) {
      this.startAccountObserver();
    }

    console.log('Settings updated, isEnabled:', this.isEnabled);
  }

  async handleManualSync() {
    try {
      console.log('Manual sync started');

      if (!this.isEnabled) {
        const missingSettings = [];
        if (!this.settings.notionToken) missingSettings.push('Notion Token');
        if (!this.settings.databaseId) missingSettings.push('Database ID');
        if (!this.settings.autoSync) missingSettings.push('Auto Sync (disabled)');

        return {
          success: false,
          error: `設定が不完全です: ${missingSettings.join(', ')}`
        };
      }

      const trades = this.extractTradesFromPage();
      console.log('Extracted trades:', trades.length);

      let successCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;

      for (const trade of trades) {
        const result = await this.sendToNotion(trade);
        if (result === true) {
          successCount++;
        } else if (result && result.reason === 'duplicate') {
          duplicateCount++;
        } else {
          errorCount++;
        }
      }

      await this.updateStats(successCount);

      const message = successCount > 0 || duplicateCount > 0 ?
        `成功: ${successCount}件, 重複: ${duplicateCount}件${errorCount > 0 ? `, エラー: ${errorCount}件` : ''}` :
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

  // === 改良されたfindTradesTab メソッド ===
  findTradesTab() {
    console.log('Looking for Trades tab...');

    // Method 1: Direct ID lookup (診断結果から trades IDが確認されている)
    const tradesPanel = document.getElementById('trades');
    if (tradesPanel && this.isPanelVisible(tradesPanel)) {
      console.log('Found Trades tab by direct ID lookup');
      return tradesPanel;
    }

    // Method 2: Tab panel analysis (既存のロジック)
    const panels = document.querySelectorAll('[role="tabpanel"]');
    console.log('Checking', panels.length, 'tab panels...');

    for (const panel of panels) {
      if (!this.isPanelVisible(panel)) continue;

      const headers = panel.querySelectorAll('.MuiDataGrid-columnHeaderTitle');
      const headerTexts = Array.from(headers).map(h => h.textContent?.trim());

      console.log('Panel headers:', headerTexts);

      // Tradesタブの特徴的なヘッダーを確認
      const tradesIndicators = [
        'Exit Time', 'Exit Price', 'P&L', 'Duration', 'Entry Price', 'Entry Time'
      ];

      const ordersIndicators = [
        'Order Type', 'Status', 'Time in Force', 'TIF'
      ];

      const hasTradesIndicators = tradesIndicators.some(indicator =>
        headerTexts.some(text => text && text.includes(indicator))
      );

      const hasOrdersIndicators = ordersIndicators.some(indicator =>
        headerTexts.some(text => text && text.includes(indicator))
      );

      // データ行があることも確認
      const dataRows = panel.querySelectorAll('.MuiDataGrid-virtualScrollerRenderZone .MuiDataGrid-row[data-id]');

      console.log(`Panel analysis: hasTradesIndicators=${hasTradesIndicators}, hasOrdersIndicators=${hasOrdersIndicators}, dataRows=${dataRows.length}`);

      if (hasTradesIndicators && !hasOrdersIndicators && dataRows.length > 0) {
        console.log('Found Trades tab panel');
        return panel;
      }
    }

    console.log('Trades tab not found');
    return null;
  }

  isPanelVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0';
  }

  extractTradesFromPage() {
    const trades = [];
    const tradesTab = this.findTradesTab();

    if (!tradesTab) {
      console.log('Trades tab not found');
      return trades;
    }

    if (!this.accountInfo) {
      this.extractAccountInfo();
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

    // 診断結果に基づいて修正されたフィールドマッピング
    const tradeId = getCellValue('id');
    const symbolName = getCellValue('symbolName').replace(/\//g, '');
    const positionSize = getCellValue('positionSize');
    const entryTime = getCellValue('entryTime');
    const exitedAt = getCellValue('exitedAt');
    const tradeDurationDisplay = getCellValue('tradeDurationDisplay');
    const entryPrice = getCellValue('entryPrice');
    const exitPrice = getCellValue('exitPrice');
    const pnl = getCellValue('pnL'); // 診断結果では 'pnL' が正しい
    const commissions = getCellValue('commisions'); // スペルミス 'commisions' が正しい
    const fees = getCellValue('fees');
    const direction = getCellValue('direction');

    console.log('Extracted cell values:', {
      tradeId, symbolName, positionSize, entryTime, exitedAt,
      entryPrice, exitPrice, pnl, direction
    });

    // トレードとして有効かチェック（終了済みのトレードのみ）
    if (!symbolName || !entryPrice || (!exitPrice && !exitedAt)) {
      console.log('Skipping incomplete trade data');
      return null;
    }

    const id = tradeId || this.generateTradeId(symbolName, entryTime, entryPrice, positionSize, direction);

    const tradeData = {
      id,
      tradeId: tradeId,
      symbolName: symbolName,
      symbol: symbolName,
      positionSize: this.parseNumber(positionSize),
      size: this.parseNumber(positionSize),
      entryTime: this.parseDateTime(entryTime),
      exitedAt: this.parseDateTime(exitedAt),
      tradeDurationDisplay: tradeDurationDisplay,
      entryPrice: this.parseNumber(entryPrice),
      exitPrice: this.parseNumber(exitPrice),
      pnl: this.parseNumber(pnl),
      commissions: this.parseNumber(commissions),
      fees: this.parseNumber(fees),
      direction: direction,
      type: direction,
      extractedAt: new Date().toISOString()
    };

    if (this.accountInfo) {
      tradeData.accountType = this.accountInfo.accountType;
      tradeData.accountName = this.accountInfo.accountName;
      tradeData.accountId = this.accountInfo.accountId;
    }

    return tradeData;
  }

  // === アカウント情報を抽出（以前のバージョンに戻す） ===
  extractAccountInfo() {
    try {
      console.log('Extracting account information...');

      // アカウントセレクタを探す
      const accountSelector = document.querySelector('.layoutSelector_wrapper__tjzKt .MuiSelect-select');

      if (!accountSelector) {
        console.log('Account selector not found');
        return null;
      }

      // 選択されているメニューアイテムを取得
      const selectedItem = accountSelector.querySelector('.MuiMenuItem-root');

      if (!selectedItem) {
        console.log('Selected account item not found');
        return null;
      }

      const itemContent = selectedItem.querySelector('.MuiBox-root');
      if (!itemContent) {
        console.log('Account item content not found');
        return null;
      }

      // 全体のテキストを取得して分析
      const fullText = itemContent.textContent?.trim();
      console.log('Full account selector text:', fullText);

      const spans = itemContent.querySelectorAll('span');
      console.log('Found spans in account selector:', spans.length);

      // デバッグ：各spanの内容を出力
      spans.forEach((span, index) => {
        console.log(`Span ${index}: "${span.textContent?.trim()}"`);
      });

      let accountType = null;
      let accountName = null;
      let accountId = null;

      // 全体テキストから正規表現で抽出（より確実）
      if (fullText) {
        // パターン1: AccountNameがある場合
        // "$50K Trading Combine | NotionTest001 (50KTC-V2-140427-18973963)"
        const pattern1 = /^(.+?)\s*\|\s*(.+?)\s*\(([^)]+)\)$/;
        const match1 = fullText.match(pattern1);

        if (match1) {
          accountType = match1[1].trim();
          accountName = match1[2].trim();
          accountId = match1[3].trim();
          console.log('Matched pattern 1 (with AccountName)');
        } else {
          // パターン2: AccountNameがない場合
          // "$150K PRACTICE | PRACTICEMAY2614173937"
          const pattern2 = /^(.+?)\s*\|\s*(.+?)$/;
          const match2 = fullText.match(pattern2);

          if (match2) {
            accountType = match2[1].trim();
            accountName = null;
            accountId = match2[2].trim();
            console.log('Matched pattern 2 (without AccountName)');
          } else {
            console.log('No pattern matched, falling back to span-based extraction');

            // fallback: span based extraction
            if (spans.length >= 1) {
              accountType = spans[0].textContent?.trim();
            }

            if (spans.length >= 3) {
              // spans[2]以降を確認
              const spanTexts = Array.from(spans).map(s => s.textContent?.trim()).filter(t => t && t !== '|');
              console.log('Non-separator span texts:', spanTexts);

              if (spanTexts.length >= 2) {
                // 最後のspanが括弧付きかチェック
                const lastSpan = spanTexts[spanTexts.length - 1];
                if (lastSpan && lastSpan.includes('(') && lastSpan.includes(')')) {
                  // AccountNameがある場合
                  if (spanTexts.length >= 3) {
                    accountName = spanTexts[1];
                    accountId = lastSpan.replace(/[()]/g, '').trim();
                  }
                } else {
                  // AccountNameがない場合
                  accountName = null;
                  accountId = spanTexts[1];
                }
              }
            }
          }
        }
      }

      const accountInfo = {
        accountType: accountType,
        accountName: accountName || null,
        accountId: accountId
      };

      console.log('Final extracted account info:', accountInfo);

      // 抽出結果の検証
      if (!accountType || !accountId) {
        console.warn('Account extraction incomplete:', accountInfo);
      }

      // アカウント情報をキャッシュ
      this.accountInfo = accountInfo;

      return accountInfo;
    } catch (error) {
      console.error('Error extracting account info:', error);
      return null;
    }
  }

  generateTradeId(symbolName, entryTime, entryPrice, positionSize, direction) {
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

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
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
      const dateTimeMatch = str.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
      if (dateTimeMatch) {
        const [, year, month, day, hours, minutes, seconds] = dateTimeMatch;
        const isoString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
        const date = new Date(isoString);

        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }

      const date = new Date(str);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }

      return str;
    } catch (error) {
      console.error('Error parsing datetime:', str, error);
      return str;
    }
  }

  async sendToNotion(trade) {
    try {
      console.log('=== Sending to Notion - Enhanced duplicate prevention ===');
      console.log('Trade data:', {
        id: trade.id,
        tradeId: trade.tradeId,
        symbol: trade.symbolName,
        entryPrice: trade.entryPrice,
        pnl: trade.pnl
      });

      // 強化された重複チェック実行
      const duplicateCheck = await this.checkNotionDuplicate(trade);

      if (duplicateCheck.isDuplicate) {
        console.log(`⚠️  DUPLICATE DETECTED - SKIPPING REGISTRATION`);
        console.log(`   Match type: ${duplicateCheck.matchedBy}`);
        console.log(`   Match count: ${duplicateCheck.matchCount}`);
        console.log(`   Trade ID: ${trade.id || trade.tradeId}`);

        // ローカルキャッシュに追加（重複として処理済みマーク）
        this.processedTrades.add(trade.id);

        return {
          success: true,
          reason: 'duplicate',
          details: duplicateCheck
        };
      }

      console.log('✅ No duplicates found - Proceeding with registration');

      // Notionに送信
      const response = await chrome.runtime.sendMessage({
        action: 'sendToNotion',
        trade: trade,
        token: this.settings.notionToken,
        databaseId: this.settings.databaseId
      });

      console.log('Notion API response:', response);

      if (response && response.success) {
        console.log('✅ Trade registered successfully in Notion:', trade.symbolName);
        this.processedTrades.add(trade.id);
        return true;
      } else {
        console.error('❌ Failed to register trade in Notion:', response?.error || 'Unknown error');
        return false;
      }
    } catch (error) {
      console.error('❌ Error in sendToNotion:', error);
      return false;
    }
  }

  async checkNotionDuplicate(trade) {
    try {
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
      return { isDuplicate: false, error: error.message };
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
      clearTimeout(this.checkTimeout);
      this.checkTimeout = setTimeout(() => {
        this.checkTrades();
      }, 1000);
    });

    const tradesTab = this.findTradesTab();
    if (tradesTab) {
      this.observer.observe(tradesTab, config);
      console.log('Observer started for trades tab');
    } else {
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

  startAccountObserver() {
    if (this.accountObserver) return;

    const config = {
      childList: true,
      subtree: true,
      characterData: true
    };

    this.accountObserver = new MutationObserver((mutations) => {
      this.checkAccountChange();
    });

    const accountArea = document.querySelector('.layoutSelector_wrapper__tjzKt');
    if (accountArea) {
      this.accountObserver.observe(accountArea, config);
      console.log('Account observer started for account selector');
    } else {
      this.accountObserver.observe(document.body, config);
      console.log('Account observer started for document body (fallback)');
    }

    setTimeout(() => {
      this.checkAccountChange();
    }, 500);
  }

  stopAccountObserver() {
    if (this.accountObserver) {
      this.accountObserver.disconnect();
      this.accountObserver = null;
      console.log('Account observer stopped');
    }
  }

  checkAccountChange() {
    try {
      const accountSelector = document.querySelector('.layoutSelector_wrapper__tjzKt .MuiSelect-select');

      if (!accountSelector) {
        console.log('Account selector not found for change detection');
        return;
      }

      const currentSelectorText = accountSelector.textContent?.trim();

      if (this.lastAccountSelectorText !== null &&
        this.lastAccountSelectorText !== currentSelectorText) {

        console.log('=== ACCOUNT CHANGE DETECTED ===');
        console.log('Previous:', this.lastAccountSelectorText);
        console.log('Current:', currentSelectorText);

        this.accountInfo = null;
        this.extractAccountInfo();
        this.processedTrades.clear();
        console.log('Processed trades cleared due to account change');

        setTimeout(() => {
          this.checkTrades();
        }, 1000);
      }

      this.lastAccountSelectorText = currentSelectorText;

    } catch (error) {
      console.error('Error checking account change:', error);
    }
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

        if (successCount > 0) {
          await this.updateStats(successCount);
        }
      }
    } catch (error) {
      console.error('Error checking trades:', error);
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

  destroy() {
    this.stopObserving();
    this.stopAccountObserver();
    this.processedTrades.clear();
    this.accountInfo = null;
    this.lastAccountSelectorText = null;
  }
}

// ページ読み込み完了後に初期化
let traderInstance = null;

function initializeTrader() {
  try {
    if (traderInstance) {
      traderInstance.destroy();
    }

    if (window.location.hostname.includes('topstepx.com')) {
      traderInstance = new TopstepXNotionTrader();
      console.log('TopstepX Notion Trader: Initialized successfully');
    }
  } catch (error) {
    console.error('TopstepX Notion Trader: Initialization error:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeTrader, 1500);
  });
} else {
  setTimeout(initializeTrader, 1500);
}