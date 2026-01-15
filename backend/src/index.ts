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

export default {
  // 1. 接收用户定义的定时任务
  async fetch(request: Request, env: Env): Promise<Response> {
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
      // 创建定时任务
      if (path === '/api/scheduled-messages' && request.method === 'POST') {
        const body: { userId: string; content: string; delaySeconds: number } = await request.json();
        const { userId, content, delaySeconds } = body;

        if (!userId || !content || delaySeconds === undefined) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: userId, content, delaySeconds' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const sendAt = Math.floor(Date.now() / 1000) + delaySeconds;
        const createdAt = Math.floor(Date.now() / 1000);

        const result = await env.DB.prepare(
          'INSERT INTO scheduled_messages (user_id, content, send_at, status, created_at) VALUES (?, ?, ?, ?, ?)'
        )
          .bind(userId, content, sendAt, 'pending', createdAt)
          .run();

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
      }

      // 获取用户的定时任务列表
      if (path === '/api/scheduled-messages' && request.method === 'GET') {
        const userId = url.searchParams.get('userId');
        
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Missing userId parameter' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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

        // 立即发送（延迟 0 秒）
        const sendAt = Math.floor(Date.now() / 1000);
        const createdAt = Math.floor(Date.now() / 1000);

        const result = await env.DB.prepare(
          'INSERT INTO scheduled_messages (user_id, content, send_at, status, created_at) VALUES (?, ?, ?, ?, ?)'
        )
          .bind(userId, content, sendAt, 'pending', createdAt)
          .run();

        // 立即触发一次检查（通过 scheduled handler）
        // 注意：这需要手动触发，或者等待下一次 cron 执行
        // 为了测试，我们可以立即处理这条消息
        const msg: ScheduledMessage = { 
          id: result.meta.last_row_id as number,
          user_id: userId, 
          content, 
          send_at: sendAt,
          status: 'pending'
        };
        
        // 异步发送，不阻塞响应
        setTimeout(async () => {
          await sendToUser(msg, env);
        }, 0);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: '测试消息已发送',
            id: result.meta.last_row_id 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('Error in fetch handler:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error', details: String(error) }),
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
