// ポップアップ画面のJavaScript
class PopupManager {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    this.setupEventListeners();
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.sync.get([
        'notionToken',
        'databaseId',
        'autoSync',
        'realTimeMonitoring'
      ]);

      if (settings.notionToken) {
        document.getElementById('notionToken').value = settings.notionToken;
      }
      if (settings.databaseId) {
        document.getElementById('databaseId').value = settings.databaseId;
      }
      
      document.getElementById('autoSync').checked = settings.autoSync || false;
      document.getElementById('realTimeMonitoring').checked = settings.realTimeMonitoring || false;
    } catch (error) {
      this.showStatus('設定の読み込みに失敗しました', 'error');
    }
  }

  async loadStats() {
    try {
      const stats = await chrome.storage.local.get(['totalTrades', 'todayTrades']);
      
      document.getElementById('totalTrades').textContent = stats.totalTrades || 0;
      document.getElementById('todayTrades').textContent = stats.todayTrades || 0;
    } catch (error) {
      console.error('Stats loading error:', error);
    }
  }

  setupEventListeners() {
    // 設定保存
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveSettings();
    });

    // 接続テスト
    document.getElementById('testConnection').addEventListener('click', () => {
      this.testConnection();
    });

    // 手動同期
    document.getElementById('manualSync').addEventListener('click', () => {
      this.manualSync();
    });

    // トグルの変更を即座に保存
    document.getElementById('autoSync').addEventListener('change', () => {
      this.saveSettings();
    });

    document.getElementById('realTimeMonitoring').addEventListener('change', () => {
      this.saveSettings();
    });
  }

  async saveSettings() {
    try {
      const settings = {
        notionToken: document.getElementById('notionToken').value.trim(),
        databaseId: document.getElementById('databaseId').value.trim(),
        autoSync: document.getElementById('autoSync').checked,
        realTimeMonitoring: document.getElementById('realTimeMonitoring').checked
      };

      console.log('Saving settings:', {
        hasNotionToken: !!settings.notionToken,
        tokenLength: settings.notionToken.length,
        hasDatabaseId: !!settings.databaseId,
        databaseIdLength: settings.databaseId.length,
        autoSync: settings.autoSync,
        realTimeMonitoring: settings.realTimeMonitoring
      });

      if (!settings.notionToken || !settings.databaseId) {
        this.showStatus('Notion TokenとDatabase IDは必須です', 'error');
        return;
      }

      // Database IDの形式チェック（32文字の英数字）
      if (!/^[a-f0-9]{32}$/i.test(settings.databaseId.replace(/-/g, ''))) {
        this.showStatus('Database IDの形式が正しくありません（32文字の英数字である必要があります）', 'error');
        return;
      }

      // Notion Tokenの形式チェック（secret_またはntn_で始まる）
      if (!settings.notionToken.startsWith('secret_') && !settings.notionToken.startsWith('ntn_')) {
        this.showStatus('Notion Tokenの形式が正しくありません（secret_またはntn_で始まる必要があります）', 'error');
        return;
      }

      await chrome.storage.sync.set(settings);
      
      // Content scriptに設定変更を通知
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url.includes('topstepx.com')) {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'settingsUpdated', 
          settings: settings 
        });
      }

      this.showStatus('設定を保存しました', 'success');
    } catch (error) {
      console.error('Settings save error:', error);
      this.showStatus('設定の保存に失敗しました', 'error');
    }
  }

  async testConnection() {
    const button = document.getElementById('testConnection');
    const originalText = button.textContent;
    
    try {
      button.disabled = true;
      button.textContent = 'テスト中...';

      const token = document.getElementById('notionToken').value.trim();
      const databaseId = document.getElementById('databaseId').value.trim();

      if (!token || !databaseId) {
        this.showStatus('Notion TokenとDatabase IDを入力してください', 'error');
        return;
      }

      // Background scriptに接続テストを依頼
      const response = await chrome.runtime.sendMessage({
        action: 'testNotionConnection',
        token: token,
        databaseId: databaseId
      });

      if (response.success) {
        this.showStatus('Notion接続テスト成功！', 'success');
      } else {
        this.showStatus(`接続テスト失敗: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Connection test error:', error);
      this.showStatus('接続テストでエラーが発生しました', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async manualSync() {
    const button = document.getElementById('manualSync');
    const originalText = button.textContent;
    
    try {
      button.disabled = true;
      button.textContent = '同期中...';

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url.includes('topstepx.com')) {
        this.showStatus('TopstepXのページで実行してください', 'error');
        return;
      }

      // Content scriptに手動同期を指示
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'manualSync' 
      });

      if (response && response.success) {
        this.showStatus(`${response.count}件のトレードを同期しました`, 'success');
        await this.loadStats(); // 統計を更新
      } else {
        this.showStatus(response ? response.error : '同期に失敗しました', 'error');
      }
    } catch (error) {
      console.error('Manual sync error:', error);
      this.showStatus('同期でエラーが発生しました', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  showStatus(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    statusElement.style.display = 'block';

    // 3秒後に自動で非表示
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }
}

// ポップアップが開かれたときに初期化
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});