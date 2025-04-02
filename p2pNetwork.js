
// p2pNetwork.js
const WebSocket = require('ws');
const crypto = require('crypto');

class P2PNetwork {
  constructor(blockchain, port = 6001) {
    this.blockchain = blockchain;
    this.sockets = [];
    this.peers = new Map(); // 存储对等节点信息
    this.port = port;
    this.nodeId = crypto.randomBytes(16).toString('hex');
    this.messageHandlers = new Map();
    // 注册消息处理器
    this.registerMessageHandlers();
  }

  // 初始化P2P服务器
  initP2PServer() {
    const server = new WebSocket.Server({ port: this.port });
    server.on('connection', socket => this.initConnection(socket));
    console.log(`P2P节点监听在: ${this.port}`);
    
    // 启动后尝试同步区块链
    // setTimeout(() => this.syncBlockchain(), 3000);
    
    return server;
  }

  // 连接到对等节点
  connectToPeers(newPeers) {
    newPeers.forEach(peer => {
      if (!this.peers.has(peer)) {
        const socket = new WebSocket(peer);
        socket.on('open', () => this.initConnection(socket, peer));
        socket.on('error', () => {
          console.log(`连接到对等节点失败: ${peer}`);
          this.peers.delete(peer);
        });
      }
    });
  }

  // 初始化连接
  initConnection(socket, peerUrl) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.log('尝试初始化未就绪的socket连接');
      return;
    }
    
    this.sockets.push(socket);
    if (peerUrl) {
      this.peers.set(peerUrl, { socket, lastSeen: Date.now() });
    }
    
    this.initMessageHandler(socket);
    this.initErrorHandler(socket);
    
    // 延迟发送握手消息
    setTimeout(() => {
      if (socket.readyState === WebSocket.OPEN) {
        this.sendHandshake(socket);
        // 请求最新区块链
        this.sendMessage(socket, { type: 'QUERY_LATEST' });
      }
    }, 500); // 500毫秒延迟
  }
  
  setShardManager(shardManager) {
    this.shardManager = shardManager;
  }
  // 初始化消息处理器
  initMessageHandler(socket) {
    socket.on('message', data => {
      try {
        const message = JSON.parse(data);
        console.log(`收到消息: ${message.type}`);
        
        if (this.messageHandlers.has(message.type)) {
          this.messageHandlers.get(message.type)(socket, message);
        } else {
          console.log(`未知消息类型: ${message.type}`);
        }
      } catch (e) {
        console.log('消息解析错误:', e);
      }
    });
  }
  // 在 P2PNetwork 类中添加
connectToPeersWithRetry(newPeers, maxRetries = 3) {
  newPeers.forEach(peer => {
    this.connectToPeerWithRetry(peer, maxRetries);
  });
}

connectToPeerWithRetry(peer, retriesLeft) {
  if (!this.peers.has(peer)) {
    const socket = new WebSocket(peer);
    
    socket.on('open', () => this.initConnection(socket, peer));
    
    socket.on('error', () => {
      console.log(`连接到对等节点失败: ${peer}, 剩余重试次数: ${retriesLeft}`);
      
      if (retriesLeft > 0) {
        setTimeout(() => {
          this.connectToPeerWithRetry(peer, retriesLeft - 1);
        }, 1000); // 1秒后重试
      } else {
        this.peers.delete(peer);
      }
    });
  }
}

// 在 P2PNetwork 类中添加
getLocalData(dataId) {
  // 如果 P2PNetwork 类本身不应该存储数据
  // 可以通过 dataRouter 来获取
  if (this.dataRouter) {
    return this.dataRouter.getLocalData(dataId);
  }
  return null;
}

