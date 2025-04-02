// dataRouter.js
const crypto = require('crypto');
const { LRUCache } = require('lru-cache')

class DataRouter {
  constructor(p2pNetwork, blockchain) {
    this.p2pNetwork = p2pNetwork;
    this.blockchain = blockchain;
    this.localData = new Map(); // 本地数据存储
    this.pendingRequests = new Map(); // 等待响应的请求
    const options = {
        // 最大缓存项数量
        max: 1000,
        
        // 缓存项的最大总大小
        maxSize: 5000,
        
        // 计算缓存项大小的函数
        sizeCalculation: (value, key) => {
          return 1  // 每个项占用 1 个单位
        },
        
        // 当项被从缓存中移除时的回调函数
        dispose: (value, key, reason) => {
          // 释放资源或执行清理操作
        },
        
        // 当项被插入缓存时的回调函数
        onInsert: (value, key, reason) => {
          // 记录插入操作
        },
        
        // 缓存项的生存时间（毫秒）
        ttl: 1000 * 60 * 5,  // 5分钟
        
        // 是否允许返回过期但尚未被移除的项
        allowStale: false,
        
        // 获取项时是否更新其年龄
        updateAgeOnGet: false,
        
        // 检查项是否存在时是否更新其年龄
        updateAgeOnHas: false,
        
        // 用于 fetch() 方法的异步函数
        fetchMethod: async (key, staleValue, { options, signal, context }) => {
          // 获取新值的逻辑
        }
      }
      

    this.dataCache = new LRUCache(options);
    
    // 注册消息处理器
    this.setupMessageHandlers();
  }

  // 设置消息处理器
  setupMessageHandlers() {
    // 处理数据请求
    this.p2pNetwork.messageHandlers.set('DATA_REQUEST', (socket, message) => {
      const { dataId, requesterId, requestId } = message.data;
      
      // 查找本地数据
      const data = this.getLocalData(dataId);
      
      // 响应请求
      this.p2pNetwork.sendMessage(socket, {
        type: 'DATA_RESPONSE',
        data: {
          dataId,
          requestId,
          data: data || null,
          found: !!data
        }
      });
    });
    
    // 处理数据响应
    this.p2pNetwork.messageHandlers.set('DATA_RESPONSE', (socket, message) => {
      const { dataId, requestId, data, found } = message.data;
      
      if (this.pendingRequests.has(requestId)) {
        const { resolve, reject, timeout } = this.pendingRequests.get(requestId);
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        
        if (found) {
          // 缓存数据
          this.cacheData(dataId, data);
          resolve(data);
        } else {
          reject(new Error(`数据 ${dataId} 未找到`));
        }
      }
    });
  }

  // 根据数据ID确定分片ID
  getShardIdForData(dataId) {
    // 使用与blockchain相同的分片策略
    return this.blockchain.getShardId(dataId);
  }
  
  // 根据用户ID确定分片ID
  getShardIdForUser(userId) {
    return this.blockchain.getShardId(userId);
  }

  // 请求数据
  // 修改 requestData 方法，增加重试和日志
// 在dataRouter.js中修改requestData方法
async requestData(dataId, timeoutMs = 50000, retries = 3) { // 增加超时时间和重试次数
  // 首先检查本地数据
  const localData = this.getLocalData(dataId);
  if (localData) {
    console.log(`从本地获取数据: ${dataId}`);
    return localData;
  }
  
  // 然后检查缓存
  const cachedData = this.dataCache.get(dataId);
  if (cachedData) {
    console.log(`从缓存获取数据: ${dataId}`);
    return cachedData;
  }
  
  console.log(`请求网络数据: ${dataId}, 剩余重试次数: ${retries}`);
  
  // 确定数据所在分片
  const shardId = this.getShardIdForData(dataId);
  
  // 创建请求ID
  const requestId = crypto.randomBytes(8).toString('hex');
  
  // 广播数据请求
  this.p2pNetwork.broadcast({
    type: 'DATA_REQUEST',
    data: {
      dataId,
      requesterId: this.p2pNetwork.nodeId,
      requestId,
      shardId
    }
  });
  
  try {
    // 等待响应，使用类似上面的修复方法
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('数据请求超时'));
        }
      }, timeoutMs);
      
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
    });
    
    return result;
  } catch (error) {
    if (retries > 0) {
      console.log(`请求失败，重试: ${dataId}`);
      // 增加延迟重试，避免网络拥塞
      await new Promise(resolve => setTimeout(resolve, 1000));
      return this.requestData(dataId, timeoutMs, retries - 1);
    }
    throw error;
  }
}

  // 存储本地数据
  storeLocalData(dataId, data) {
    this.localData.set(dataId, data);
  }

  // 获取本地数据
  getLocalData(dataId) {
    return this.localData.get(dataId);
  }
  
  // 缓存数据
  cacheData(dataId, data) {
    this.dataCache.set(dataId, data);
  }
  
  // 清除缓存
  clearCache() {
    this.dataCache.reset();
  }
  
  // 根据用户ID请求用户数据
  async requestUserData(userId) {
    // 用户ID作为数据ID的前缀
    const dataId = `user:${userId}`;
    return this.requestData(dataId);
  }
  
  // 根据物品ID请求物品数据
  async requestItemData(itemId) {
    const dataId = `item:${itemId}`;
    return this.requestData(dataId);
  }
  
  // 根据交易ID请求交易数据
  async requestOfferData(offerId) {
    const dataId = `offer:${offerId}`;
    return this.requestData(dataId);
  }
}

module.exports = DataRouter;