// testConsensus.js
const axios = require('axios');

async function testConsensus() {
  try {
    // 注册多个用户作为验证者
    const validators = [];
    for (let i = 0; i < 5; i++) {
      const response = await axios.post('http://localhost:3001/api/users/register', {
        username: `validator${i}`,
        email: `validator${i}@example.com`,
        password: 'password123'
      });
      validators.push(response.data);
      console.log(`验证者 ${i} 注册成功:`, response.data.userId);
    }
    
    // 创建多个交易以触发区块创建
    for (let i = 0; i < 10; i++) {
      // 为每个验证者添加物品
      for (const validator of validators) {
        await axios.post(`http://localhost:3001/api/users/${validator.userId}/items`, {
          name: `共识测试物品 ${i}`,
          description: '用于测试共识机制',
          images: ['consensus.jpg']
        });
      }
    }
    
    // 检查区块链状态
    const status = await axios.get('http://localhost:3001/api/blockchain/status');
    console.log('区块链状态:', status.data);
    
    // 获取验证者列表
    const validatorList = await axios.get('http://localhost:3001/api/blockchain/validators');
    console.log('验证者列表:', validatorList.data);
  } catch (error) {
    console.error('共识测试失败:', error.response ? error.response.data : error.message);
  }
}

testConsensus();