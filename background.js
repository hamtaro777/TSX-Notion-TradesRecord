// Background Service Worker
class NotionAPI {
  constructor() {
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'testNotionConnection':
          this.testConnection(message.token, message.databaseId).then(sendResponse);
          return true; // 非同期レスポンス

        case 'sendToNotion':
          this.sendTradeToNotion(message.trade, message.token, message.databaseId).then(sendResponse);
          return true; // 非同期レスポンス

        default:
          break;
      }
    });
  }

  async testConnection(token, databaseId) {
    try {
      console.log('Testing Notion connection...');
      console.log('Token format check:', token ? `${token.substring(0, 10)}...` : 'No token');
      console.log('Database ID:', databaseId);
      
      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      console.log('Notion API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Notion API error response:', errorData);
        throw new Error(`HTTP ${response.status}: ${errorData.message || 'Unknown error'}`);
      }

      const database = await response.json();
      console.log('Notion connection test successful:', database.title);
      
      return {
        success: true,
        database: {
          title: database.title?.[0]?.text?.content || 'Untitled',
          id: database.id
        }
      };
    } catch (error) {
      console.error('Notion connection test failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendTradeToNotion(trade, token, databaseId) {
    try {
      console.log('Sending trade to Notion - Background script');
      console.log('Trade data:', trade);
      console.log('Token available:', !!token);
      console.log('Database ID:', databaseId);

      const pageData = this.buildNotionPageData(trade);
      console.log('Built page data:', pageData);
      
      const requestBody = {
        parent: {
          database_id: databaseId
        },
        properties: pageData
      };
      
      console.log('Request body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Notion API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Notion API error response:', errorData);
        throw new Error(`HTTP ${response.status}: ${errorData.message || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('Trade sent to Notion successfully:', result.id);

      return {
        success: true,
        pageId: result.id
      };
    } catch (error) {
      console.error('Failed to send trade to Notion:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  buildNotionPageData(trade) {
    const properties = {};

    // Trade IDをタイトルに変更（必須項目）
    if (trade.tradeId) {
      properties['Trade ID'] = {
        title: [{
          text: {
            content: trade.tradeId.toString()
          }
        }]
      };
    } else {
      // tradeIdがない場合は生成されたIDを使用
      properties['Trade ID'] = {
        title: [{
          text: {
            content: trade.id || 'Unknown'
          }
        }]
      };
    }

    // Symbolをセレクトに変更
    if (trade.symbolName) {
      properties['Symbol'] = {
        select: {
          name: trade.symbolName
        }
      };
    }

    if (trade.direction) {
      properties['Direction'] = {
        select: {
          name: trade.direction
        }
      };
    }

    if (trade.positionSize !== null && trade.positionSize !== undefined) {
      properties['Size'] = {
        number: trade.positionSize
      };
    }

    if (trade.entryPrice !== null && trade.entryPrice !== undefined) {
      properties['Entry Price'] = {
        number: trade.entryPrice
      };
    }

    if (trade.exitPrice !== null && trade.exitPrice !== undefined) {
      properties['Exit Price'] = {
        number: trade.exitPrice
      };
    }

    if (trade.pnl !== null && trade.pnl !== undefined) {
      properties['PnL'] = {
        number: trade.pnl
      };
    }

    if (trade.fees !== null && trade.fees !== undefined) {
      properties['Fees'] = {
        number: trade.fees
      };
    }

    if (trade.commissions !== null && trade.commissions !== undefined) {
      properties['Commissions'] = {
        number: trade.commissions
      };
    }

    if (trade.entryTime) {
      try {
        const entryDate = new Date(trade.entryTime);
        if (!isNaN(entryDate.getTime())) {
          properties['Entry Time'] = {
            date: {
              start: entryDate.toISOString()
            }
          };
        }
      } catch (error) {
        console.error('Error parsing entry time:', error);
      }
    }

    if (trade.exitedAt && trade.exitedAt !== '0') {
      try {
        const exitDate = new Date(trade.exitedAt);
        if (!isNaN(exitDate.getTime())) {
          properties['Exit Time'] = {
            date: {
              start: exitDate.toISOString()
            }
          };
        }
      } catch (error) {
        console.error('Error parsing exit time:', error);
      }
    }

    if (trade.tradeDurationDisplay) {
      properties['Duration'] = {
        rich_text: [{
          text: {
            content: trade.tradeDurationDisplay
          }
        }]
      };
    }

    // データ取得時刻
    if (trade.extractedAt) {
      try {
        const extractedDate = new Date(trade.extractedAt);
        if (!isNaN(extractedDate.getTime())) {
          properties['Extracted At'] = {
            date: {
              start: extractedDate.toISOString()
            }
          };
        }
      } catch (error) {
        console.error('Error parsing extracted time:', error);
      }
    }

    // プラットフォーム情報
    properties['Platform'] = {
      select: {
        name: 'TopstepX'
      }
    };

    // 損益の分類
    if (trade.pnl !== null && trade.pnl !== undefined) {
      properties['Result'] = {
        select: {
          name: trade.pnl > 0 ? 'Win' : trade.pnl < 0 ? 'Loss' : 'Breakeven'
        }
      };
    }

    console.log('Built Notion page data:', properties);
    return properties;
  }
}

// Service Worker初期化
const notionAPI = new NotionAPI();
console.log('TopstepX Notion Trader Background Service Worker initialized');