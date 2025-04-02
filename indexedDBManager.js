

// indexedDBManager.js
const { IDBFactory } = require('fake-indexeddb');
const idb = new IDBFactory();

class IndexedDBManager {
  constructor(dbName = 'barterChainDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.stores = ['users', 'items', 'offers', 'transactions'];
    this.shardStores = new Map(); // 存储分片集合
  }

  // 打开数据库连接
  async open() {
    return new Promise((resolve, reject) => {
      const request = idb.open(this.dbName, this.version);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 创建用户存储
        if (!db.objectStoreNames.contains('users')) {
          const usersStore = db.createObjectStore('users', { keyPath: 'userId' });
          usersStore.createIndex('email', 'email', { unique: true });
          usersStore.createIndex('username', 'username', { unique: true });
        }
        
        // 创建交易存储
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
          txStore.createIndex('from', 'from');
          txStore.createIndex('to', 'to');
          txStore.createIndex('type', 'type');
          txStore.createIndex('shardId', 'shardId');
        }
        
        // 创建交换提议存储
        if (!db.objectStoreNames.contains('offers')) {
          const offersStore = db.createObjectStore('offers', { keyPath: 'id' });
          offersStore.createIndex('creator', 'creator');
          offersStore.createIndex('status', 'status');
          offersStore.createIndex('shardId', 'shardId');
        }
        
        // 初始化分片存储
        for (let i = 0; i < 256; i++) {
          const shardId = i.toString(16).padStart(2, '0'); // 转为两位十六进制
          const storeName = `items_${shardId}`;
          
          if (!db.objectStoreNames.contains(storeName)) {
            const itemsStore = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
            itemsStore.createIndex('userId', 'userId');
            itemsStore.createIndex('status', 'status');
            itemsStore.createIndex('shardId', 'shardId');
          }
        }
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('IndexedDB 连接成功');
        resolve(this.db);
      };
      
      request.onerror = (event) => {
        console.error('IndexedDB 连接错误:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // 关闭数据库连接
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // 获取存储对象
  getStore(storeName, mode = 'readonly') {
    if (!this.db) throw new Error('数据库未连接');
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // 保存用户
  async saveUser(userData) {
    return new Promise((resolve, reject) => {
      const store = this.getStore('users', 'readwrite');
      
      // 生成用户ID
      if (!userData.userId) {
        userData.userId = crypto.randomBytes(16).toString('hex');
      }
      
      const request = store.put(userData);
      
      request.onsuccess = () => resolve(userData);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // 获取用户
  async getUser(userId) {
    return new Promise((resolve, reject) => {
      const store = this.getStore('users');
      const request = store.get(userId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // 保存物品到分片
  async saveItem(shardId, itemData) {
    return new Promise((resolve, reject) => {
      const storeName = `items_${shardId}`;
      const store = this.getStore(storeName, 'readwrite');
      
      const request = store.add(itemData);
      
      request.onsuccess = (event) => {
        // 获取自动生成的ID
        itemData.id = event.target.result;
        resolve(itemData);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // 获取分片中的物品
  async getItemsInShard(shardId, filter = {}) {
    return new Promise((resolve, reject) => {
      const storeName = `items_${shardId}`;
      const store = this.getStore(storeName);
      const items = [];
      
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const item = cursor.value;
          
          // 应用过滤条件
          let match = true;
          for (const [key, value] of Object.entries(filter)) {
            if (item[key] !== value) {
              match = false;
              break;
            }
          }
          
          if (match) {
            items.push(item);
          }
          
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // 更新物品
  async updateItem(shardId, itemId, updates) {
    return new Promise((resolve, reject) => {
      const storeName = `items_${shardId}`;
      const store = this.getStore(storeName, 'readwrite');
      
      const getRequest = store.get(itemId);
      
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (!item) {
          reject(new Error('物品不存在'));
          return;
        }
        
        // 应用更新
        Object.assign(item, updates);
        
        const updateRequest = store.put(item);
        updateRequest.onsuccess = () => resolve(item);
        updateRequest.onerror = (event) => reject(event.target.error);
      };
      
      getRequest.onerror = (event) => reject(event.target.error);
    });
  }

  // 保存交换提议
  async saveOffer(offerData) {
    return new Promise((resolve, reject) => {
      const store = this.getStore('offers', 'readwrite');
      const request = store.put(offerData);
      
      request.onsuccess = () => resolve(offerData);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // 获取交换提议
  async getOffer(offerId) {
    return new Promise((resolve, reject) => {
      const store = this.getStore('offers');
      const request = store.get(offerId);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // 获取所有交换提议
  async getAllOffers(filter = {}) {
    return new Promise((resolve, reject) => {
      const store = this.getStore('offers');
      const offers = [];
      
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const offer = cursor.value;
          
          // 应用过滤条件
          let match = true;
          for (const [key, value] of Object.entries(filter)) {
            if (offer[key] !== value) {
              match = false;
              break;
            }
          }
          
          if (match) {
            offers.push(offer);
          }
          
          cursor.continue();
        } else {
          resolve(offers);
        }
      };
      
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // 保存交易
  async saveTransaction(txData) {
    return new Promise((resolve, reject) => {
      const store = this.getStore('transactions', 'readwrite');
      const request = store.add(txData);
      
      request.onsuccess = (event) => {
        txData.id = event.target.result;
        resolve(txData);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  // 获取交易
  async getTransactions(filter = {}) {
    return new Promise((resolve, reject) => {
      const store = this.getStore('transactions');
      const transactions = [];
      
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const tx = cursor.value;
          
          // 应用过滤条件
          let match = true;
          for (const [key, value] of Object.entries(filter)) {
            if (tx[key] !== value) {
              match = false;
              break;
            }
          }
          
          if (match) {
            transactions.push(tx);
          }
          
          cursor.continue();
        } else {
          resolve(transactions);
        }
      };
      
      request.onerror = (event) => reject(event.target.error);
    });
  }
}

module.exports = IndexedDBManager;
