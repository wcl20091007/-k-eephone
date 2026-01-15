# 部署说明 / Deployment Guide

## 项目结构 / Project Structure

```
-k-eephone-1/
├── frontend/          # 前端文件（部署到 Cloudflare Pages/Netlify）
│   ├── index.html
│   ├── *.js
│   ├── style.css
│   ├── sw.js
│   └── manifest.json
└── backend/           # Worker 后端（部署到 Cloudflare Workers）
    ├── src/
    │   └── index.ts
    ├── wrangler.toml
    └── package.json
```

## 前端部署 / Frontend Deployment

### Cloudflare Pages

1. 在 Cloudflare Dashboard 中创建新的 Pages 项目
2. 连接你的 Git 仓库
3. 设置构建配置：
   - **Build command**: （留空，无需构建）
   - **Build output directory**: `frontend`
   - **Root directory**: `/`（项目根目录）

### Netlify

1. 在 Netlify Dashboard 中创建新站点
2. 连接你的 Git 仓库
3. 设置构建配置：
   - **Base directory**: `/`（项目根目录）
   - **Publish directory**: `frontend`
   - **Build command**: （留空，无需构建）

### GitHub Pages

1. 在 GitHub 仓库设置中启用 Pages
2. 设置 Source 为 `frontend` 文件夹
3. 确保 `frontend/.nojekyll` 文件存在（已包含）

## Worker 部署 / Worker Deployment

Worker 使用开发者的公共端点，用户无需自己部署。

如需部署自己的 Worker（可选）：

1. 进入 `backend` 目录
2. 安装依赖：`npm install`
3. 创建 D1 数据库：`npx wrangler d1 create scheduled-messages-db`
4. 更新 `wrangler.toml` 中的 `database_id`
5. 初始化数据库：`npx wrangler d1 execute scheduled-messages-db --file=./schema.sql`
6. 部署：`npm run deploy`

详细说明请参考 `backend/README.md`

## Worker API 配置 / Worker API Configuration

前端默认使用开发者的公共 Worker API：
- 默认 URL: `https://scheduled-messages-worker.your-subdomain.workers.dev`
- 用户可以在 API 设置中修改此地址（如果需要使用自定义 Worker）

The frontend uses the developer's public Worker API by default:
- Default URL: `https://scheduled-messages-worker.your-subdomain.workers.dev`
- Users can modify this in API settings if they want to use a custom Worker

## 注意事项 / Notes

- 前端和 Worker 可以分开部署到不同的平台
- Worker 使用开发者的公共端点，用户无需自己部署
- 所有前端文件都在 `frontend` 文件夹中，便于单独部署

- Frontend and Worker can be deployed to different platforms separately
- Worker uses developer's public endpoint, users don't need to deploy their own
- All frontend files are in the `frontend` folder for easy separate deployment
