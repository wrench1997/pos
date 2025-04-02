
// clientTest.js
const BarterClient = require('./client');

async function testClient() {
  try {
    const client = new BarterClient('http://localhost:5005');
    
    // 连接到网络
    await client.connect();
    console.log('已连接到网络');
    
    // 注册用户
    const user = await client.registerUser('clientuser', 'client@example.com', 'password123');
    console.log('用户注册成功:', user);
    
    // 添加物品
    const item = await client.addItem(user.userId, {
      name: '客户端测试物品',
      description: '通过客户端添加的物品',
      images: ['clienttest.jpg']
    });
    console.log('物品添加成功:', item);
    
    // 获取用户物品
    const items = await client.getUserItems(user.userId);
    console.log('用户物品:', items);
    
    // 创建交换提议
    const offer = await client.createBarterOffer(
      user.userId,
      items.data[0].id, // 注意这里使用 id 而不是 _id
      '想要一部手机',
      '用我的测试物品换手机'
    );
    console.log('交换提议创建成功:', offer);
    
    // 获取开放的交换提议
    const openOffers = await client.getOpenOffers();
    console.log('开放的交换提议:', openOffers);
    
    // 断开连接
    client.disconnect();
    console.log('已断开连接');
  } catch (error) {
    console.error('客户端测试失败:', error);
  }
}

testClient();