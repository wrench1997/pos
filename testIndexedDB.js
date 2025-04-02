// testIndexedDB.js
const IndexedDBManager = require('./indexedDBManager');
const crypto = require('crypto');

async function testIndexedDB() {
  try {
    console.log('开始测试 IndexedDB...');
    
    // 初始化数据库
    const dbManager = new IndexedDBManager();
    await dbManager.open();
    
    // 测试用户存储
    const userId = crypto.randomBytes(16).toString('hex');
    const user = {
      userId,
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      walletAddress: crypto.randomBytes(20).toString('hex')
    };
    
    await dbManager.saveUser(user);
    console.log('用户保存成功:', userId);
    
    const retrievedUser = await dbManager.getUser(userId);
    console.log('获取用户成功:', retrievedUser.username);
    
    // 测试物品存储
    const shardId = '00'; // 使用第一个分片
    const item = {
      name: '测试物品',
      description: '这是一个测试物品',
      images: ['test.jpg'],
      userId,
      status: 'AVAILABLE',
      shardId,
      createdAt: Date.now()
    };
    
    const savedItem = await dbManager.saveItem(shardId, item);
    console.log('物品保存成功:', savedItem.id);
    
    const items = await dbManager.getItemsInShard(shardId, { userId });
    console.log(`获取到 ${items.length} 个物品`);
    
    // 测试更新物品
    await dbManager.updateItem(shardId, savedItem.id, { status: 'PENDING' });
    console.log('物品状态更新成功');
    
    const updatedItems = await dbManager.getItemsInShard(shardId, { userId });
    console.log('更新后的物品状态:', updatedItems[0].status);
    
    // 测试交换提议
    const offerId = crypto.randomBytes(16).toString('hex');
    const offer = {
      id: offerId,
      creator: userId,
      itemOffered: {
        id: savedItem.id,
        name: savedItem.name,
        description: savedItem.description
      },
      status: 'OPEN',
      createdAt: Date.now(),
      shardId
    };
    
    await dbManager.saveOffer(offer);
    console.log('交换提议保存成功:', offerId);
    
    const retrievedOffer = await dbManager.getOffer(offerId);
    console.log('获取交换提议成功:', retrievedOffer.status);
    
    // 测试交易
    const tx = {
      from: userId,
      to: crypto.randomBytes(16).toString('hex'),
      type: 'CREATE_OFFER',
      data: { offerId },
      timestamp: Date.now(),
      shardId
    };
    
    await dbManager.saveTransaction(tx);
    console.log('交易保存成功');
    
    const transactions = await dbManager.getTransactions({ from: userId });
    console.log(`获取到 ${transactions.length} 个交易`);
    
    console.log('IndexedDB 测试完成!');
    dbManager.close();
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testIndexedDB();