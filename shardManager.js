// shardManager.js
const crypto = require('crypto');

class ShardManager {
  constructor(p2pNetwork, dbManager, dataRouter) {
    this.p2pNetwork = p2pNetwork;
    this.dbManager = dbManager;
    this.dataRouter = dataRouter;
    this.localShards = new Set(); // 本地负责的分片
    this.shardData = new Map(); // 分片数据
    
    // 初始化本地负责的分片
    this.initLocalShards();
    
    // 注册消息处理器
    this.setupMessageHandlers();
  }

  // 初始化本地负责的分片
  initLocalShards() {
    // 基于节点ID确定负责的分片
    const nodeIdHash = crypto.createHash('md5').update(this.p2pNetwork.nodeId).digest('hex');
    
    // 简单策略：每个节点负责2个分片
    this.localShards.add(nodeIdHash.substring(0, 2));
    this.localShards.add(nodeIdHash.substring(2, 4));
    
    console.log(`节点负责的分片: ${Array.from(this.localShards).join(', ')}`);
  }

  // 设置消息处理器
  setupMessageHandlers() {
    // 处理分片数据请求
    this.p2pNetwork.messageHandlers.set('SHARD_DATA_REQUEST', (socket, message) => {
      const { shardId, requesterId, requestId } = message.data;
      
      // 检查是否负责该分片
      if (this.localShards.has(shardId)) {
        const shardData = this.getShardData(shardId);
        
        // 响应请求
        this.p2pNetwork.sendMessage(socket, {
          type: 'SHARD_DATA_RESPONSE',
          data: {
            shardId,
            requestId,
            data: shardData,
            found: true
          }
        });
      }
    });
    
    // 处理分片数据响应
    this.p2pNetwork.messageHandlers.set('SHARD_DATA_RESPONSE', (socket, message) => {
      const { shardId, requestId, data, found } = message.data;
      
      if (found && data) {
        // 更新本地分片数据
        this.updateShardData(shardId, data);
      }
    });
  }

  // 获取分片ID
  getShardId(userId) {
    return this.p2pNetwork.blockchain.getShardId(userId);
  }

  // 添加物品到用户分片
  async addItemToUserShard(userId, itemData) {
    const shardId = this.getShardId(userId);
    
    // 添加用户ID和分片ID到物品数据
    itemData.userId = userId;
    itemData.shardId = shardId;
    
    // 如果是本地负责的分片，直接存储
    if (this.localShards.has(shardId)) {
      const item = await this.dbManager.saveItem(shardId, itemData);
      
      // 更新分片数据
      this.addToShardData(shardId, 'items', item);
      
      // 通过数据路由器存储
      this.dataRouter.storeLocalData(`item:${item.id}`, item);
      
      return item;
    } else {
      // 如果不是本地负责的分片，通过数据路由请求
      // 首先存储到数据库
      const item = await this.dbManager.saveItem(shardId, itemData);
      
      // 广播物品添加消息
      this.p2pNetwork.broadcast({
        type: 'ITEM_ADDED',
        data: {
          shardId,
          item
        }
      });
      
      return item;
    }
  }

  // 获取用户物品
async getUserItems(userId) {
  const shardId = this.getShardId(userId);
  console.log(`获取用户物品, 用户ID: ${userId}, 分片ID: ${shardId}`);
  
  // 尝试从多个来源获取数据
  let items = [];
  let errors = [];
  
  // 1. 首先尝试从本地分片获取
  if (this.localShards.has(shardId)) {
    try {
      console.log(`从本地分片获取物品: ${shardId}`);
      items = await this.dbManager.getItemsInShard(shardId, { userId });
      if (items && items.length > 0) {
        console.log(`从本地分片找到 ${items.length} 个物品`);
        return items;
      }
    } catch (error) {
      console.error(`从本地分片获取失败: ${error.message}`);
      errors.push(error);
    }
  }
  
  // 2. 尝试从分片数据获取
  try {
    console.log(`请求分片数据: ${shardId}`);
    const shardData = await this.requestShardData(shardId);
    
    if (shardData && shardData.items) {
      // 过滤出用户的物品
      const shardItems = Object.values(shardData.items).filter(item => item.userId === userId);
      if (shardItems.length > 0) {
        console.log(`从分片数据找到 ${shardItems.length} 个物品`);
        return shardItems;
      }
    }
  } catch (error) {
    console.error(`请求分片数据失败: ${error.message}`);
    errors.push(error);
  }
  
  // 3. 尝试从数据路由获取
  try {
    console.log(`通过数据路由获取用户物品: ${userId}`);
    const userData = await this.dataRouter.requestUserData(userId);
    if (userData && userData.items) {
      console.log(`从用户数据找到 ${userData.items.length} 个物品`);
      return userData.items;
    }
  } catch (error) {
    console.error(`通过数据路由获取失败: ${error.message}`);
    errors.push(error);
  }
  
  // 4. 最后尝试从数据库获取
  try {
    console.log(`从数据库获取物品: ${shardId}`);
    items = await this.dbManager.getItemsInShard(shardId, { userId });
    if (items && items.length > 0) {
      console.log(`从数据库找到 ${items.length} 个物品`);
      return items;
    }
  } catch (error) {
    console.error(`从数据库获取失败: ${error.message}`);
    errors.push(error);
  }
  
  // 如果所有尝试都失败，返回空数组并记录错误
  if (errors.length > 0) {
    console.error(`获取用户物品失败，尝试了 ${errors.length} 种方法`);
  }
  
  return [];
}

