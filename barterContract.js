

// barterContract.js
const crypto = require('crypto');

class BarterContract {
  constructor(blockchain, p2pNetwork, dataRouter) {
    this.blockchain = blockchain;
    this.p2pNetwork = p2pNetwork;
    this.dataRouter = dataRouter;
    this.barterOffers = new Map(); // 存储交换提议
    this.completedBarters = []; // 已完成的交换
    this.userReputations = new Map(); // 用户信誉系统
    
    // 分片存储
    this.offerShards = new Map(); // 按分片存储提议
    
    // 添加事件监听
    this.setupEventListeners();
  }

  // 添加事件监听方法
  setupEventListeners() {
    // 监听来自P2P网络的合约相关消息
    this.p2pNetwork.messageHandlers.set('CONTRACT_OFFER', (socket, message) => {
      const offer = message.data;
      this.syncOffer(offer);
    });
    
    this.p2pNetwork.messageHandlers.set('CONTRACT_RESPONSE', (socket, message) => {
      const { offerId, response } = message.data;
      this.syncOfferResponse(offerId, response);
    });
    
    this.p2pNetwork.messageHandlers.set('CONTRACT_CONFIRM', (socket, message) => {
      const { offerId, confirmation } = message.data;
      this.syncOfferConfirmation(offerId, confirmation);
    });
    
    this.p2pNetwork.messageHandlers.set('REPUTATION_UPDATE', (socket, message) => {
      const { userId, reputation } = message.data;
      this.syncReputation(userId, reputation);
    });
  }

  // 同步交换提议
  syncOffer(offer) {
    if (!this.barterOffers.has(offer.id)) {
      this.barterOffers.set(offer.id, offer);
      
      // 添加到分片存储
      if (!this.offerShards.has(offer.shardId)) {
        this.offerShards.set(offer.shardId, new Map());
      }
      this.offerShards.get(offer.shardId).set(offer.id, offer);
    }
  }

  // 同步提议响应
  syncOfferResponse(offerId, response) {
    if (this.barterOffers.has(offerId)) {
      const offer = this.barterOffers.get(offerId);
      
      // 更新提议
      offer.responder = response.responder;
      offer.responderItem = response.responderItem;
      offer.status = 'PENDING_APPROVAL';
      offer.responderShardId = response.responderShardId;
      
      this.barterOffers.set(offerId, offer);
      
      // 更新分片存储
      if (this.offerShards.has(offer.shardId)) {
        this.offerShards.get(offer.shardId).set(offerId, offer);
      }
    }
  }

  // 同步提议确认
  syncOfferConfirmation(offerId, confirmation) {
    if (this.barterOffers.has(offerId)) {
      const offer = this.barterOffers.get(offerId);
      
      // 更新提议
      offer.status = confirmation.status;
      offer.confirmedAt = confirmation.confirmedAt;
      
      this.barterOffers.set(offerId, offer);
      
      if (confirmation.status === 'CONFIRMED') {
        this.completedBarters.push(offer);
      }
      
      // 更新分片存储
      if (this.offerShards.has(offer.shardId)) {
        this.offerShards.get(offer.shardId).set(offerId, offer);
      }
    }
  }

  // 同步信誉
  syncReputation(userId, reputation) {
    this.userReputations.set(userId, reputation);
  }

  // 获取分片ID
  getShardId(userId) {
    return this.blockchain.getShardId(userId);
  }

  // 创建物品交换提议
  createBarterOffer(userId, itemOffered, itemWanted, description) {
    const offerId = crypto.randomBytes(16).toString('hex');
    const shardId = this.getShardId(userId);
    
    const offer = {
      id: offerId,
      creator: userId,
      itemOffered: {
        id: itemOffered.id || crypto.randomBytes(8).toString('hex'),
        name: itemOffered.name,
        description: itemOffered.description,
        verified: false
      },
      itemWanted: {
        description: itemWanted
      },
      status: 'OPEN',
      createdAt: Date.now(),
      description: description,
      shardId: shardId
    };
    
    this.barterOffers.set(offerId, offer);
    
    // 添加到分片存储
    if (!this.offerShards.has(shardId)) {
      this.offerShards.set(shardId, new Map());
    }
    this.offerShards.get(shardId).set(offerId, offer);
    
    // 记录到区块链
    const transaction = {
      from: userId,
      to: null,
      type: 'CREATE_OFFER',
      data: offer,
      timestamp: Date.now(),
      signature: 'signed', // 实际应用中需要真实签名
      shardId: shardId
    };
    
    this.blockchain.addTransaction(transaction);
    
    // 广播到P2P网络
    this.p2pNetwork.broadcast({
      type: 'CONTRACT_OFFER',
      data: offer
    });
    
    return offerId;
  }

