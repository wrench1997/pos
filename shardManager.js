// shardManager.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const { getItemModel } = require('./models/item');

class ShardManager {
  constructor() {
    this.shardMap = new Map(); // 缓存分片模型
    this.shardCount = 16; // 分片数量，可以根据需要调整
  }
  
  // 获取用户的分片ID
  getUserShardId(userId) {
    // 使用用户ID的哈希值的前两位十六进制数作为分片ID
    const hash = crypto.createHash('md5').update(userId.toString()).digest('hex');
    return hash.substring(0, 2);
  }
  
  // 获取特定分片的Item模型
  getItemModelForShard(shardId) {
    if (!this.shardMap.has(shardId)) {
      this.shardMap.set(shardId, getItemModel(shardId));
    }
    return this.shardMap.get(shardId);
  }
  
  // 获取用户的Item模型
  getItemModelForUser(userId) {
    const shardId = this.getUserShardId(userId);
    return this.getItemModelForShard(shardId);
  }
  
  // 添加物品到用户的分片
  async addItemToUserShard(userId, itemData) {
    const ItemModel = this.getItemModelForUser(userId);
    const shardId = this.getUserShardId(userId);
    
    const item = new ItemModel({
      ...itemData,
      userId,
      shardId
    });
    
    return await item.save();
  }
  
  // 获取用户的所有物品
  async getUserItems(userId) {
    const ItemModel = this.getItemModelForUser(userId);
    const shardId = this.getUserShardId(userId);
    
    return await ItemModel.find({ userId, shardId });
  }
  
  // 更新物品状态
  async updateItemStatus(userId, itemId, newStatus) {
    const ItemModel = this.getItemModelForUser(userId);
    const shardId = this.getUserShardId(userId);
    
    return await ItemModel.findOneAndUpdate(
      { _id: itemId, userId, shardId },
      { $set: { status: newStatus } },
      { new: true }
    );
  }
  
  // 跨分片查询（性能较低，应尽量避免）
  async crossShardQuery(filter) {
    const results = [];
    
    // 并行查询所有分片
    const queries = [];
    for (let i = 0; i < this.shardCount; i++) {
      const shardId = i.toString(16).padStart(2, '0'); // 转为两位十六进制
      const ItemModel = this.getItemModelForShard(shardId);
      queries.push(ItemModel.find(filter).exec());
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