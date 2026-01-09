// Service Worker for PWA Notifications
// 用于在后台发送浏览器原生通知（支持 Push Notification）

const CACHE_NAME = 'ephone-notification-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker 安装中...');
  self.skipWaiting(); // 立即激活新的 Service Worker
  
  // 预缓存资源以确保离线可用
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        './',
        './index.html',
        './manifest.json'
      ]).catch(err => {
        console.log('缓存资源失败:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker 已激活');
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // 立即控制所有页面
      // 清理旧缓存
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('删除旧缓存:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// 监听来自主线程的通知请求
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        ...options,
        badge: options.badge || 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
        icon: options.icon || 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
        tag: options.tag || 'ephone-notification',
        requireInteraction: options.requireInteraction || false,
        silent: options.silent || false,
        vibrate: options.vibrate || [200, 100, 200],
        data: options.data || {}
      })
    );
  }
  
  // 处理推送订阅请求
  if (event.data && event.data.type === 'GET_SUBSCRIPTION') {
    event.waitUntil(
      self.registration.pushManager.getSubscription().then((subscription) => {
        event.ports[0].postMessage({ subscription: subscription });
      })
    );
  }
});

// 处理 Push Notification 事件（真正的推送通知）
self.addEventListener('push', (event) => {
  console.log('收到 Push 通知:', event);
  
  let notificationData = {
    title: '新消息',
    body: '您有一条新消息',
    icon: 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
    badge: 'https://i.postimg.cc/Kj8JnRcp/267611-CC01-F8-A3-B4910-A2-C2-FFDE479-DC.jpg',
    tag: 'ephone-push-notification',
    vibrate: [200, 100, 200],
    data: {}
  };

  // 如果推送数据包含 JSON，解析它
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        ...data,
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        data: data.data || notificationData.data
      };
    } catch (e) {
      // 如果不是 JSON，尝试作为文本
      notificationData.body = event.data.text() || notificationData.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData)
  );
});

// 后台同步 - 确保在后台也能发送通知
self.addEventListener('sync', (event) => {
  console.log('后台同步事件:', event.tag);
  
  if (event.tag === 'send-notification') {
    event.waitUntil(
      // 这里可以添加需要后台同步的逻辑
      // 例如：发送待发送的通知
      Promise.resolve()
    );
  }
});

// 处理通知点击事件
self.addEventListener('notificationclick', (event) => {
  console.log('通知被点击:', event.notification);
  event.notification.close();

  const notificationData = event.notification.data || {};
  const chatId = notificationData.chatId;
  const notificationType = notificationData.type;

  // 打开或聚焦到应用
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 如果已经有打开的窗口，聚焦它并发送消息
      for (let client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // 根据通知类型发送不同的消息
          if (notificationType === 'kk-checkin-complete' && chatId) {
            // 查岗完成通知：打开查岗界面
            client.postMessage({
              type: 'OPEN_KK_CHECKIN',
              charId: chatId
            });
          } else if (chatId) {
            // 普通聊天通知：打开对应聊天
            client.postMessage({
              type: 'OPEN_CHAT',
              chatId: chatId
            });
          }
          return client.focus();
        }
      }
      // 如果没有打开的窗口，打开一个新窗口
      if (clients.openWindow) {
        let url = '/';
        if (notificationType === 'kk-checkin-complete' && chatId) {
          url = `/?openKkCheckin=${chatId}`;
        } else if (chatId) {
          url = `/?openChat=${chatId}`;
        }
        return clients.openWindow(url);
      }
    })
  );
});

