// models/item.js
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // 添加索引以加速查询
  },
  name: String,
  description: String,
  images: [String],
  status: {
    type: String,
    enum: ['AVAILABLE', 'PENDING', 'EXCHANGED'],
    default: 'AVAILABLE'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // 分片字段
  shardId: {
    type: String,
    required: true,
    index: true
  }
});

// 创建复合索引
itemSchema.index({ userId: 1, shardId: 1 });

// 根据分片ID创建不同的集合
const getItemModel = (shardId) => {
  return mongoose.model(`Items_${shardId}`, itemSchema, `items_${shardId}`);
};

module.exports = { getItemModel };