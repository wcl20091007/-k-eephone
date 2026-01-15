# 项目结构说明 / Project Structure

## 中文说明

### 目录结构

```
-k-eephone-1/
├── frontend/              # 前端文件（可独立部署到 Cloudflare Pages）
│   ├── index.html         # 主 HTML 文件
│   ├── app-core.js        # 核心应用逻辑
│   ├── app-state.js       # 状态管理
│   ├── style.css          # 样式文件
│   ├── sw.js             # Service Worker（PWA 支持）
│   ├── manifest.json     # PWA 清单文件
│   ├── DEPLOYMENT.md     # 前端部署说明
│   └── ...               # 其他功能模块文件
│
├── backend/              # 后端 Worker（部署到 Cloudflare Workers）
│   ├── src/
│   │   └── index.ts      # Worker 主文件
│   ├── wrangler.toml     # Worker 配置文件
│   ├── schema.sql        # 数据库表结构
│   ├── package.json      # 依赖配置
│   ├── tsconfig.json     # TypeScript 配置
│   └── README.md         # 后端部署说明
│
└── README.md             # 项目主说明文件
```

### 部署方式

#### 1. 后端 Worker 部署（开发者）

后端 Worker 需要先部署，获取 Worker API 地址：

```bash
cd backend
npm install
npx wrangler d1 create scheduled-messages-db
# 将 database_id 填入 wrangler.toml
npx wrangler d1 execute scheduled-messages-db --file=./schema.sql
npm run deploy
```

部署后会得到 Worker URL，例如：
```
https://scheduled-messages-worker.your-subdomain.workers.dev
```

#### 2. 配置前端默认 Worker API

在部署前端前，需要更新 `frontend/app-core.js` 中的默认 Worker API 地址：

```javascript
const DEFAULT_WORKER_API_URL = "https://scheduled-messages-worker.your-subdomain.workers.dev";
```

替换为实际部署的 Worker URL。

#### 3. 前端部署（独立部署）

前端可以部署到 Cloudflare Pages 或其他静态托管服务：

```bash
cd frontend
npx wrangler pages deploy . --project-name=your-frontend-project
```

详细说明请参考 `frontend/DEPLOYMENT.md`。

### 用户使用说明

**用户无需部署 Worker**，前端默认使用开发者的公共 Worker API。

用户只需要：
1. 访问前端应用
2. 在 API 设置中启用"定时发送"功能
3. 用户 ID 会自动使用设备码
4. 直接使用，无需配置 Worker API（除非想使用自定义 Worker）

### 分离部署的优势

1. **独立扩展**：前端和后端可以独立扩展和更新
2. **成本优化**：前端使用 Pages（免费额度大），后端使用 Workers（按请求计费）
3. **灵活部署**：前端可以部署到多个 CDN，后端只需一个 Worker
4. **易于维护**：代码分离，职责清晰

---

## English Instructions

### Directory Structure

```
-k-eephone-1/
├── frontend/              # Frontend files (deploy independently to Cloudflare Pages)
│   ├── index.html         # Main HTML file
│   ├── app-core.js        # Core application logic
│   ├── app-state.js       # State management
│   ├── style.css          # Styles
│   ├── sw.js             # Service Worker (PWA support)
│   ├── manifest.json     # PWA manifest
│   ├── DEPLOYMENT.md     # Frontend deployment guide
│   └── ...               # Other feature module files
│
├── backend/              # Backend Worker (deploy to Cloudflare Workers)
│   ├── src/
│   │   └── index.ts      # Worker main file
│   ├── wrangler.toml     # Worker configuration
│   ├── schema.sql        # Database schema
│   ├── package.json      # Dependencies
│   ├── tsconfig.json     # TypeScript config
│   └── README.md         # Backend deployment guide
│
└── README.md             # Main project README
```

### Deployment

#### 1. Backend Worker Deployment (Developer)

Deploy the backend Worker first to get the Worker API URL:

```bash
cd backend
npm install
npx wrangler d1 create scheduled-messages-db
# Fill database_id in wrangler.toml
npx wrangler d1 execute scheduled-messages-db --file=./schema.sql
npm run deploy
```

You'll get a Worker URL like:
```
https://scheduled-messages-worker.your-subdomain.workers.dev
```

#### 2. Configure Frontend Default Worker API

Before deploying the frontend, update the default Worker API URL in `frontend/app-core.js`:

```javascript
const DEFAULT_WORKER_API_URL = "https://scheduled-messages-worker.your-subdomain.workers.dev";
```

Replace with your actual deployed Worker URL.

#### 3. Frontend Deployment (Independent)

Deploy the frontend to Cloudflare Pages or other static hosting:

```bash
cd frontend
npx wrangler pages deploy . --project-name=your-frontend-project
```

See `frontend/DEPLOYMENT.md` for details.

### User Instructions

**Users don't need to deploy the Worker**. The frontend uses the developer's public Worker API by default.

Users only need to:
1. Access the frontend application
2. Enable "Scheduled Messages" in API settings
3. User ID will auto-use device code
4. Use directly without configuring Worker API (unless using custom Worker)

### Benefits of Separate Deployment

1. **Independent Scaling**: Frontend and backend can scale and update independently
2. **Cost Optimization**: Frontend uses Pages (large free tier), backend uses Workers (pay per request)
3. **Flexible Deployment**: Frontend can deploy to multiple CDNs, backend needs only one Worker
4. **Easy Maintenance**: Code separation, clear responsibilities
