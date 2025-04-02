
// startNode.js
const { Blockchain } = require('./blockchain');
const BarterContract = require('./barterContract');
const ShardManager = require('./shardManager');
const P2PNetwork = require('./p2pNetwork');
const ItemVerification = require('./itemVerification');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const axios = require('axios');
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
  .option('discovery', {
    alias: 'd',
    description: '发现服务URL',
    default: 'http://localhost:5005'
  })
  .option('dbUrl', {
    alias: 'db',
    description: 'MongoDB连接URL',
    default: 'mongodb://localhost:27017/barterchain'
  })
  .help()
  .alias('help', 'h')
  .argv;

// 连接MongoDB
mongoose.connect(argv.dbUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('已连接到MongoDB');
}).catch(err => {
  console.error('MongoDB连接错误:', err);
  process.exit(1);
});

// 初始化Express应用
const app = express();
app.use(bodyParser.json());

// 初始化区块链
const barterChain = new Blockchain();

// 初始化P2P网络
const p2pNetwork = new P2PNetwork(barterChain, argv.p2pPort);
const p2pServer = p2pNetwork.initP2PServer();

// 初始化智能合约和分片管理器
const barterContract = new BarterContract(barterChain, p2pNetwork);
const shardManager = new ShardManager(p2pNetwork);
const itemVerification = new ItemVerification(p2pNetwork);

// 连接到对等节点
if (argv.peers) {
  const peers = argv.peers.split(',');
  p2pNetwork.connectToPeers(peers);
}

// 注册到发现服务
async function registerToDiscoveryService() {
  try {
    const response = await axios.post(`${argv.discovery}/register`, {
      nodeId: p2pNetwork.nodeId,
      p2pPort: argv.p2pPort,
      httpPort: argv.port,
      address: require('ip').address()
    });
    
    console.log('已注册到发现服务:', response.data);
    
    // 获取其他节点列表
    const nodesResponse = await axios.get(`${argv.discovery}/nodes`);
    const nodes = nodesResponse.data.nodes;
    
    // 连接到其他节点
    const peerUrls = nodes
      .filter(node => node.nodeId !== p2pNetwork.nodeId)
      .map(node => node.url);
    
    if (peerUrls.length > 0) {
      console.log('连接到发现的节点:', peerUrls);
      p2pNetwork.connectToPeers(peerUrls);
    }
    
    // 定期发送心跳
    setInterval(async () => {
      try {
        await axios.post(`${argv.discovery}/heartbeat`, {
          nodeId: p2pNetwork.nodeId
        });
      } catch (error) {
        console.error('发送心跳失败:', error.message);
      }
    }, 60000); // 每分钟
    
  } catch (error) {
    console.error('注册到发现服务失败:', error.message);
  }
}

// 启动节点健康检查
p2pNetwork.startNodeHealthCheck();

// 定期发现新节点
setInterval(() => {
  p2pNetwork.discoverNodes();
}, 60000);

// 设置API路由
// ... (添加所有API路由)

// 启动服务器
const PORT = argv.port;
app.listen(PORT, () => {
  console.log(`HTTP服务器运行在端口 ${PORT}`);
  console.log(`P2P服务器运行在端口 ${argv.p2pPort}`);
  console.log(`节点ID: ${p2pNetwork.nodeId}`);
  
  // 注册到发现服务
  registerToDiscoveryService();
});