// 添加设置 dataRouter 的方法
setDataRouter(dataRouter) {
  this.dataRouter = dataRouter;
}

  // 注册所有消息处理器
  registerMessageHandlers() {
    // 处理握手消息
    this.messageHandlers.set('HANDSHAKE', (socket, message) => {
      const { nodeId, port, address } = message.data;
      const peerUrl = `ws://${address}:${port}`;
      
      console.log(`收到来自 ${nodeId} 的握手消息`);
      this.peers.set(peerUrl, { 
        socket, 
        nodeId, 
        lastSeen: Date.now() 
      });
      // 回复握手确认
      this.sendMessage(socket, {
        type: 'HANDSHAKE_ACK',
        data: {
          nodeId: this.nodeId,
          port: this.port
        }
      });
    });

     // 在数据请求和响应处理中添加
     this.messageHandlers.set('DATA_REQUEST', (socket, message) => {
      const { dataId, requesterId, requestId } = message.data;
      console.log(`收到数据请求: ${dataId}, 请求ID: ${requestId}`);
      
      // 查找本地数据
      const data = this.getLocalData(dataId);
      console.log(`本地数据查找结果: ${dataId}, 找到: ${!!data}`);
      
      // 响应请求
      this.sendMessage(socket, {
        type: 'DATA_RESPONSE',
        data: {
          dataId,
          requestId,
          data: data || null,
          found: !!data
        }
      });
      console.log(`已发送数据响应: ${dataId}, 请求ID: ${requestId}`);
    });

      // 处理物品添加消息
    this.messageHandlers.set('ITEM_ADDED', (socket, message) => {
      const { shardId, item } = message.data;
      console.log(`收到物品添加消息，分片ID: ${shardId}, 物品ID: ${item.id}`);
      
      // 如果是本地负责的分片，更新分片数据
      //if (this.blockchain &&  this.shardManager.localShards.has(shardId)) {
        this.shardManager.addToShardData(shardId, 'items', item);
      //}
    });

    // 处理物品状态更新消息
    this.messageHandlers.set('ITEM_STATUS_UPDATED', (socket, message) => {
      const { shardId, itemId, status } = message.data;
      console.log(`收到物品状态更新消息，分片ID: ${shardId}, 物品ID: ${itemId}, 状态: ${status}`);
      // 如果是本地负责的分片，更新分片数据
      //if (this.blockchain && this.shardManager.localShards.has(shardId)) {
        this.shardManager.updateShardItemStatus(shardId, itemId, status);
      //}
      });



    
    // 处理握手确认消息
    this.messageHandlers.set('HANDSHAKE_ACK', (socket, message) => {
      const { nodeId } = message.data;
      console.log(`收到来自 ${nodeId} 的握手确认消息`);
      
      // 更新对等节点信息
      for (const [url, peer] of this.peers.entries()) {
        if (peer.socket === socket) {
          peer.nodeId = nodeId;
          peer.lastSeen = Date.now();
          this.peers.set(url, peer);
          break;
        }
      }
    });


    this.messageHandlers.set('GET_PEERS', (socket) => {
      // Respond with the list of peers this node knows about
      const peerUrls = Array.from(this.peers.keys());
      this.sendMessage(socket, {
        type: 'PEERS_LIST',
        data: peerUrls
      });
    });

  // Handle PING messages
  this.messageHandlers.set('PING', (socket) => {
    console.log('Received PING, sending PONG');
    this.sendMessage(socket, { 
      type: 'PONG',
      timestamp: Date.now() 
    });
    
    // Update the last seen timestamp for this peer
    for (const [url, peer] of this.peers.entries()) {
      if (peer.socket === socket) {
        peer.lastSeen = Date.now();
        this.peers.set(url, peer);
        break;
      }
    }
  });

  // Handle PONG messages
  this.messageHandlers.set('PONG', (socket, message) => {
    console.log('Received PONG response');
    
    // Update the last seen timestamp for this peer
    for (const [url, peer] of this.peers.entries()) {
      if (peer.socket === socket) {
        peer.lastSeen = Date.now();
        this.peers.set(url, peer);
        break;
      }
    }
  });


    // Also add a handler for the response
  this.messageHandlers.set('PEERS_LIST', (socket, message) => {
    const newPeers = message.data;
    if (Array.isArray(newPeers) && newPeers.length > 0) {
      console.log(`收到 ${newPeers.length} 个新的对等节点地址`);
      this.connectToPeers(newPeers);
    }
  });
      
    // 处理区块链查询
    this.messageHandlers.set('QUERY_LATEST', (socket) => {
      this.sendMessage(socket, {
        type: 'RESPONSE_BLOCKCHAIN',
        data: JSON.stringify([this.blockchain.getLatestBlock()])
      });
    });
    
    // 处理完整区块链查询
    this.messageHandlers.set('QUERY_ALL', (socket) => {
      this.sendMessage(socket, {
        type: 'RESPONSE_BLOCKCHAIN',
        data: JSON.stringify(this.blockchain.chain)
      });
    });
    
    // 处理区块链响应
    this.messageHandlers.set('RESPONSE_BLOCKCHAIN', (socket, message) => {
      const receivedBlocks = JSON.parse(message.data).sort(
        (b1, b2) => b1.timestamp - b2.timestamp
      );
      
      if (receivedBlocks.length === 0) return;
      
      const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
      const latestBlockHeld = this.blockchain.getLatestBlock();
      
      // 如果收到的区块链与当前区块链相同，不做任何操作
      if (latestBlockReceived.hash === latestBlockHeld.hash) {
        console.log('收到的区块链与当前区块链一致');
        return;
      }
      
      // 如果收到的区块是当前链的下一个区块，直接添加
      if (latestBlockReceived.previousHash === latestBlockHeld.hash) {
        console.log('可以将收到的区块添加到我们的链中');
        if (this.blockchain.isValidNewBlock(latestBlockReceived, latestBlockHeld)) {
          this.blockchain.chain.push(latestBlockReceived);
          this.broadcast({
            type: 'RESPONSE_BLOCKCHAIN',
            data: JSON.stringify([latestBlockReceived])
          });
        }
      } 
      // 如果只收到一个区块，请求完整区块链
      else if (receivedBlocks.length === 1) {
        if(this.blockchain.isChainValid(receivedBlocks)){
          // 比较区块链的难度总和或权益证明
          const currentChainDifficulty = this.blockchain.getChainDifficulty();
          const receivedChainDifficulty = this.blockchain.getChainDifficulty(receivedBlocks);
          
          if (receivedChainDifficulty > currentChainDifficulty) {
            console.log('收到的区块链难度更高，替换当前区块链');
            this.blockchain.replaceChain(receivedBlocks);
          } else if (receivedChainDifficulty === currentChainDifficulty) {
            // 如果难度相同，可以使用其他标准决定，例如链长度或时间戳
            console.log('区块链难度相同，使用其他标准决定');
            
            // 例如：使用链长度作为决定因素
            if (receivedBlocks.length > this.blockchain.chain.length) {
              console.log('收到的区块链更长，替换当前区块链');
              this.blockchain.replaceChain(receivedBlocks);
            } else if (receivedBlocks.length === this.blockchain.chain.length) {
              // 如果长度也相同，可以使用最后区块的时间戳
              const lastReceivedBlock = receivedBlocks[receivedBlocks.length - 1];
              const lastLocalBlock = this.blockchain.getLatestBlock();
              
              if (lastReceivedBlock.timestamp < lastLocalBlock.timestamp) {
                console.log('收到的区块链最后区块时间戳更早，替换当前区块链');
                this.blockchain.replaceChain(receivedBlocks);
              } else {
                console.log('保留当前区块链，最后区块时间戳更早');
              }
            } else {
              console.log('保留当前区块链，链更长');
            }
          } else {
            console.log('保留当前区块链，难度更高');
          }
        }
        // console.log('需要查询完整区块链');
        // this.sendMessage(socket, { type: 'QUERY_ALL' });
      } 
      // 如果收到的区块链比当前的长，并且有效，则替换
      else if (receivedBlocks.length > 1) {
        if(this.blockchain.isChainValid(receivedBlocks)){
          // 比较区块链的难度总和或权益证明
          const currentChainDifficulty = this.blockchain.getChainDifficulty();
          const receivedChainDifficulty = this.blockchain.getChainDifficulty(receivedBlocks);
          
          if (receivedChainDifficulty > currentChainDifficulty) {
            console.log('收到的区块链难度更高，替换当前区块链');
            this.blockchain.replaceChain(receivedBlocks);
          } else if (receivedChainDifficulty === currentChainDifficulty) {
            // 如果难度相同，可以使用其他标准决定，例如链长度或时间戳
            console.log('区块链难度相同，使用其他标准决定');
            
            // 例如：使用链长度作为决定因素
            if (receivedBlocks.length > this.blockchain.chain.length) {
              console.log('收到的区块链更长，替换当前区块链');
              this.blockchain.replaceChain(receivedBlocks);
            } else if (receivedBlocks.length === this.blockchain.chain.length) {
              // 如果长度也相同，可以使用最后区块的时间戳
              const lastReceivedBlock = receivedBlocks[receivedBlocks.length - 1];
              const lastLocalBlock = this.blockchain.getLatestBlock();
              
              if (lastReceivedBlock.timestamp < lastLocalBlock.timestamp) {
                console.log('收到的区块链最后区块时间戳更早，替换当前区块链');
                this.blockchain.replaceChain(receivedBlocks);
              } else {
                console.log('保留当前区块链，最后区块时间戳更早');
              }
            } else {
              console.log('保留当前区块链，链更长');
            }
          } else {
            console.log('保留当前区块链，难度更高');
          }
        }
      }
    });
    
    // 处理新交易
    this.messageHandlers.set('NEW_TRANSACTION', (socket, message) => {
      const transaction = message.data;
      
      // 验证交易
      if (this.blockchain.isValidTransaction(transaction)) {
        console.log('收到新的有效交易');
        this.blockchain.addTransaction(transaction);
        
        // 广播给其他节点
        this.broadcast(message);
      }
    });
    
    // 处理新区块
    this.messageHandlers.set('NEW_BLOCK', (socket, message) => {
      const newBlock = message.data;
      
      // 验证区块
      if (this.blockchain.isValidNewBlock(newBlock, this.blockchain.getLatestBlock())) {
        console.log('收到新的有效区块');
        this.blockchain.chain.push(newBlock);
        
        // 广播给其他节点
        this.broadcast(message);
      }
    });
  }

  // 初始化错误处理器
  initErrorHandler(socket) {
    socket.on('close', () => this.closeConnection(socket));
    socket.on('error', () => this.closeConnection(socket));
  }

  // 关闭连接
  closeConnection(socket) {
    this.sockets = this.sockets.filter(s => s !== socket);
    
    // 从peers中移除
    for (const [url, peer] of this.peers.entries()) {
      if (peer.socket === socket) {
        this.peers.delete(url);
        break;
      }
    }
  }

  // 发送握手消息
  sendHandshake(socket) {
    this.sendMessage(socket, {
      type: 'HANDSHAKE',
      data: {
        nodeId: this.nodeId,
        port: this.port,
        address: require('ip').address()
      }
    });
  }

  // 发送消息
