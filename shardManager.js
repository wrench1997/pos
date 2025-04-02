
// shardManager.js
const crypto = require('crypto');

class ShardManager {
  constructor(p2pNetwork, dbManager) {
    this.p2pNetwork = p2pNetwork;
    this.dbManager = dbManager;
    this.shardCount = 16; // 分片数量，可以根据需要调整
    this.localShards = new Set(); // 本节点负责的分片
  }
  
  // 获取用户的分片ID
  getUserShardId(userId) {
    // 使用用户ID的哈希值的前两位十六进制数作为分片ID
    const hash = crypto.createHash('md5').update(userId.toString()).digest('hex');
    return hash.substring(0, 2);
  }
  
  // 添加物品到用户的分片
  async addItemToUserShard(userId, itemData) {
    const shardId = this.getUserShardId(userId);
    
    const item = {
      ...itemData,
      userId,
      shardId,
      createdAt: Date.now()
    };
    
    return await this.dbManager.saveItem(shardId, item);
  }
  
  // 获取用户的所有物品
  async getUserItems(userId) {
    const shardId = this.getUserShardId(userId);
    return await this.dbManager.getItemsInShard(shardId, { userId });
  }
  
  // 更新物品状态
  async updateItemStatus(userId, itemId, newStatus) {
    const shardId = this.getUserShardId(userId);
    return await this.dbManager.updateItem(shardId, itemId, { status: newStatus });
  }
  
  // 跨分片查询（性能较低，应尽量避免）
  async crossShardQuery(filter) {
    const results = [];
    
    // 并行查询所有分片
    const queries = [];
    for (let i = 0; i < 256; i++) {
      const shardId = i.toString(16).padStart(2, '0'); // 转为两位十六进制
      queries.push(this.dbManager.getItemsInShard(shardId, filter));
    }
    
    // 等待所有查询完成
    const shardResults = await Promise.all(queries);
    
    // 合并结果
    shardResults.forEach(items => {
      results.push(...items);
    });
    
    return results;
  }
  
  // 获取所有可用物品（用于交换市场）
  async getAllAvailableItems() {
    return await this.crossShardQuery({ status: 'AVAILABLE' });
  }
}

module.exports = ShardManager;