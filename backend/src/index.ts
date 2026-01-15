// Cloudflare Worker for scheduled messages
// 处理用户自定义定时发送时间

export interface Env {
  DB: D1Database;
  // 可以添加其他环境变量，如 AI API keys
}

interface ScheduledMessage {
  id?: number;
  user_id: string;
  content: string;
  send_at: number; // Unix timestamp (seconds)
  status: 'pending' | 'sent' | 'failed';
  created_at?: number;
}

interface BackgroundActivityConfig {
  id?: number;
  user_id: string;
  enabled: number; // 0 = false, 1 = true
  interval_seconds: number;
  activity_config: string; // JSON string
  api_config: string; // JSON string
  last_check_at: number;
  updated_at: number;
}

interface BackgroundActivityMessage {
  id?: number;
  user_id: string;
  chat_id: string;
  chat_name?: string;
  content: string;
  status: 'pending' | 'sent' | 'failed';
  created_at?: number;
}

interface CharacterInfo {
  chatId: string;
  chatName: string;
  persona: string;
  relationshipStatus?: string;
  lastActivityTimestamp?: number;
}

export default {
  // 1. 接收用户定义的定时任务
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 健康检查端点 - 用于诊断数据库连接
      if (path === '/api/health' && request.method === 'GET') {
        try {
          if (!env.DB) {
            return new Response(
              JSON.stringify({ 
                status: 'error', 
                message: 'Database not configured',
                database: 'not_bound'
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // 尝试查询数据库表是否存在
          const testQuery = await env.DB.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="scheduled_messages"').first();
          
          if (!testQuery) {
            return new Response(
              JSON.stringify({ 
                status: 'error', 
                message: 'Database table not found',
                database: 'connected',
                table: 'missing',
                hint: 'Please run: npx wrangler d1 execute scheduled-messages-db --file=./schema.sql'
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // 尝试一个简单的查询
          const countResult = await env.DB.prepare('SELECT COUNT(*) as count FROM scheduled_messages').first();
          
          return new Response(
            JSON.stringify({ 
              status: 'ok', 
              message: 'Database is healthy',
              database: 'connected',
              table: 'exists',
              recordCount: countResult?.count || 0
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (healthError: any) {
          return new Response(
            JSON.stringify({ 
              status: 'error', 
              message: 'Database health check failed',
              error: healthError?.message || String(healthError)
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 创建定时任务
      if (path === '/api/scheduled-messages' && request.method === 'POST') {
        const body: { userId: string; content: string; delaySeconds?: number; sendAt?: number } = await request.json();
        const { userId, content, delaySeconds, sendAt: providedSendAt } = body;

        if (!userId || !content) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: userId, content' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 支持两种方式：delaySeconds（延迟秒数）或 sendAt（具体时间戳）
        if (delaySeconds === undefined && providedSendAt === undefined) {
          return new Response(
            JSON.stringify({ error: 'Missing required field: either delaySeconds or sendAt must be provided' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured. Please check D1 database binding.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 计算发送时间：优先使用 sendAt，否则使用 delaySeconds
        const sendAt = providedSendAt !== undefined 
          ? providedSendAt 
          : Math.floor(Date.now() / 1000) + (delaySeconds || 0);
        const createdAt = Math.floor(Date.now() / 1000);

        // 验证发送时间是否在未来
        if (sendAt <= createdAt) {
          return new Response(
            JSON.stringify({ error: 'Send time must be in the future' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const result = await env.DB.prepare(
            'INSERT INTO scheduled_messages (user_id, content, send_at, status, created_at) VALUES (?, ?, ?, ?, ?)'
          )
            .bind(userId, content, sendAt, 'pending', createdAt)
            .run();

          if (!result.success) {
            return new Response(
              JSON.stringify({ error: 'Failed to insert message into database', details: result.error }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: '定时任务已设置',
              id: result.meta.last_row_id 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } catch (dbError: any) {
          console.error('Database error in scheduled-messages POST:', dbError);
          return new Response(
            JSON.stringify({ 
              error: 'Database error', 
              details: dbError?.message || String(dbError)
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 获取用户的定时任务列表
      if (path === '/api/scheduled-messages' && request.method === 'GET') {
        const userId = url.searchParams.get('userId');
        const checkNew = url.searchParams.get('checkNew'); // 检查是否有新发送的消息
        
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Missing userId parameter' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured. Please check D1 database binding.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          // 先清理已发送超过1分钟的消息（避免数据库满）
          await cleanupOldMessages(env);

          // 如果只是检查新消息，返回最近发送的消息
          if (checkNew === 'true') {
            const now = Math.floor(Date.now() / 1000);
            const oneMinuteAgo = now - 60;
            // 查找最近1分钟内发送的消息
            const { results } = await env.DB.prepare(
              "SELECT * FROM scheduled_messages WHERE user_id = ? AND status = 'sent' AND send_at >= ? ORDER BY send_at DESC LIMIT 10"
            )
              .bind(userId, oneMinuteAgo)
              .all<ScheduledMessage>();

            return new Response(
              JSON.stringify({ success: true, messages: results }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }

          // 正常获取所有消息
          const { results } = await env.DB.prepare(
            'SELECT * FROM scheduled_messages WHERE user_id = ? ORDER BY send_at ASC'
          )
            .bind(userId)
            .all<ScheduledMessage>();

          return new Response(
            JSON.stringify({ success: true, messages: results }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } catch (dbError: any) {
          console.error('Database error in scheduled-messages GET:', dbError);
          return new Response(
            JSON.stringify({ 
              error: 'Database error', 
              details: dbError?.message || String(dbError)
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 删除定时任务
      if (path.startsWith('/api/scheduled-messages/') && request.method === 'DELETE') {
        const id = path.split('/').pop();
        
        if (!id) {
          return new Response(
            JSON.stringify({ error: 'Missing message id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await env.DB.prepare('DELETE FROM scheduled_messages WHERE id = ?')
          .bind(id)
          .run();

        return new Response(
          JSON.stringify({ success: true, message: '定时任务已删除' }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // 测试接口 - 立即发送（用于测试）
      if (path === '/api/test-scheduled-message' && request.method === 'POST') {
        const body: { userId: string; content: string } = await request.json();
        const { userId, content } = body;

        if (!userId || !content) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: userId, content' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 检查数据库连接
        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured. Please check D1 database binding.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // 立即发送（延迟 0 秒）
        const sendAt = Math.floor(Date.now() / 1000);
        const createdAt = Math.floor(Date.now() / 1000);

        try {
          const result = await env.DB.prepare(
            'INSERT INTO scheduled_messages (user_id, content, send_at, status, created_at) VALUES (?, ?, ?, ?, ?)'
          )
            .bind(userId, content, sendAt, 'pending', createdAt)
            .run();

          // 检查插入结果
          if (!result.success) {
            return new Response(
              JSON.stringify({ error: 'Failed to insert message into database', details: result.error }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const messageId = result.meta.last_row_id;
          if (!messageId) {
            return new Response(
              JSON.stringify({ error: 'Failed to get message ID from database' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // 立即触发一次检查（通过 scheduled handler）
          // 注意：这需要手动触发，或者等待下一次 cron 执行
          // 为了测试，我们可以立即处理这条消息
          const msg: ScheduledMessage = { 
            id: messageId as number,
            user_id: userId, 
            content, 
            send_at: sendAt,
            status: 'pending'
          };
          
          // 异步发送，不阻塞响应（使用 ctx.waitUntil 确保任务完成）
          ctx.waitUntil(sendToUser(msg, env));

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: '测试消息已发送',
              id: messageId 
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } catch (dbError: any) {
          console.error('Database error in test-scheduled-message:', dbError);
          return new Response(
            JSON.stringify({ 
              error: 'Database error', 
              details: dbError?.message || String(dbError),
              hint: 'Please ensure the database table is created. Run: npx wrangler d1 execute scheduled-messages-db --file=./schema.sql'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 后台活动配置管理
      if (path === '/api/background-activity/config' && request.method === 'POST') {
        const body: { 
          userId: string; 
          enabled: boolean; 
          intervalSeconds: number; 
          activityConfig: Record<string, string>;
          apiConfig: { proxyUrl: string; apiKey: string; model: string; temperature?: number };
        } = await request.json();
        
        const { userId, enabled, intervalSeconds, activityConfig, apiConfig } = body;

        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Missing userId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const now = Math.floor(Date.now() / 1000);
          
          // 使用 INSERT OR REPLACE 来更新或插入配置
          await env.DB.prepare(
            `INSERT INTO background_activity_configs 
             (user_id, enabled, interval_seconds, activity_config, api_config, last_check_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               enabled = excluded.enabled,
               interval_seconds = excluded.interval_seconds,
               activity_config = excluded.activity_config,
               api_config = excluded.api_config,
               updated_at = excluded.updated_at`
          )
            .bind(
              userId,
              enabled ? 1 : 0,
              intervalSeconds || 60,
              JSON.stringify(activityConfig || {}),
              JSON.stringify(apiConfig || {}),
              now,
              now
            )
            .run();

          return new Response(
            JSON.stringify({ success: true, message: '后台活动配置已保存' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error: any) {
          console.error('保存后台活动配置失败:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to save config', details: error?.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 获取后台活动配置
      if (path === '/api/background-activity/config' && request.method === 'GET') {
        const userId = url.searchParams.get('userId');
        
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Missing userId parameter' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const result = await env.DB.prepare(
            'SELECT * FROM background_activity_configs WHERE user_id = ?'
          )
            .bind(userId)
            .first<BackgroundActivityConfig>();

          if (!result) {
            return new Response(
              JSON.stringify({ success: true, config: null }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              config: {
                enabled: result.enabled === 1,
                intervalSeconds: result.interval_seconds,
                activityConfig: JSON.parse(result.activity_config || '{}'),
                apiConfig: JSON.parse(result.api_config || '{}'),
                lastCheckAt: result.last_check_at,
                updatedAt: result.updated_at
              }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error: any) {
          console.error('获取后台活动配置失败:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to get config', details: error?.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 获取后台活动生成的消息
      if (path === '/api/background-activity/messages' && request.method === 'GET') {
        const userId = url.searchParams.get('userId');
        const checkNew = url.searchParams.get('checkNew') === 'true';
        
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Missing userId parameter' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          let query;
          if (checkNew) {
            // 只获取最近1分钟内的新消息
            const now = Math.floor(Date.now() / 1000);
            const oneMinuteAgo = now - 60;
            query = env.DB.prepare(
              "SELECT * FROM background_activity_messages WHERE user_id = ? AND status = 'pending' AND created_at >= ? ORDER BY created_at DESC LIMIT 50"
            ).bind(userId, oneMinuteAgo);
          } else {
            query = env.DB.prepare(
              "SELECT * FROM background_activity_messages WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 50"
            ).bind(userId);
          }

          const { results } = await query.all<BackgroundActivityMessage>();

          return new Response(
            JSON.stringify({ success: true, messages: results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error: any) {
          console.error('获取后台活动消息失败:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to get messages', details: error?.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 同步角色信息到后端
      if (path === '/api/background-activity/characters' && request.method === 'POST') {
        const body: { userId: string; characters: CharacterInfo[] } = await request.json();
        const { userId, characters } = body;

        if (!userId || !characters) {
          return new Response(
            JSON.stringify({ error: 'Missing userId or characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const now = Math.floor(Date.now() / 1000);
          
          // 批量更新或插入角色信息
          for (const char of characters) {
            await env.DB.prepare(
              `INSERT INTO character_info 
               (user_id, chat_id, chat_name, persona, relationship_status, last_activity_timestamp, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, chat_id) DO UPDATE SET
                 chat_name = excluded.chat_name,
                 persona = excluded.persona,
                 relationship_status = excluded.relationship_status,
                 last_activity_timestamp = excluded.last_activity_timestamp,
                 updated_at = excluded.updated_at`
            )
              .bind(
                userId,
                char.chatId,
                char.chatName,
                char.persona || '',
                char.relationshipStatus || '',
                char.lastActivityTimestamp || 0,
                now
              )
              .run();
          }

          return new Response(
            JSON.stringify({ success: true, message: `已同步 ${characters.length} 个角色信息` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error: any) {
          console.error('同步角色信息失败:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to sync characters', details: error?.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 标记消息为已发送
      if (path.startsWith('/api/background-activity/messages/') && request.method === 'PUT') {
        const id = path.split('/').pop();
        
        if (!id) {
          return new Response(
            JSON.stringify({ error: 'Missing message id' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          await env.DB.prepare(
            "UPDATE background_activity_messages SET status = 'sent' WHERE id = ?"
          )
            .bind(id)
            .run();

          return new Response(
            JSON.stringify({ success: true, message: '消息已标记为已发送' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error: any) {
          console.error('更新消息状态失败:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to update message', details: error?.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 手动触发检查并发送到期消息（用于前端主动触发）
      if (path === '/api/check-and-send' && request.method === 'POST') {
        if (!env.DB) {
          return new Response(
            JSON.stringify({ error: 'Database not configured. Please check D1 database binding.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const now = Math.floor(Date.now() / 1000);
          
          // 查询所有到期且未发送的消息
          const { results } = await env.DB.prepare(
            "SELECT * FROM scheduled_messages WHERE send_at <= ? AND status = 'pending'"
          )
            .bind(now)
            .all<ScheduledMessage>();

          console.log(`手动检查：发现 ${results.length} 条到期消息需要发送`);

          // 立即处理这些消息
          const sendPromises = results.map(msg => sendToUser(msg, env));
          await Promise.all(sendPromises);

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: `已处理 ${results.length} 条到期消息`,
              processed: results.length
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        } catch (error: any) {
          console.error('手动检查错误:', error);
          return new Response(
            JSON.stringify({ 
              error: 'Check failed', 
              details: error?.message || String(error)
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // 返回 404，包含调试信息
      return new Response(
        JSON.stringify({ 
          error: 'Not Found', 
          message: 'The requested endpoint does not exist',
          path: path,
          method: request.method,
          availableEndpoints: [
            'GET /api/health',
            'POST /api/scheduled-messages',
            'GET /api/scheduled-messages?userId=...',
            'DELETE /api/scheduled-messages/{id}',
            'POST /api/test-scheduled-message',
            'POST /api/check-and-send'
          ]
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (error: any) {
      console.error('Error in fetch handler:', error);
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack || '';
      
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error', 
          details: errorMessage
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  },

  // 2. 每分钟自动执行的任务
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    try {
      // 查询所有到期且未发送的消息
      const { results } = await env.DB.prepare(
        "SELECT * FROM scheduled_messages WHERE send_at <= ? AND status = 'pending'"
      )
        .bind(now)
        .all<ScheduledMessage>();

      console.log(`Found ${results.length} messages to send`);

      // 使用 ctx.waitUntil 保证即使 scheduled 返回了，异步任务也能执行完
      for (const msg of results) {
        ctx.waitUntil(sendToUser(msg, env));
      }

      // 清理已发送超过1分钟的消息（避免数据库满）
      ctx.waitUntil(cleanupOldMessages(env));

      // 执行后台活动检查
      ctx.waitUntil(runBackgroundActivityCheck(env, now));
    } catch (error) {
      console.error('Error in scheduled handler:', error);
    }
  },

};

// 发送消息给用户（独立函数）
async function sendToUser(msg: ScheduledMessage, env: Env): Promise<void> {
    try {
      console.log(`正在为用户 ${msg.user_id} 发送消息: ${msg.content}`);

      // TODO: 在这里实现实际的发送逻辑
      // 例如：
      // 1. 调用 AI 接口生成回复
      // 2. 通过 Webhook 发送给用户
      // 3. 通过 WebSocket 推送
      // 4. 发送浏览器通知（需要用户在前端订阅）

      // 这里可以调用 Workers AI 或其他服务
      // const aiResponse = await this.callAI(msg.content, env);
      
      // 示例：发送 Webhook（如果有配置）
      // if (env.WEBHOOK_URL) {
      //   await fetch(env.WEBHOOK_URL, {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify({
      //       userId: msg.user_id,
      //       content: msg.content,
      //       // aiResponse: aiResponse
      //     }),
      //   });
      // }

      // 成功后更新状态
      await env.DB.prepare('UPDATE scheduled_messages SET status = ? WHERE id = ?')
        .bind('sent', msg.id)
        .run();

      console.log(`消息 ${msg.id} 发送成功`);
    } catch (error) {
      console.error(`发送消息 ${msg.id} 失败:`, error);
      
      // 更新为失败状态
      await env.DB.prepare('UPDATE scheduled_messages SET status = ? WHERE id = ?')
        .bind('failed', msg.id)
        .run();
    }
}

// 清理已发送超过1分钟的消息（避免数据库满）
async function cleanupOldMessages(env: Env): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    // 删除已发送状态且发送时间超过1分钟（60秒）的消息
    const oneMinuteAgo = now - 60;
    
    const result = await env.DB.prepare(
      "DELETE FROM scheduled_messages WHERE status = 'sent' AND send_at <= ?"
    )
      .bind(oneMinuteAgo)
      .run();

    if (result.success && result.meta.changes > 0) {
      console.log(`清理了 ${result.meta.changes} 条已发送超过1分钟的消息`);
    }

    // 清理已发送超过1分钟的后台活动消息
    const bgResult = await env.DB.prepare(
      "DELETE FROM background_activity_messages WHERE status = 'sent' AND created_at <= ?"
    )
      .bind(oneMinuteAgo)
      .run();

    if (bgResult.success && bgResult.meta.changes > 0) {
      console.log(`清理了 ${bgResult.meta.changes} 条已发送超过1分钟的后台活动消息`);
    }
  } catch (error) {
    console.error('清理旧消息时出错:', error);
  }
}

// 执行后台活动检查
async function runBackgroundActivityCheck(env: Env, now: number): Promise<void> {
  try {
    // 获取所有启用的后台活动配置
    const { results: configs } = await env.DB.prepare(
      "SELECT * FROM background_activity_configs WHERE enabled = 1"
    )
      .all<BackgroundActivityConfig>();

    console.log(`检查 ${configs.length} 个启用的后台活动配置`);

    const frequencyProbabilities = {
      low: 0.3,
      medium: 0.5,
      high: 0.8,
    };

    for (const config of configs) {
      // 检查是否到了检查时间
      const timeSinceLastCheck = now - config.last_check_at;
      if (timeSinceLastCheck < config.interval_seconds) {
        continue; // 还没到检查时间
      }

      try {
        const activityConfig = JSON.parse(config.activity_config || '{}');
        const apiConfig = JSON.parse(config.api_config || '{}');

        if (!apiConfig.proxyUrl || !apiConfig.apiKey || !apiConfig.model) {
          console.log(`用户 ${config.user_id} 的 API 配置不完整，跳过`);
          continue;
        }

        // 获取该用户的角色信息
        const { results: characters } = await env.DB.prepare(
          'SELECT * FROM character_info WHERE user_id = ? AND relationship_status = ?'
        )
          .bind(config.user_id, 'friend')
          .all<any>();

        if (characters.length === 0) {
          console.log(`用户 ${config.user_id} 没有好友角色，跳过`);
          // 更新最后检查时间
          await env.DB.prepare(
            'UPDATE background_activity_configs SET last_check_at = ? WHERE id = ?'
          )
            .bind(now, config.id)
            .run();
          continue;
        }

        // 检查每个角色的频率设置
        for (const char of characters) {
          const frequency = activityConfig[char.chat_id];
          if (!frequency) continue;

          const probability = frequencyProbabilities[frequency as keyof typeof frequencyProbabilities];
          if (!probability) continue;

          // 检查距离上次活动的时间
          const lastActivityTimestamp = char.last_activity_timestamp || 0;
          const timeSinceLastActivity = now - Math.floor(lastActivityTimestamp / 1000);
          
          if (timeSinceLastActivity < config.interval_seconds) {
            continue; // 还没到活动时间
          }

          // 随机决定是否行动
          if (Math.random() < probability) {
            console.log(`用户 ${config.user_id} 的角色 "${char.chat_name}" 被唤醒，生成消息...`);
            
            // 生成消息
            const generatedContent = await generateBackgroundActivityMessage(
              env,
              config.user_id,
              char.chat_id,
              char.chat_name,
              char.persona || '',
              apiConfig
            );

            if (generatedContent) {
              // 保存生成的消息
              await env.DB.prepare(
                `INSERT INTO background_activity_messages 
                 (user_id, chat_id, chat_name, content, status, created_at)
                 VALUES (?, ?, ?, ?, 'pending', ?)`
              )
                .bind(config.user_id, char.chat_id, char.chat_name, generatedContent, now)
                .run();

              // 更新角色的最后活动时间戳
              await env.DB.prepare(
                'UPDATE character_info SET last_activity_timestamp = ?, updated_at = ? WHERE user_id = ? AND chat_id = ?'
              )
                .bind(Date.now(), now, config.user_id, char.chat_id)
                .run();

              console.log(`已为用户 ${config.user_id} 的角色 "${char.chat_name}" 生成消息`);
            }
          }
        }
        
        // 更新最后检查时间
        await env.DB.prepare(
          'UPDATE background_activity_configs SET last_check_at = ? WHERE id = ?'
        )
          .bind(now, config.id)
          .run();

        console.log(`已更新用户 ${config.user_id} 的最后检查时间`);
      } catch (error) {
        console.error(`处理用户 ${config.user_id} 的后台活动配置时出错:`, error);
      }
    }
  } catch (error) {
    console.error('执行后台活动检查时出错:', error);
  }
}

// 在后端生成后台活动消息（需要角色信息）
async function generateBackgroundActivityMessage(
  env: Env,
  userId: string,
  chatId: string,
  chatName: string,
  chatPersona: string,
  apiConfig: { proxyUrl: string; apiKey: string; model: string; temperature?: number }
): Promise<string | null> {
  try {
    const systemPrompt = `你是角色"${chatName}"，正在给用户发送一条消息。

# 你的角色设定
${chatPersona}

# 任务要求
请以"${chatName}"的身份和语气，生成一条自然、符合人设的消息发送给用户。消息应该：
1. 符合角色的性格和人设
2. 自然流畅，就像角色主动发来的消息
3. 长度适中（50-200字左右）

请直接返回消息内容，不要添加任何解释或标记。`;

    const messagesForApi = [
      { role: "system", content: systemPrompt },
      { role: "user", content: "请生成一条消息。" }
    ];

    // 判断是否为Gemini API
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
    const isGemini = apiConfig.proxyUrl === GEMINI_API_URL || apiConfig.proxyUrl?.includes("generativelanguage.googleapis.com");
    
    let requestUrl, requestHeaders, requestBody;
    
    if (isGemini) {
      requestUrl = `${GEMINI_API_URL}/${apiConfig.model}:generateContent?key=${apiConfig.apiKey}`;
      requestHeaders = { "Content-Type": "application/json" };
      requestBody = {
        contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n请生成一条消息。" }] }],
        generationConfig: {
          temperature: parseFloat(String(apiConfig.temperature)) || 0.8,
        },
      };
    } else {
      requestUrl = `${apiConfig.proxyUrl}/v1/chat/completions`;
      requestHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiConfig.apiKey}`,
      };
      requestBody = {
        model: apiConfig.model,
        messages: messagesForApi,
        temperature: parseFloat(String(apiConfig.temperature)) || 0.8,
        stream: false,
      };
    }

    // 调用API
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data: any = await response.json();
      let generatedContent: string | undefined;
      
      if (isGemini) {
        generatedContent = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      } else {
        generatedContent = data?.choices?.[0]?.message?.content?.trim();
      }
      
      return generatedContent || null;
    } else {
      const errorText = await response.text();
      console.error('API调用失败:', errorText);
      return null;
    }
  } catch (error) {
    console.error('生成后台活动消息时出错:', error);
    return null;
  }
}
