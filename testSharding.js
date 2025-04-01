// testSharding.js
const axios = require('axios');
const mongoose = require('mongoose');

async function testSharding() {
  try {
    // 连接到 MongoDB 检查分片
    await mongoose.connect('mongodb://localhost:27017/barterchain');
    
    // 注册多个用户
    const users = [];
    for (let i = 0; i < 10; i++) {
      const response = await axios.post('http://localhost:3001/api/users/register', {
        username: `sharduser${i}`,
        email: `shard${i}@example.com`,
        password: 'password123'
      });
      users.push(response.data);
      console.log(`用户 ${i} 注册成功:`, response.data.userId);
    }
    
    // 为每个用户添加多个物品
    for (const user of users) {
      for (let i = 0; i < 5; i++) {
        await axios.post(`http://localhost:3001/api/users/${user.userId}/items`, {
          name: `物品 ${i} 用户 ${user.userId}`,
          description: '分片测试物品',
          images: ['test.jpg']
        });
      }
      console.log(`为用户 ${user.userId} 添加了 5 个物品`);
    }
    
    // 检查 MongoDB 中的分片集合
    const collections = await mongoose.connection.db.listCollections().toArray();
    const itemCollections = collections.filter(c => c.name.startsWith('items_'));
    
    console.log('物品分片集合:', itemCollections.map(c => c.name));
    
    for (const collection of itemCollections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`分片 ${collection.name} 中有 ${count} 个物品`);
    }
    
    mongoose.disconnect();
  } catch (error) {
    console.error('分片测试失败:', error);
  }
}

testSharding();