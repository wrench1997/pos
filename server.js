
// server.js
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { Blockchain } = require('./blockchain');
const BarterContract = require('./barterContract');
const User = require('./models/user');
const ShardManager = require('./shardManager');
const P2PNetwork = require('./p2pNetwork');
const ItemVerification = require('./itemVerification');
const IndexedDBManager = require('./indexedDBManager');
const yargs = require('yargs');

// 解析命令行参数
const argv = yargs
  .option('port', {
    alias: 'p',
    description: 'HTTP服务器端口',
    default: 3000
  })
  .option('p2pPort', {
    alias: 'P',
    description: 'P2P网络端口',
    default: 6001
  })
  .option('peers', {
    alias: 'r',
    description: '对等节点列表，用逗号分隔',
    default: ''
  })
  .help()
  .alias('help', 'h')
  .argv;

// 初始化 IndexedDB
const dbManager = new IndexedDBManager();
dbManager.open().then(() => {
  console.log('IndexedDB 初始化成功');
}).catch(err => {
  console.error('IndexedDB 初始化失败:', err);
});

const app = express();
app.use(bodyParser.json());

// 初始化区块链
const barterChain = new Blockchain();

// 初始化P2P网络
const p2pNetwork = new P2PNetwork(barterChain, argv.p2pPort);
const p2pServer = p2pNetwork.initP2PServer();

// 连接到对等节点
if (argv.peers) {
  const peers = argv.peers.split(',');
  p2pNetwork.connectToPeers(peers);
}

// 初始化智能合约和分片管理器
const barterContract = new BarterContract(barterChain, p2pNetwork);
const shardManager = new ShardManager(p2pNetwork, dbManager);
const itemVerification = new ItemVerification(p2pNetwork);

// 启动节点健康检查
p2pNetwork.startNodeHealthCheck();

// 定期发现新节点
setInterval(() => {
  p2pNetwork.discoverNodes();
}, 60000);