  // 更新物品状态
  async updateItemStatus(userId, itemId, status) {
    const shardId = this.getShardId(userId);
    
    // 更新数据库
    await this.dbManager.updateItem(shardId, itemId, { status });
    
    // 如果是本地负责的分片，更新分片数据
    if (this.localShards.has(shardId)) {
      this.updateShardItemStatus(shardId, itemId, status);
    }
    
    // 广播物品状态更新
    this.p2pNetwork.broadcast({
      type: 'ITEM_STATUS_UPDATED',
      data: {
        shardId,
        itemId,
        status
      }
    });
  }

  // 获取所有可用物品
  async getAllAvailableItems() {
    const allItems = [];
    
    // 从本地负责的分片获取
    for (const shardId of this.localShards) {
      const items = await this.dbManager.getItemsInShard(shardId, { status: 'AVAILABLE' });
      allItems.push(...items);
    }
    
    // 从其他分片获取
    // 这里可以优化为并行请求
    for (let i = 0; i < 256; i++) {
      const shardId = i.toString(16).padStart(2, '0');
      
      if (!this.localShards.has(shardId)) {
        try {
          const shardData = await this.requestShardData(shardId);
          
          if (shardData && shardData.items) {
            const availableItems = Object.values(shardData.items)
              .filter(item => item.status === 'AVAILABLE');
            
            allItems.push(...availableItems);
          }
        } catch (error) {
          // 忽略错误，继续处理其他分片
          console.error(`获取分片 ${shardId} 数据失败: ${error.message}`);
        }
      }
    }
    
    return allItems;
  }

  // 在shardManager.js中修改requestShardData方法
  async requestShardData(shardId, timeoutMs = 50000) {
    // 创建请求ID
    const requestId = crypto.randomBytes(8).toString('hex');
    
    // 广播分片数据请求
    this.p2pNetwork.broadcast({
      type: 'SHARD_DATA_REQUEST',
      data: {
        shardId,
        requesterId: this.p2pNetwork.nodeId,
        requestId
      }
    });
    
    // 等待响应
    return new Promise((resolve, reject) => {
      // 创建一个临时消息处理函数
      const responseHandler = (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          if (parsedMessage.type === 'SHARD_DATA_RESPONSE' && 
              parsedMessage.data.requestId === requestId) {
            // 移除所有socket的监听器
            this.p2pNetwork.sockets.forEach(s => {
              s.removeListener('message', responseHandler);
            });
            
            if (parsedMessage.data.found) {
              resolve(parsedMessage.data.data);
            } else {
              reject(new Error(`分片 ${shardId} 数据未找到`));
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      };
      
      // 为所有socket添加临时消息处理器
      this.p2pNetwork.sockets.forEach(s => {
        if (s && s.readyState === WebSocket.OPEN) {
          s.on('message', responseHandler);
        }
      });
      
      setTimeout(() => {
        // 移除所有socket的监听器
        this.p2pNetwork.sockets.forEach(s => {
          if (s) s.removeListener('message', responseHandler);
        });
        reject(new Error('分片数据请求超时'));
      }, timeoutMs);
    });
  }

  // 获取分片数据
  getShardData(shardId) {
    return this.shardData.get(shardId) || { items: {} };
  }

  // 更新分片数据
  updateShardData(shardId, data) {
    this.shardData.set(shardId, data);
  }

  // 添加数据到分片
  addToShardData(shardId, dataType, data) {
    if (!this.shardData.has(shardId)) {
      this.shardData.set(shardId, {});
    }
    
    const shardData = this.shardData.get(shardId);
    
    if (!shardData[dataType]) {
      shardData[dataType] = {};
    }
    
    shardData[dataType][data.id] = data;
  }

  // 更新分片中物品状态
  updateShardItemStatus(shardId, itemId, status) {
    if (!this.shardData.has(shardId)) return;
    
    const shardData = this.shardData.get(shardId);
    
    if (shardData.items && shardData.items[itemId]) {
      shardData.items[itemId].status = status;
    }
  }
}

module.exports = ShardManager;