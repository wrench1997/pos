// discoveryService.js
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

class DiscoveryService {
  constructor(port = 5005) {
    this.port = port;
    this.nodes = new Map(); // 存储已知节点
    this.app = express();
    this.app.use(bodyParser.json());
    
    this.setupRoutes();
  }
  
  setupRoutes() {
    // 注册节点
    this.app.post('/register', (req, res) => {
      const { nodeId, p2pPort, httpPort, address } = req.body;
      
      if (!nodeId || !p2pPort || !address) {
        return res.status(400).json({ error: '缺少必要参数' });
      }
      
      const nodeUrl = `ws://${address}:${p2pPort}`;
      
      this.nodes.set(nodeId, {
        nodeId,
        p2pPort,
        httpPort,
        address,
        url: nodeUrl,
        lastSeen: Date.now()
      });
      
      console.log(`节点 ${nodeId} 已注册`);
      
      res.status(200).json({
        message: '节点注册成功',
        nodeCount: this.nodes.size
      });
    });
    
    // 获取节点列表
    this.app.get('/nodes', (req, res) => {
      // 清理超过10分钟未活动的节点
      this.cleanupInactiveNodes();
      
      const nodeList = Array.from(this.nodes.values()).map(node => ({
        nodeId: node.nodeId,
        url: node.url,
        address: node.address,
        p2pPort: node.p2pPort,
        httpPort: node.httpPort,
        lastSeen: node.lastSeen
      }));
      
      res.status(200).json({
        nodeCount: nodeList.length,
        nodes: nodeList
      });
    });
    
    // 节点心跳
    this.app.post('/heartbeat', (req, res) => {
      const { nodeId } = req.body;
      
      if (this.nodes.has(nodeId)) {
        const node = this.nodes.get(nodeId);
        node.lastSeen = Date.now();
        this.nodes.set(nodeId, node);
        
        res.status(200).json({ message: '心跳更新成功' });
      } else {
        res.status(404).json({ error: '节点未注册' });
      }
    });
  }
  
  // 清理不活跃节点
  cleanupInactiveNodes() {
    const now = Date.now();
    const timeout = 10 * 60 * 1000; // 10分钟
    
    for (const [nodeId, node] of this.nodes.entries()) {
      if (now - node.lastSeen > timeout) {
        console.log(`移除不活跃节点: ${nodeId}`);
        this.nodes.delete(nodeId);
      }
    }
  }
  
  // 启动服务
  start() {
    this.app.listen(this.port, () => {
      console.log(`发现服务运行在端口 ${this.port}`);
    });
  }
}

// 如果直接运行此文件，启动发现服务
if (require.main === module) {
  const discoveryService = new DiscoveryService();
  discoveryService.start();
}

module.exports = DiscoveryService;