  // 获取交换提议（使用数据路由）
  async getOffer(offerId) {
    // 首先检查本地缓存
    if (this.barterOffers.has(offerId)) {
      return this.barterOffers.get(offerId);
    }
    
    // 如果本地没有，通过数据路由请求
    try {
      const offer = await this.dataRouter.requestOfferData(offerId);
      
      if (offer) {
        // 更新本地缓存
        this.barterOffers.set(offerId, offer);
        
        // 如果有分片ID，更新分片存储
        if (offer.shardId && !this.offerShards.has(offer.shardId)) {
          this.offerShards.set(offer.shardId, new Map());
        }
        
        if (offer.shardId) {
          this.offerShards.get(offer.shardId).set(offerId, offer);
        }
        
        return offer;
      }
    } catch (error) {
      console.error(`获取交换提议失败: ${error.message}`);
    }
    
    return null;
  }

  // 响应交换提议（修改为异步方法）
  async respondToOffer(offerId, responderId, itemOffered) {
    // 获取提议，可能需要通过数据路由
    const offer = await this.getOffer(offerId);
    
    if (!offer) {
      throw new Error('提议不存在');
    }
    
    const responderShardId = this.getShardId(responderId);
    
    if (offer.status !== 'OPEN') {
      throw new Error('此提议已不再开放');
    }
    
    // 更新提议状态
    offer.responder = responderId;
    offer.responderItem = {
      id: itemOffered.id || crypto.randomBytes(8).toString('hex'),
      name: itemOffered.name,
      description: itemOffered.description,
      verified: false
    };
    offer.status = 'PENDING_APPROVAL';
    offer.responderShardId = responderShardId;
    
    this.barterOffers.set(offerId, offer);
    
    // 更新分片存储
    if (this.offerShards.has(offer.shardId)) {
      this.offerShards.get(offer.shardId).set(offerId, offer);
    }
    
    // 记录到区块链
    this.blockchain.addTransaction({
      from: responderId,
      to: offer.creator,
      type: 'RESPOND_OFFER',
      data: {
        offerId,
        responderItem: offer.responderItem
      },
      timestamp: Date.now(),
      signature: 'signed', // 实际应用中需要真实签名
      shardId: responderShardId
    });
    
    // 广播到P2P网络
    this.p2pNetwork.broadcast({
      type: 'CONTRACT_RESPONSE',
      data: {
        offerId,
        response: {
          responder: responderId,
          responderItem: offer.responderItem,
          responderShardId: responderShardId
        }
      }
    });
    
    // 通过数据路由存储更新后的提议
    this.dataRouter.storeLocalData(`offer:${offerId}`, offer);
    
    return true;
  }

  // 确认交换（修改为异步方法）
  async confirmBarter(offerId, userId) {
    // 获取提议，可能需要通过数据路由
    const offer = await this.getOffer(offerId);
    
    if (!offer) {
      throw new Error('提议不存在');
    }
    
    if (offer.creator !== userId) {
      throw new Error('只有创建者可以确认交换');
    }
    
    if (offer.status !== 'PENDING_APPROVAL') {
      throw new Error('此提议无法确认');
    }
    
    // 更新提议状态
    offer.status = 'CONFIRMED';
    offer.confirmedAt = Date.now();
    
    this.barterOffers.set(offerId, offer);
    this.completedBarters.push(offer);
    
    // 更新分片存储
    if (this.offerShards.has(offer.shardId)) {
      this.offerShards.get(offer.shardId).set(offerId, offer);
    }
    
    // 更新用户信誉
    this.updateReputation(offer.creator, 1);
    this.updateReputation(offer.responder, 1);
    
    // 记录到区块链
    this.blockchain.addTransaction({
      from: userId,
      to: offer.responder,
      type: 'CONFIRM_BARTER',
      data: {
        offerId,
        status: 'CONFIRMED'
      },
      timestamp: Date.now(),
      signature: 'signed', // 实际应用中需要真实签名
      shardId: offer.shardId
    });
    
    // 广播到P2P网络
    this.p2pNetwork.broadcast({
      type: 'CONTRACT_CONFIRM',
      data: {
        offerId,
        confirmation: {
          status: 'CONFIRMED',
          confirmedAt: offer.confirmedAt
        }
      }
    });
    
    // 通过数据路由存储更新后的提议
    this.dataRouter.storeLocalData(`offer:${offerId}`, offer);
    
    return true;
  }

  // 取消交换
  cancelBarter(offerId, userId) {
    if (!this.barterOffers.has(offerId)) {
      throw new Error('提议不存在');
    }
    
    const offer = this.barterOffers.get(offerId);
    
    if (offer.creator !== userId && offer.responder !== userId) {
      throw new Error('只有参与者可以取消交换');
    }
    
    if (offer.status === 'CONFIRMED' || offer.status === 'COMPLETED') {
      throw new Error('已确认或完成的交换无法取消');
    }
    
    // 更新提议状态
    offer.status = 'CANCELLED';
    offer.cancelledAt = Date.now();
    offer.cancelledBy = userId;
    
    this.barterOffers.set(offerId, offer);
    
    // 更新分片存储
    this.offerShards.get(offer.shardId).set(offerId, offer);
    
    // 记录到区块链
    this.blockchain.addTransaction({
      from: userId,
      to: userId === offer.creator ? offer.responder : offer.creator,
      type: 'CANCEL_BARTER',
      data: {
        offerId,
        status: 'CANCELLED'
      },
      timestamp: Date.now(),
      signature: 'signed', // 实际应用中需要真实签名
      shardId: this.getShardId(userId)
    });
    
    // 广播到P2P网络
    this.p2pNetwork.broadcast({
      type: 'CONTRACT_CONFIRM',
      data: {
        offerId,
        confirmation: {
          status: 'CANCELLED',
          cancelledAt: offer.cancelledAt,
          cancelledBy: userId
        }
      }
    });
    
    return true;
  }

