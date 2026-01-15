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
