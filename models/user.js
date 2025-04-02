

// models/user.js
const crypto = require('crypto');

class User {
  static async save(userData, dbManager) {
    // 生成用户ID
    if (!userData.userId) {
      userData.userId = crypto.randomBytes(16).toString('hex');
    }
    
    // 哈希密码
    if (userData.password) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(userData.password, salt, 1000, 64, 'sha512').toString('hex');
      userData.password = `${salt}:${hash}`;
    }
    
    return await dbManager.saveUser(userData);
  }
  
  static async findById(userId, dbManager) {
    return await dbManager.getUser(userId);
  }
  
  static async findByEmail(email, dbManager) {
    const users = await dbManager.getAllUsers({ email });
    return users[0];
  }
}

module.exports = User;
