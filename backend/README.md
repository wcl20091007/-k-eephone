# 定时发送 Worker 部署指南 / Scheduled Messages Worker Deployment Guide

## 中文说明

### 功能概述

这个 Cloudflare Worker 实现了用户自定义定时发送消息的功能。用户可以设置消息内容和延迟时间，Worker 会在指定时间自动发送消息。

### ⚠️ 重要提示

**前端默认使用开发者的公共 Worker API，用户无需自己部署 Worker。**

如果你需要部署自己的 Worker（例如用于测试或自定义功能），请按照下面的步骤操作。

**The frontend uses the developer's public Worker API by default. Users don't need to deploy their own Worker.**

If you need to deploy your own Worker (e.g., for testing or custom features), follow the steps below.

### 部署步骤（仅开发者需要）

#### 1. 安装依赖

```bash
cd backend
npm install
```

#### 2. 创建 D1 数据库

```bash
npx wrangler d1 create scheduled-messages-db
```

执行后会输出数据库 ID，类似：
```
✅ Successfully created DB 'scheduled-messages-db'!

[[d1_databases]]
binding = "DB"
database_name = "scheduled-messages-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

#### 3. 更新 wrangler.toml

将上一步得到的 `database_id` 填入 `wrangler.toml` 文件中的 `database_id` 字段。

#### 4. 初始化数据库表

```bash
npx wrangler d1 execute scheduled-messages-db --file=./schema.sql
```

#### 5. 本地测试（可选）

```bash
npm run dev
```

#### 6. 部署到 Cloudflare

```bash
npm run deploy
```

部署成功后会显示 Worker 的 URL，类似：
```
https://scheduled-messages-worker.your-subdomain.workers.dev
```

#### 7. 在前端配置（如果部署了自己的 Worker）

1. 打开应用的 API 设置界面
2. 启用"定时发送"开关
3. 填入 Worker API 地址（上一步得到的 URL，如果使用开发者的公共 Worker 则无需修改）
4. 用户 ID 会自动使用设备码，也可以手动修改
5. 点击"测试发送"按钮测试功能

**注意**：前端默认已配置开发者的公共 Worker API，用户无需修改即可使用。

### API 接口说明

#### 创建定时任务
```
POST /api/scheduled-messages
Content-Type: application/json

{
  "userId": "user-123",
  "content": "消息内容",
  "delaySeconds": 60
}
```

#### 获取任务列表
```
GET /api/scheduled-messages?userId=user-123
```

#### 删除任务
```
DELETE /api/scheduled-messages/{id}
```

#### 测试发送（立即发送）
```
POST /api/test-scheduled-message
Content-Type: application/json

{
  "userId": "user-123",
  "content": "测试消息"
}
```

### Cron 触发器

Worker 配置了每分钟执行一次的 cron 触发器（`* * * * *`），会自动检查并发送到期的消息。

### 自定义发送逻辑

在 `src/index.ts` 的 `sendToUser` 方法中，你可以自定义实际的发送逻辑，例如：
- 调用 AI 接口生成回复
- 通过 Webhook 发送
- 通过 WebSocket 推送
- 发送浏览器通知

---

## English Instructions

### Overview

This Cloudflare Worker implements scheduled message sending functionality. Users can set message content and delay time, and the Worker will automatically send messages at the specified time.

### ⚠️ Important Note

**The frontend uses the developer's public Worker API by default. Users don't need to deploy their own Worker.**

If you need to deploy your own Worker (e.g., for testing or custom features), follow the steps below.

### Deployment Steps (Developers Only)

#### 1. Install Dependencies

```bash
cd backend
npm install
```

#### 2. Create D1 Database

```bash
npx wrangler d1 create scheduled-messages-db
```

This will output a database ID. Copy it.

#### 3. Update wrangler.toml

Fill in the `database_id` field in `wrangler.toml` with the ID from step 2.

#### 4. Initialize Database Tables

```bash
npx wrangler d1 execute scheduled-messages-db --file=./schema.sql
```

#### 5. Local Testing (Optional)

```bash
npm run dev
```

#### 6. Deploy to Cloudflare

```bash
npm run deploy
```

After successful deployment, you'll see the Worker URL.

#### 7. Configure in Frontend (If You Deployed Your Own Worker)

1. Open the API settings interface
2. Enable the "Scheduled Messages" toggle
3. Enter the Worker API URL (if using developer's public Worker, no need to modify)
4. User ID will auto-use device code, or you can modify it manually
5. Click "Test Send" to test the functionality

**Note**: The frontend is pre-configured with the developer's public Worker API, users can use it without modification.

### API Endpoints

#### Create Scheduled Task
```
POST /api/scheduled-messages
Content-Type: application/json

{
  "userId": "user-123",
  "content": "Message content",
  "delaySeconds": 60
}
```

#### Get Task List
```
GET /api/scheduled-messages?userId=user-123
```

#### Delete Task
```
DELETE /api/scheduled-messages/{id}
```

#### Test Send (Immediate)
```
POST /api/test-scheduled-message
Content-Type: application/json

{
  "userId": "user-123",
  "content": "Test message"
}
```

### Cron Trigger

The Worker is configured with a cron trigger that runs every minute (`* * * * *`), automatically checking and sending due messages.

### Customize Send Logic

In the `sendToUser` method in `src/index.ts`, you can customize the actual sending logic, such as:
- Calling AI APIs to generate responses
- Sending via Webhook
- Pushing via WebSocket
- Sending browser notifications
