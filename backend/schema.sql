-- 创建定时消息表
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  send_at INTEGER NOT NULL,  -- Unix timestamp (seconds)
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed'
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_send_at_status ON scheduled_messages(send_at, status);
CREATE INDEX IF NOT EXISTS idx_user_id ON scheduled_messages(user_id);

-- 创建后台活动配置表
CREATE TABLE IF NOT EXISTS background_activity_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  interval_seconds INTEGER NOT NULL DEFAULT 60,
  activity_config TEXT,  -- JSON string: {chatId: frequency}
  api_config TEXT,  -- JSON string: {proxyUrl, apiKey, model, temperature}
  last_check_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 创建后台活动消息表（存储生成的消息）
CREATE TABLE IF NOT EXISTS background_activity_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed'
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 创建角色信息表（用于后台活动）
CREATE TABLE IF NOT EXISTS character_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  chat_name TEXT NOT NULL,
  persona TEXT,
  relationship_status TEXT,
  last_activity_timestamp INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, chat_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_bg_activity_user_id ON background_activity_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_bg_activity_messages_user_status ON background_activity_messages(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bg_activity_messages_created ON background_activity_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_character_info_user_id ON character_info(user_id);
