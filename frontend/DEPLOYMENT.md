# 前端部署说明 / Frontend Deployment Guide

## 中文说明

### 概述

前端文件已整理到 `frontend` 文件夹中，可以独立部署到 Cloudflare Pages 或其他静态托管服务。

### 部署前配置

#### 1. 配置开发者的 Worker API 地址

在部署前，需要更新 `app-core.js` 文件中的默认 Worker API 地址：

1. 打开 `frontend/app-core.js`
2. 找到第 7 行的 `DEFAULT_WORKER_API_URL`
3. 将占位符 URL 替换为你实际部署的 Worker 地址：

```javascript
const DEFAULT_WORKER_API_URL = "https://scheduled-messages-worker.your-subdomain.workers.dev";
```

替换为：

```javascript
const DEFAULT_WORKER_API_URL = "https://your-actual-worker.your-subdomain.workers.dev";
```

**重要**：用户无需自己部署 Worker，前端默认使用开发者的公共 Worker API。

### 部署到 Cloudflare Pages

#### 方法 1: 通过 Wrangler CLI

```bash
cd frontend
npx wrangler pages deploy . --project-name=your-project-name
```

#### 方法 2: 通过 Cloudflare Dashboard

1. 登录 Cloudflare Dashboard
2. 进入 Workers & Pages
3. 点击 "Create a project"
4. 选择 "Upload assets"
5. 上传 `frontend` 文件夹中的所有文件
6. 设置项目名称并部署

#### 方法 3: 通过 Git 连接

1. 在 Cloudflare Dashboard 中创建 Pages 项目
2. 连接到你的 Git 仓库
3. 设置构建配置：
   - Build command: (留空，因为是静态文件)
   - Build output directory: `frontend`
   - Root directory: `/`

### 部署到其他静态托管服务

前端是纯静态文件，可以部署到任何静态托管服务：

- **Netlify**: 拖拽 `frontend` 文件夹到 Netlify
- **Vercel**: 使用 Vercel CLI 或 Dashboard
- **GitHub Pages**: 推送到 GitHub 并启用 Pages
- **其他**: 任何支持静态文件托管的服务

### 文件结构

```
frontend/
├── index.html          # 主 HTML 文件
├── app-core.js         # 核心应用逻辑（包含 Worker API 配置）
├── app-state.js        # 状态管理
├── style.css           # 样式文件
├── sw.js              # Service Worker（PWA 支持）
├── manifest.json       # PWA 清单文件
└── ...                # 其他功能模块文件
```

### 注意事项

1. **Worker API 配置**：确保在 `app-core.js` 中配置了正确的默认 Worker API 地址
2. **Service Worker**：如果使用 HTTPS，Service Worker 会自动注册
3. **CORS**：确保 Worker 已配置 CORS 头，允许前端域名访问
4. **缓存**：部署后清除浏览器缓存以确保加载最新版本

---

## English Instructions

### Overview

Frontend files are organized in the `frontend` folder and can be deployed independently to Cloudflare Pages or other static hosting services.

### Pre-deployment Configuration

#### 1. Configure Developer's Worker API URL

Before deployment, update the default Worker API URL in `app-core.js`:

1. Open `frontend/app-core.js`
2. Find `DEFAULT_WORKER_API_URL` on line 7
3. Replace the placeholder URL with your actual deployed Worker URL:

```javascript
const DEFAULT_WORKER_API_URL = "https://scheduled-messages-worker.your-subdomain.workers.dev";
```

Replace with:

```javascript
const DEFAULT_WORKER_API_URL = "https://your-actual-worker.your-subdomain.workers.dev";
```

**Important**: Users don't need to deploy their own Worker. The frontend uses the developer's public Worker API by default.

### Deploy to Cloudflare Pages

#### Method 1: Via Wrangler CLI

```bash
cd frontend
npx wrangler pages deploy . --project-name=your-project-name
```

#### Method 2: Via Cloudflare Dashboard

1. Log in to Cloudflare Dashboard
2. Go to Workers & Pages
3. Click "Create a project"
4. Select "Upload assets"
5. Upload all files from the `frontend` folder
6. Set project name and deploy

#### Method 3: Via Git Connection

1. Create a Pages project in Cloudflare Dashboard
2. Connect to your Git repository
3. Set build configuration:
   - Build command: (leave empty, static files)
   - Build output directory: `frontend`
   - Root directory: `/`

### Deploy to Other Static Hosting Services

The frontend is pure static files and can be deployed to any static hosting service:

- **Netlify**: Drag and drop the `frontend` folder to Netlify
- **Vercel**: Use Vercel CLI or Dashboard
- **GitHub Pages**: Push to GitHub and enable Pages
- **Others**: Any service that supports static file hosting

### File Structure

```
frontend/
├── index.html          # Main HTML file
├── app-core.js         # Core application logic (includes Worker API config)
├── app-state.js        # State management
├── style.css           # Styles
├── sw.js              # Service Worker (PWA support)
├── manifest.json       # PWA manifest
└── ...                # Other feature module files
```

### Notes

1. **Worker API Configuration**: Ensure the correct default Worker API URL is configured in `app-core.js`
2. **Service Worker**: Service Worker will auto-register if using HTTPS
3. **CORS**: Ensure Worker has CORS headers configured to allow frontend domain access
4. **Cache**: Clear browser cache after deployment to ensure latest version loads
