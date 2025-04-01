

// blockchain.js
const crypto = require('crypto');
const zlib = require('zlib');

class Block {
  constructor(timestamp, transactions, previousHash = '') {
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = this.calculateHash();
    this.nonce = 0;
    this.validator = null; // PoS验证者
    this.compressed = false; // 标记是否已压缩
  }

  calculateHash() {
    return crypto
      .createHash('sha256')
      .update(
        this.previousHash +
        this.timestamp +
        JSON.stringify(this.transactions) +
        this.nonce
      )
      .digest('hex');
  }
  
  // 压缩交易数据
  compressTransactions() {
    if (this.compressed) return; // 避免重复压缩
    
    const txData = JSON.stringify(this.transactions);
    const compressedData = zlib.deflateSync(txData).toString('base64');
    
    // 保存交易摘要和压缩数据
    this.transactionSummary = {
      count: this.transactions.length,
      types: [...new Set(this.transactions.map(tx => tx.type))],
      compressedData: compressedData
    };
    
    // 清空原始交易数据，只保留摘要
    this.transactions = [];
    this.compressed = true;
  }
  
  // 解压交易数据
  decompressTransactions() {
    if (!this.compressed || !this.transactionSummary) return;
    
    const compressedData = this.transactionSummary.compressedData;
    const buffer = Buffer.from(compressedData, 'base64');
    const decompressedData = zlib.inflateSync(buffer).toString();
    
    this.transactions = JSON.parse(decompressedData);
    this.compressed = false;
  }
}