  // 完成交换并评价
  completeBarter(offerId, userId, rating, review) {
    if (!this.barterOffers.has(offerId)) {
      throw new Error('提议不存在');
    }
    
    const offer = this.barterOffers.get(offerId);
    
    if (offer.creator !== userId && offer.responder !== userId) {
      throw new Error('只有参与者可以完成交换');
    }
    
    if (offer.status !== 'CONFIRMED') {
      throw new Error('只有已确认的交换可以标记为完成');
    }
    
    // 更新提议状态
    if (!offer.ratings) {
      offer.ratings = {};
      offer.reviews = {};
    }
    
    const otherParty = userId === offer.creator ? offer.responder : offer.creator;
    
    offer.ratings[otherParty] = rating;
    offer.reviews[otherParty] = review;
    
    // 如果双方都已评价，则标记为完成
    if (Object.keys(offer.ratings).length === 2) {
      offer.status = 'COMPLETED';
      offer.completedAt = Date.now();
      
      // 广播完成状态
      this.p2pNetwork.broadcast({
        type: 'CONTRACT_CONFIRM',
        data: {
          offerId,
          confirmation: {
            status: 'COMPLETED',
            completedAt: offer.completedAt
          }
        }
      });
    }
    
    this.barterOffers.set(offerId, offer);
    
    // 更新分片存储
    this.offerShards.get(offer.shardId).set(offerId, offer);
    
    // 更新用户信誉
    this.updateReputation(otherParty, rating);
    
    // 记录到区块链
    this.blockchain.addTransaction({
      from: userId,
      to: otherParty,
      type: 'RATE_BARTER',
      data: {
        offerId,
        rating,
        review
      },
      timestamp: Date.now(),
      signature: 'signed', // 实际应用中需要真实签名
      shardId: this.getShardId(userId)
    });
    
    // 广播评价信息
    this.p2pNetwork.broadcast({
      type: 'REPUTATION_UPDATE',
      data: {
        userId: otherParty,
        reputation: this.getUserReputation(otherParty)
      }
    });
    
    return true;
  }

  // 更新用户信誉
  updateReputation(userId, rating) {
    const currentRep = this.userReputations.get(userId) || {
      total: 0,
      count: 0,
      average: 0
    };
    
    currentRep.total += rating;
    currentRep.count += 1;
    currentRep.average = currentRep.total / currentRep.count;
    
    this.userReputations.set(userId, currentRep);
  }

  // 获取用户信誉
  getUserReputation(userId) {
    return this.userReputations.get(userId) || {
      total: 0,
      count: 0,
      average: 0
    };
  }

  // 获取所有开放的交换提议
  getOpenOffers() {
    return Array.from(this.barterOffers.values())
      .filter(offer => offer.status === 'OPEN');
  }

  // 获取特定分片的开放提议
  getOpenOffersInShard(shardId) {
    if (!this.offerShards.has(shardId)) return [];
    
    return Array.from(this.offerShards.get(shardId).values())
      .filter(offer => offer.status === 'OPEN');
  }

  // 获取用户的交换历史
  getUserBarterHistory(userId) {
    const shardId = this.getShardId(userId);
    
    // 首先检查用户所在分片
    let userOffers = [];
    if (this.offerShards.has(shardId)) {
      userOffers = Array.from(this.offerShards.get(shardId).values())
        .filter(offer => offer.creator === userId || offer.responder === userId);
    }
    
    // 然后检查其他分片（如果用户参与了跨分片交易）
    for (const [otherShardId, offers] of this.offerShards.entries()) {
      if (otherShardId === shardId) continue;
      
      const otherShardOffers = Array.from(offers.values())
        .filter(offer => offer.creator === userId || offer.responder === userId);
      
      userOffers.push(...otherShardOffers);
    }
    
    return userOffers;
  }
  
  // 定期清理旧数据
  pruneOldData(ageThresholdDays = 30) {
    const now = Date.now();
    const ageThreshold = now - (ageThresholdDays * 24 * 60 * 60 * 1000);
    
    // 清理已完成或取消的旧提议
    for (const [offerId, offer] of this.barterOffers.entries()) {
      if ((offer.status === 'COMPLETED' || offer.status === 'CANCELLED') && 
          offer.createdAt < ageThreshold) {
        // 从主存储中移除
        this.barterOffers.delete(offerId);
        
        // 从分片存储中移除
        if (this.offerShards.has(offer.shardId)) {
          this.offerShards.get(offer.shardId).delete(offerId);
        }
      }
    }
  }
}

module.exports = BarterContract;
