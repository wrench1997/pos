// itemVerification.js
class ItemVerification {
    constructor() {
      this.verifiedItems = new Map();
    }
  
    // 提交物品验证请求
    submitVerificationRequest(itemId, userId, itemDetails, proofImages) {
      const verificationId = crypto.randomBytes(8).toString('hex');
      
      const request = {
        id: verificationId,
        itemId,
        userId,
        itemDetails,
        proofImages,
        status: 'PENDING',
        submittedAt: Date.now()
      };
      
      this.verifiedItems.set(itemId, request);
      return verificationId;
    }
  
    // 验证物品（由可信第三方或社区投票完成）
    verifyItem(itemId, verifierId, isVerified, comments) {
      if (!this.verifiedItems.has(itemId)) {
        throw new Error('物品不存在');
      }
      
      const item = this.verifiedItems.get(itemId);
      
      item.status = isVerified ? 'VERIFIED' : 'REJECTED';
      item.verifiedBy = verifierId;
      item.verifiedAt = Date.now();
      item.verificationComments = comments;
      
      this.verifiedItems.set(itemId, item);
      return item;
    }
  
    // 检查物品是否已验证
    isItemVerified(itemId) {
      if (!this.verifiedItems.has(itemId)) {
        return false;
      }
      
      const item = this.verifiedItems.get(itemId);
      return item.status === 'VERIFIED';
    }
  
    // 获取物品验证详情
    getItemVerificationDetails(itemId) {
      if (!this.verifiedItems.has(itemId)) {
        throw new Error('物品不存在');
      }
      
      return this.verifiedItems.get(itemId);
    }
  }
  
  module.exports = ItemVerification;
  