// client.js
const axios = require('axios');
const WebSocket = require('ws');
const crypto = require('crypto');

class BarterClient {
  constructor(discoveryServiceUrl = 'http://localhost:5000') {
    this.discoveryServiceUrl = discoveryServiceUrl;
    this.nodes = [];
    this.connectedNode = null;
    this.socket = null;
    this.clientId = crypto.randomBytes(16).toString('hex');
    this.messageHandlers = new Map();
    this.pendingRequests = new Map();
  }
  
  // 连接到网络
  async connect() {
    try {
      // 从发现服务获取节点列表
      const response = await axios.get(`${this.discoveryServiceUrl}/nodes`);
      this.nodes = response.data.nodes;
      
      if (this.nodes.length === 0) {
        throw new Error('没有可用的节点');
      }
      
      // 随机选择一个节点
      const randomIndex = Math.floor(Math.random() * this.nodes.length);
      this.connectedNode = this.nodes[randomIndex];
      
      // 连接到节点的WebSocket
      return new Promise((resolve, reject) => {
        this.socket = new WebSocket(this.connectedNode.url);
        
        this.socket.on('open', () => {
          console.log(`已连接到节点: ${this.connectedNode.nodeId}`);
          this.setupMessageHandler();
          resolve(this.connectedNode);
        });
        
        this.socket.on('error', (error) => {
          console.error('WebSocket连接错误:', error);
          reject(error);
        });
      });
    } catch (error) {
      console.error('连接到网络失败:', error.message);
      throw error;
    }
  }
  
  // 设置消息处理器
  setupMessageHandler() {
    this.socket.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // 检查是否是响应消息
        if (message.requestId && this.pendingRequests.has(message.requestId)) {
          const { resolve, reject, timeout } = this.pendingRequests.get(message.requestId);
          clearTimeout(timeout);
          this.pendingRequests.delete(message.requestId);
          
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message.data);
          }
          return;
        }
        
        // 处理其他消息
        if (this.messageHandlers.has(message.type)) {
          this.messageHandlers.get(message.type)(message);
        }
      } catch (error) {
        console.error('处理消息失败:', error);
      }
    });
  }
  
  // 发送请求并等待响应
  sendRequest(type, data, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomBytes(8).toString('hex');
      
      const message = {
        type,
        requestId,
        clientId: this.clientId,
        data
      };
      
      // 设置超时
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('请求超时'));
        }
      }, timeoutMs);
      
      // 存储待处理请求
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      
      // 发送消息
      this.socket.send(JSON.stringify(message));
    });
  }
  
  // 注册用户
  async registerUser(username, email, password) {
    try {
      const response = await axios.post(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/users/register`, {
        username,
        email,
        password
      });
      
      return response.data;
    } catch (error) {
      console.error('注册用户失败:', error.message);
      throw error;
    }
  }
  
  // 添加物品
  async addItem(userId, itemData) {
    try {
      const response = await axios.post(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/users/${userId}/items`, itemData);
      return response.data;
    } catch (error) {
      console.error('添加物品失败:', error.message);
      throw error;
    }
  }
  
  // 获取用户物品
  async getUserItems(userId) {
    try {
      const response = await axios.get(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/users/${userId}/items`);
      return response.data;
    } catch (error) {
      console.error('获取用户物品失败:', error.message);
      throw error;
    }
  }
  
  // 创建交换提议
  async createBarterOffer(userId, itemId, itemWanted, description) {
    try {
      const response = await axios.post(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/barter/offers`, {
        userId,
        itemId,
        itemWanted,
        description
      });
      return response.data;
    } catch (error) {
      console.error('创建交换提议失败:', error.message);
      throw error;
    }
  }
  
  // 响应交换提议
  async respondToOffer(offerId, userId, itemId) {
    try {
      const response = await axios.post(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/barter/offers/${offerId}/respond`, {
        userId,
        itemId
      });
      return response.data;
    } catch (error) {
      console.error('响应交换提议失败:', error.message);
      throw error;
    }
  }
  
  // 确认交换
  async confirmBarter(offerId, userId) {
    try {
      const response = await axios.post(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/barter/offers/${offerId}/confirm`, {
        userId
      });
      return response.data;
    } catch (error) {
      console.error('确认交换失败:', error.message);
      throw error;
    }
  }
  
  // 完成交换并评价
  async completeBarter(offerId, userId, rating, review) {
    try {
      const response = await axios.post(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/barter/offers/${offerId}/complete`, {
        userId,
        rating,
        review
      });
      return response.data;
    } catch (error) {
      console.error('完成交换失败:', error.message);
      throw error;
    }
  }
  
  // 获取开放的交换提议
  async getOpenOffers() {
    try {
      const response = await axios.get(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/barter/offers`);
      return response.data;
    } catch (error) {
      console.error('获取开放提议失败:', error.message);
      throw error;
    }
  }
  
  // 获取用户交换历史
  async getUserBarterHistory(userId) {
    try {
      const response = await axios.get(`http://${this.connectedNode.address}:${this.connectedNode.httpPort}/api/barter/history/${userId}`);
      return response.data;
    } catch (error) {
      console.error('获取用户交换历史失败:', error.message);
      throw error;
    }
  }
  
  // 断开连接
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connectedNode = null;
      console.log('已断开连接');
    }
  }
}

module.exports = BarterClient;