// 用户注册
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // 生成密钥对
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    // 创建用户
    const user = await User.save({
      username,
      email,
      password,
      publicKey,
      walletAddress: crypto.randomBytes(20).toString('hex')
    }, dbManager);
    
    // 将用户添加为验证者（初始权益为10）
    barterChain.addValidator(user.walletAddress, 10);
    
    res.status(201).json({
      message: '用户注册成功',
      userId: user.userId,
      walletAddress: user.walletAddress,
      privateKey // 实际应用中不应返回私钥，而是让用户安全保存
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 添加物品
app.post('/api/users/:userId/items', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, description, images } = req.body;
    
    // 使用分片管理器添加物品
    const item = await shardManager.addItemToUserShard(userId, {
      name,
      description,
      images,
      status: 'AVAILABLE',
      createdAt: Date.now()
    });
    
    res.status(201).json({
      message: '物品添加成功',
      item
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 获取用户物品
app.get('/api/users/:userId/items', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 使用分片管理器获取用户物品
    const items = await shardManager.getUserItems(userId);
    
    res.status(200).json({
      data: items
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 创建交换提议
app.post('/api/barter/offers', async (req, res) => {
  try {
    const { userId, itemId, itemWanted, description } = req.body;
    
    console.log('创建交换提议:', { userId, itemId, itemWanted });
    
    // 获取物品详情
    const items = await shardManager.getUserItems(userId);
    console.log('用户物品:', items);
    
    const item = items.find(i => i.id === itemId || i._id === itemId);
    
    if (!item) {
      return res.status(404).json({ error: '物品不存在' });
    }
    
    if (item.status !== 'AVAILABLE') {
      return res.status(400).json({ error: '物品不可用于交换' });
    }
    
    // 更新物品状态
    await shardManager.updateItemStatus(userId, itemId, 'PENDING');
    
    // 创建交换提议
    const offerId = barterContract.createBarterOffer(
      userId,
      {
        id: itemId,
        name: item.name,
        description: item.description
      },
      itemWanted,
      description
    );
    
    res.status(201).json({
      message: '交换提议创建成功',
      offerId
    });
  } catch (error) {
    console.error('创建交换提议错误:', error);
    res.status(400).json({ error: error.message });
  }
});

// 响应交换提议
app.post('/api/barter/offers/:offerId/respond', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { userId, itemId } = req.body;
    
    // 获取物品详情
    const items = await shardManager.getUserItems(userId);
    const item = items.find(i => i.id === itemId);
    
    if (!item) {
      return res.status(404).json({ error: '物品不存在' });
    }
    
    if (item.status !== 'AVAILABLE') {
      return res.status(400).json({ error: '物品不可用于交换' });
    }
    
    // 更新物品状态
    await shardManager.updateItemStatus(userId, itemId, 'PENDING');
    
    // 响应交换提议
    const result = barterContract.respondToOffer(
      offerId, 
      userId, 
      {
        id: itemId,
        name: item.name,
        description: item.description
      }
    );
    
    res.status(200).json({
      message: '成功响应交换提议',
      success: result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 确认交换
app.post('/api/barter/offers/:offerId/confirm', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { userId } = req.body;
    
    // 确认交换
    const result = barterContract.confirmBarter(offerId, userId);
    
    if (result) {
      // 获取交换提议详情
      const offer = barterContract.barterOffers.get(offerId);
      
      // 更新物品状态
      await shardManager.updateItemStatus(offer.creator, offer.itemOffered.id, 'EXCHANGED');
      await shardManager.updateItemStatus(offer.responder, offer.responderItem.id, 'EXCHANGED');
      
      // 触发区块创建
      const validator = barterChain.selectValidator();
      barterChain.minePendingTransactions(validator);
    }
    
    res.status(200).json({
      message: '交换已确认',
      success: result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 完成交换并评价
app.post('/api/barter/offers/:offerId/complete', async (req, res) => {
  try {
    const { offerId } = req.params;
    const { userId, rating, review } = req.body;
    
    const result = barterContract.completeBarter(offerId, userId, rating, review);
    
    res.status(200).json({
      message: '评价已提交',
      success: result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 获取开放的交换提议
app.get('/api/barter/offers', (req, res) => {
  const openOffers = barterContract.getOpenOffers();
  res.status(200).json(openOffers);
});

// 获取用户交换历史
app.get('/api/barter/history/:userId', (req, res) => {
  const { userId } = req.params;
  const history = barterContract.getUserBarterHistory(userId);
  res.status(200).json(history);
});

// 获取用户信誉
app.get('/api/users/:userId/reputation', (req, res) => {
  const { userId } = req.params;
  const reputation = barterContract.getUserReputation(userId);
  res.status(200).json(reputation);
});

// 获取区块链状态
app.get('/api/blockchain/status', (req, res) => {
  res.status(200).json({
    chainLength: barterChain.chain.length,
    isValid: barterChain.isChainValid(),
    pendingTransactions: barterChain.pendingTransactions.length
  });
});

// 获取所有可用物品（交换市场）
app.get('/api/market/items', async (req, res) => {
  try {
    const items = await shardManager.getAllAvailableItems();
    res.status(200).json(items);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 获取所有验证者信息
app.get('/api/blockchain/validators', (req, res) => {
  const validators = Array.from(barterChain.validators.entries()).map(([address, stake]) => {
    return { address, stake };
  });
  
  res.status(200).json(validators);
});

// 添加P2P网络相关API
app.get('/api/peers', (req, res) => {
  res.status(200).json({
    nodeId: p2pNetwork.nodeId,
    peers: Array.from(p2pNetwork.peers.keys()),
    activeNodes: p2pNetwork.getActiveNodesCount(),
    responsibleShards: Array.from(shardManager.localShards)
  });
});

app.post('/api/peers', (req, res) => {
  const { peer } = req.body;
  p2pNetwork.connectToPeers([peer]);
  res.status(200).json({ message: '已连接到对等节点' });
});

// 启动服务器
const PORT = argv.port;
app.listen(PORT, () => {
  console.log(`HTTP服务器运行在端口 ${PORT}`);
  console.log(`P2P服务器运行在端口 ${argv.p2pPort}`);
  console.log(`节点ID: ${p2pNetwork.nodeId}`);
});