// 在p2pNetwork.js中
sendMessage(socket, message) {
  try {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.log('尝试向未连接的socket发送消息');
    }
  } catch (error) {
    console.error('发送消息失败:', error);
  }
}

// 在dataRouter.js中
// 在dataRouter.js中
async requestUserData(userId) {
  try {
    // 用户ID作为数据ID的前缀
    const dataId = `user:${userId}`;
    return await this.requestData(dataId);
  } catch (error) {
    console.error(`请求用户数据失败 (${userId}):`, error);
    // 返回空数据而不是抛出错误
    return { items: [] };
  }
}

  // 广播消息给所有连接的节点
  broadcast(message) {
    this.sockets.forEach(socket => {
      this.sendMessage(socket, message);
    });
  }
  
  // 广播交易
  broadcastTransaction(transaction) {
    this.broadcast({
      type: 'NEW_TRANSACTION',
      data: transaction
    });
  }
  
  // 广播新区块
  broadcastBlock(block) {
    this.broadcast({
      type: 'NEW_BLOCK',
      data: block
    });
  }
  
  // 定期检查节点健康状态
  startNodeHealthCheck(interval = 30000) {
    setInterval(() => {
      const now = Date.now();
      
      for (const [url, peer] of this.peers.entries()) {
        // 如果超过2分钟没有收到消息，发送ping
        if (now - peer.lastSeen > 120000) {
          try {
            this.sendMessage(peer.socket, { type: 'PING' });
          } catch (e) {
            // 如果发送失败，移除节点
            this.peers.delete(url);
            this.sockets = this.sockets.filter(s => s !== peer.socket);
          }
        }
      }
    }, interval);
  }
  
  // 发现新节点
  discoverNodes() {
    // 向已知节点请求他们的对等节点列表
    for (const peer of this.peers.values()) {
      this.sendMessage(peer.socket, { type: 'GET_PEERS' });
    }
  }
  
  // 获取活跃节点数量
  getActiveNodesCount() {
    return this.peers.size;
  }

}

module.exports = P2PNetwork;
