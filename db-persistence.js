// db-persistence.js
// IndexedDB 持久化存储模块
// 防止浏览器自动清理用户数据

/**
 * 数据库持久化管理器
 * 使用 navigator.storage.persist() API 请求持久化存储权限
 * 同时提供数据备份和恢复功能
 */
const DBPersistence = {
  // 持久化状态
  isPersisted: false,
  isSupported: false,
  storageEstimate: null,

  /**
   * 初始化持久化管理器
   * 检测浏览器支持并请求持久化权限
   */
  async init() {
    // 检查浏览器是否支持 Storage API
    this.isSupported = navigator.storage && navigator.storage.persist;
    
    if (!this.isSupported) {
      console.warn('[DBPersistence] 浏览器不支持持久化存储 API');
      return false;
    }

    try {
      // 检查当前持久化状态
      this.isPersisted = await navigator.storage.persisted();
      console.log(`[DBPersistence] 当前持久化状态: ${this.isPersisted ? '已持久化 ✓' : '未持久化'}`);

      // 获取存储配额信息
      await this.updateStorageEstimate();

      // 如果未持久化，自动请求权限
      if (!this.isPersisted) {
        await this.requestPersistence();
      }

      return true;
    } catch (error) {
      console.error('[DBPersistence] 初始化失败:', error);
      return false;
    }
  },

  /**
   * 请求持久化存储权限
   * @returns {Promise<boolean>} 是否成功获取权限
   */
  async requestPersistence() {
    if (!this.isSupported) {
      console.warn('[DBPersistence] 浏览器不支持持久化存储');
      return false;
    }

    try {
      // 请求持久化权限
      const granted = await navigator.storage.persist();
      this.isPersisted = granted;

      if (granted) {
        console.log('[DBPersistence] ✅ 持久化存储权限已获取！数据将不会被浏览器自动清理');
      } else {
        console.warn('[DBPersistence] ⚠️ 持久化存储权限被拒绝，数据可能在存储空间不足时被清理');
        // 显示用户提示
        this.showPersistenceWarning();
      }

      return granted;
    } catch (error) {
      console.error('[DBPersistence] 请求持久化权限失败:', error);
      return false;
    }
  },

  /**
   * 更新存储配额估计
   */
  async updateStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        this.storageEstimate = await navigator.storage.estimate();
        const usedMB = (this.storageEstimate.usage / 1024 / 1024).toFixed(2);
        const quotaMB = (this.storageEstimate.quota / 1024 / 1024).toFixed(2);
        const percentUsed = ((this.storageEstimate.usage / this.storageEstimate.quota) * 100).toFixed(1);
        
        console.log(`[DBPersistence] 存储使用情况: ${usedMB}MB / ${quotaMB}MB (${percentUsed}%)`);
        
        return this.storageEstimate;
      } catch (error) {
        console.error('[DBPersistence] 获取存储配额失败:', error);
        return null;
      }
    }
    return null;
  },

  /**
   * 显示持久化警告提示
   */
  showPersistenceWarning() {
    // 使用延迟确保 showCustomAlert 函数已加载
    setTimeout(async () => {
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert(
          '数据保护提醒',
          '您的浏览器未允许持久化存储，数据可能在以下情况被清除：\n\n' +
          '• 浏览器存储空间不足时\n' +
          '• 清理浏览器缓存时\n' +
          '• 长时间未访问网站时\n\n' +
          '建议：定期导出数据备份，或将本网站添加到主屏幕/书签以提高数据安全性。'
        );
      }
    }, 2000);
  },

  /**
   * 获取持久化状态信息
   * @returns {Object} 状态信息对象
   */
  async getStatus() {
    await this.updateStorageEstimate();
    
    return {
      isSupported: this.isSupported,
      isPersisted: this.isPersisted,
      storage: this.storageEstimate ? {
        used: this.storageEstimate.usage,
        quota: this.storageEstimate.quota,
        usedMB: (this.storageEstimate.usage / 1024 / 1024).toFixed(2),
        quotaMB: (this.storageEstimate.quota / 1024 / 1024).toFixed(2),
        percentUsed: ((this.storageEstimate.usage / this.storageEstimate.quota) * 100).toFixed(1)
      } : null
    };
  },

  /**
   * 导出所有数据库数据为 JSON
   * @returns {Promise<Object>} 导出的数据对象
   */
  async exportAllData() {
    if (!window.db) {
      throw new Error('数据库未初始化');
    }

    const exportData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      tables: {}
    };

    try {
      // 获取所有表名
      const tableNames = window.db.tables.map(table => table.name);
      
      for (const tableName of tableNames) {
        try {
          const tableData = await window.db[tableName].toArray();
          exportData.tables[tableName] = tableData;
          console.log(`[DBPersistence] 导出表 ${tableName}: ${tableData.length} 条记录`);
        } catch (error) {
          console.warn(`[DBPersistence] 导出表 ${tableName} 失败:`, error);
          exportData.tables[tableName] = [];
        }
      }

      return exportData;
    } catch (error) {
      console.error('[DBPersistence] 导出数据失败:', error);
      throw error;
    }
  },

  /**
   * 下载数据备份文件
   */
  async downloadBackup() {
    try {
      const data = await this.exportAllData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `ephone-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('[DBPersistence] ✅ 数据备份已下载');
      
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('备份成功', '数据备份文件已下载，请妥善保管！');
      }
      
      return true;
    } catch (error) {
      console.error('[DBPersistence] 下载备份失败:', error);
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('备份失败', `导出数据时出错: ${error.message}`);
      }
      return false;
    }
  },

  /**
   * 从备份文件恢复数据
   * @param {File} file - 备份文件
   * @returns {Promise<boolean>} 是否恢复成功
   */
  async restoreFromBackup(file) {
    if (!window.db) {
      throw new Error('数据库未初始化');
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.tables) {
        throw new Error('无效的备份文件格式');
      }

      // 确认恢复操作
      if (typeof showCustomConfirm === 'function') {
        const confirmed = await showCustomConfirm(
          '确认恢复',
          '恢复备份将覆盖当前所有数据，此操作不可撤销！\n\n确定要继续吗？'
        );
        if (!confirmed) return false;
      }

      // 逐表恢复数据
      for (const [tableName, tableData] of Object.entries(data.tables)) {
        if (window.db[tableName] && Array.isArray(tableData)) {
          try {
            // 清空现有数据
            await window.db[tableName].clear();
            // 批量插入新数据
            if (tableData.length > 0) {
              await window.db[tableName].bulkPut(tableData);
            }
            console.log(`[DBPersistence] 恢复表 ${tableName}: ${tableData.length} 条记录`);
          } catch (error) {
            console.warn(`[DBPersistence] 恢复表 ${tableName} 失败:`, error);
          }
        }
      }

      console.log('[DBPersistence] ✅ 数据恢复完成');
      
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('恢复成功', '数据已恢复，页面将刷新以加载新数据。');
      }
      
      // 刷新页面以加载恢复的数据
      setTimeout(() => {
        window.location.reload();
      }, 1500);

      return true;
    } catch (error) {
      console.error('[DBPersistence] 恢复数据失败:', error);
      if (typeof showCustomAlert === 'function') {
        await showCustomAlert('恢复失败', `恢复数据时出错: ${error.message}`);
      }
      return false;
    }
  },

  /**
   * 创建文件选择器并恢复备份
   */
  async selectAndRestoreBackup() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          const result = await this.restoreFromBackup(file);
          resolve(result);
        } else {
          resolve(false);
        }
      };
      
      input.click();
    });
  },

  /**
   * 自动备份（存储到 localStorage 作为快速恢复点）
   * 仅存储关键数据的摘要，避免超出 localStorage 限制
   */
  async createQuickBackup() {
    try {
      const chats = await window.db.chats.toArray();
      const apiConfig = await window.db.apiConfig.toArray();
      const globalSettings = await window.db.globalSettings.toArray();

      const quickBackup = {
        time: new Date().toISOString(),
        chatCount: chats.length,
        chatIds: chats.map(c => ({ id: c.id, name: c.name })),
        hasApiConfig: apiConfig.length > 0,
        hasSettings: globalSettings.length > 0
      };

      localStorage.setItem('ephone_quick_backup_info', JSON.stringify(quickBackup));
      console.log('[DBPersistence] 快速备份信息已更新');
      
      return quickBackup;
    } catch (error) {
      console.error('[DBPersistence] 创建快速备份失败:', error);
      return null;
    }
  },

  /**
   * 检查数据完整性
   * @returns {Promise<Object>} 检查结果
   */
  async checkDataIntegrity() {
    const result = {
      isHealthy: true,
      issues: [],
      stats: {}
    };

    try {
      // 检查各表数据量
      const tables = ['chats', 'apiConfig', 'globalSettings', 'userStickers', 'worldBooks'];
      
      for (const tableName of tables) {
        if (window.db[tableName]) {
          const count = await window.db[tableName].count();
          result.stats[tableName] = count;
        }
      }

      // 检查聊天记录
      const chats = await window.db.chats.toArray();
      for (const chat of chats) {
        if (!chat.id) {
          result.issues.push(`发现无效聊天记录（缺少ID）`);
          result.isHealthy = false;
        }
        if (chat.history && chat.history.length > 10000) {
          result.issues.push(`聊天 "${chat.name}" 的历史记录过多 (${chat.history.length} 条)，可能影响性能`);
        }
      }

      // 检查快速备份信息
      const quickBackupInfo = localStorage.getItem('ephone_quick_backup_info');
      if (quickBackupInfo) {
        const backup = JSON.parse(quickBackupInfo);
        result.lastQuickBackup = backup.time;
        
        // 比较聊天数量是否一致
        if (backup.chatCount !== chats.length) {
          result.issues.push(`聊天数量变化: 上次备份 ${backup.chatCount} 个，当前 ${chats.length} 个`);
        }
      }

      console.log('[DBPersistence] 数据完整性检查完成:', result);
      return result;
    } catch (error) {
      console.error('[DBPersistence] 数据完整性检查失败:', error);
      result.isHealthy = false;
      result.issues.push(`检查失败: ${error.message}`);
      return result;
    }
  }
};

// 暴露到全局
window.DBPersistence = DBPersistence;

// 页面加载时自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化，等待数据库初始化完成
    setTimeout(() => {
      if (window.db) {
        DBPersistence.init();
      }
    }, 1000);
  });
} else {
  setTimeout(() => {
    if (window.db) {
      DBPersistence.init();
    }
  }, 1000);
}

console.log('[DBPersistence] 模块已加载');
