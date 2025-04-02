// test.js
const axios = require('axios');

async function runTest() {
  try {
    console.log('开始测试...');
    
    // 注册用户
    const timestamp = Date.now();
    const user1 = await axios.post('http://localhost:3001/api/users/register', {
      username: `testuser1_${timestamp}`,
      email: `test1_${timestamp}@example.com`,
      password: 'password123'
    });
    
    const timestamp1 = Date.now();
    const user2 = await axios.post('http://localhost:3001/api/users/register', {
      username: `testuser1_${timestamp1}`,
      email: `test1_${timestamp1}@example.com`,
      password: 'password123'
    });
    
    console.log('用户注册成功:', user1.data.userId, user2.data.userId);
    
    // 添加物品
    const item1 = await axios.post(`http://localhost:3001/api/users/${user1.data.userId}/items`, {
      name: '测试物品1',
      description: '这是一个测试物品',
      images: ['test1.jpg']
    });
    
    const item2 = await axios.post(`http://localhost:3002/api/users/${user2.data.userId}/items`, {
      name: '测试物品2',
      description: '这是另一个测试物品',
      images: ['test2.jpg']
    });
    
    console.log('物品添加成功:', item1.data.item._id, item2.data.item._id);
    
    // 创建交换提议
    const offer = await axios.post('http://localhost:3001/api/barter/offers', {
      userId: user1.data.userId,
      itemId:  item1.data.item.id || item1.data.item._id,
      itemWanted: '想要测试物品2',
      description: '这是一个测试交换'
    });
    
    console.log('交换提议创建成功:', offer.data.offerId);
    
    // 响应交换提议
    const response = await axios.post(`http://localhost:3002/api/barter/offers/${offer.data.offerId}/respond`, {
      userId: user2.data.userId,
      itemId:  item2.data.item.id || item2.data.item._id,
    });
    
    console.log('响应交换提议成功:', response.data);
  
    // 确认交换
    const confirmation = await axios.post(`http://localhost:3001/api/barter/offers/${offer.data.offerId}/confirm`, {
      userId: user1.data.userId
    });
    
    console.log('确认交换成功:', confirmation.data);
    
    // 完成交换并评价
    const rating1 = await axios.post(`http://localhost:3001/api/barter/offers/${offer.data.offerId}/complete`, {
      userId: user1.data.userId,
      rating: 5,
      review: '很好的测试交换'
    });
    
    const rating2 = await axios.post(`http://localhost:3002/api/barter/offers/${offer.data.offerId}/complete`, {
      userId: user2.data.userId,
      rating: 4,
      review: '还不错的测试交换'
    });
    
    console.log('交换评价完成:', rating1.data, rating2.data);
    
    // 查看交换历史
    const history1 = await axios.get(`http://localhost:3001/api/barter/history/${user1.data.userId}`);
    console.log('用户1交换历史:', history1.data);
    
    // 查看区块链状态
    const blockchainStatus = await axios.get('http://localhost:3001/api/blockchain/status');
    console.log('区块链状态:', blockchainStatus.data);
    
    console.log('测试完成!');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

runTest();