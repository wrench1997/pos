// models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  publicKey: {
    type: String,
    required: true
  },
  walletAddress: {
    type: String,
    required: true,
    unique: true
  },
  stake: {
    type: Number,
    default: 10
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // 移除items数组，改为引用
  shardId: {
    type: String,
    default: function() {
      // 基于用户ID生成分片ID
      return this._id.toString().substr(-2); // 使用ID的最后两位作为分片ID
    }
  }
});

module.exports = mongoose.model('User', userSchema);