class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.pendingTransactions = [];
    this.validators = new Map(); // 存储验证者及其权益
    this.difficulty = 2; // 初始难度
    this.miningReward = 10; // 验证奖励
    this.shards = new Map(); // 存储分片数据
  }

  createGenesisBlock() {
    return new Block(Date.now(), [], "0");
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  // PoS共识机制
  selectValidator() {
    // 根据权益比例选择验证者
    const totalStake = Array.from(this.validators.values()).reduce((a, b) => a + b, 0);
    let r = Math.random() * totalStake;
    let sum = 0;
    
    for (const [validator, stake] of this.validators.entries()) {
      sum += stake;
      if (r <= sum) return validator;
    }
    
    return Array.from(this.validators.keys())[0]; // 默认第一个
  }

  // 添加验证者
  addValidator(address, stake) {
    this.validators.set(address, (this.validators.get(address) || 0) + stake);
  }

  // 创建新区块
  minePendingTransactions(validatorAddress) {
    console.log(`开始由验证者 ${validatorAddress} 创建新区块`);
    console.log(`待处理交易数量: ${this.pendingTransactions.length}`);
    
    // 确保验证者有权益
    if (!this.validators.has(validatorAddress) || this.validators.get(validatorAddress) <= 0) {
      throw new Error('无效的验证者或权益不足');
    }

    const block = new Block(
      Date.now(),
      this.pendingTransactions,
      this.getLatestBlock().hash
    );
    
    block.validator = validatorAddress;
    block.hash = block.calculateHash();
    
    console.log('区块被挖出:', block);
    
    this.chain.push(block);
    
    // 重置待处理交易并添加奖励交易
    this.pendingTransactions = [
      {
        from: null,
        to: validatorAddress,
        type: 'REWARD',
        amount: this.miningReward
      }
    ];
    
    // 自动压缩旧区块
    this.compressOldBlocks();
    
    console.log(`区块已创建，哈希值: ${block.hash}`);
    console.log(`区块链现在有 ${this.chain.length} 个区块`);
    console.log(`验证者 ${validatorAddress} 获得了 ${this.miningReward} 个代币奖励`);
  }

  // 添加交易
  addTransaction(transaction) {
    // 验证交易
    if (!transaction.from || !transaction.to || !transaction.type) {
      throw new Error('交易缺少关键字段');
    }
    
    // 验证签名
    if (!this.verifyTransactionSignature(transaction)) {
      throw new Error('交易签名无效');
    }
    
    // 添加分片ID
    if (transaction.from) {
      transaction.shardId = this.getShardId(transaction.from);
    }
    
    this.pendingTransactions.push(transaction);
    return this.getLatestBlock().index + 1;
  }

  // 验证交易签名
  verifyTransactionSignature(transaction) {
    // 实际实现中需要使用公钥验证签名
    // 这里简化处理
    return true;
  }

  // 验证区块链完整性
  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }
  
  // 压缩旧区块
  compressOldBlocks() {
    const keepUncompressedCount = 100; // 保留最新的100个区块不压缩
    
    if (this.chain.length <= keepUncompressedCount) return;
    
    for (let i = 0; i < this.chain.length - keepUncompressedCount; i++) {
      const block = this.chain[i];
      if (!block.compressed) {
        block.compressTransactions();
      }
    }
  }
  
  // 获取分片ID
  getShardId(userId) {
    // 简单的分片策略：基于用户ID的哈希值
    const hash = crypto.createHash('md5').update(userId.toString()).digest('hex');
    return hash.substring(0, 2); // 使用前两位作为分片ID
  }
  
  // 添加交易到分片
  addTransactionToShard(transaction) {
    const shardId = transaction.shardId || this.getShardId(transaction.from);
    
    if (!this.shards.has(shardId)) {
      this.shards.set(shardId, []);
    }
    
    const shard = this.shards.get(shardId);
    shard.push(transaction);
    
    // 如果分片过大，可以进一步压缩或存储到数据库
    if (shard.length > 1000) {
      this.persistShardToDatabase(shardId);
    }
  }
  
  // 将分片持久化到数据库
  persistShardToDatabase(shardId) {
    // 实际实现中，这里应该将分片数据存储到数据库
    console.log(`将分片 ${shardId} 持久化到数据库`);
    
    // 清空内存中的分片数据
    this.shards.set(shardId, []);
  }
  
  // 从分片中查询交易
  getTransactionsFromShard(shardId, filter = {}) {
    // 实际实现中，这里应该从数据库中查询分片数据
    const shard = this.shards.get(shardId) || [];
    
    // 应用过滤条件
    return shard.filter(tx => {
      for (const [key, value] of Object.entries(filter)) {
        if (tx[key] !== value) return false;
      }
      return true;
    });
  }
  
  // 根据用户ID查询交易
  getUserTransactions(userId) {
    const shardId = this.getShardId(userId);
    return this.getTransactionsFromShard(shardId, { from: userId });
  }

  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      console.log('收到的区块链不比当前链长，不替换');
      return;
    }
    
    if (!this.isValidChain(newChain)) {
      console.log('收到的区块链无效，不替换');
      return;
    }
    
    console.log('替换区块链为新接收的区块链');
    this.chain = newChain;
    this.pendingTransactions = []; // 清空待处理交易
  }

  isValidChain(chain) {
    if (JSON.stringify(chain[0]) !== JSON.stringify(this.createGenesisBlock())) {
      return false;
    }
    
    for (let i = 1; i < chain.length; i++) {
      if (!this.isValidNewBlock(chain[i], chain[i - 1])) {
        return false;
      }
    }
    
    return true;
  }

  isValidNewBlock(newBlock, previousBlock) {
    if (previousBlock.hash !== newBlock.previousHash) {
      console.log('新区块的previousHash不匹配');
      return false;
    }
    
    if (newBlock.hash !== newBlock.calculateHash()) {
      console.log('新区块的哈希值无效');
      return false;
    }
    
    return true;
  }

  isValidTransaction(transaction) {
    // 验证交易签名和其他字段
    if (!transaction.from || !transaction.to || !transaction.type) {
      return false;
    }
    
    // 验证签名
    return this.verifyTransactionSignature(transaction);
  }
}

module.exports = { Block, Blockchain };
