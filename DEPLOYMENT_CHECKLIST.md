# 部署检查清单 / Deployment Checklist

## Backend 文件夹（Cloudflare Workers）

### ✅ 必需文件检查

- [x] `package.json` - 依赖和脚本配置
- [x] `wrangler.toml` - Worker 配置
- [x] `tsconfig.json` - TypeScript 配置
- [x] `src/index.ts` - Worker 主文件
- [x] `schema.sql` - 数据库表结构
- [x] `README.md` - 部署说明
- [x] `.gitignore` - Git 忽略文件

### 部署步骤

1. 进入 `backend` 文件夹
2. 运行 `npm install` 安装依赖
3. 创建 D1 数据库：`npx wrangler d1 create scheduled-messages-db`
4. 更新 `wrangler.toml` 中的 `database_id`
5. 初始化数据库：`npx wrangler d1 execute scheduled-messages-db --file=./schema.sql`
6. 部署：`npm run deploy` 或使用 Cloudflare Dashboard

### Cloudflare Dashboard 部署

1. 在 Cloudflare Dashboard 中选择 Workers & Pages
2. 创建新的 Worker
3. 上传 `backend` 文件夹或连接 Git 仓库
4. 设置根目录为 `backend`
5. 配置 D1 数据库绑定

---

## Frontend 文件夹（Cloudflare Pages）

### ✅ 必需文件检查

- [x] `index.html` - 主入口文件
- [x] `*.js` - 所有 JavaScript 模块（20个文件）
- [x] `style.css` - 样式文件
- [x] `sw.js` - Service Worker
- [x] `manifest.json` - PWA 清单
- [x] `.nojekyll` - GitHub Pages 支持
- [x] `README.md` - 部署说明

### 部署步骤

1. 在 Cloudflare Dashboard 中选择 Workers & Pages
2. 创建新的 Pages 项目
3. 连接 Git 仓库或直接上传 `frontend` 文件夹
4. 设置构建配置：
   - **Build command**: （留空）
   - **Build output directory**: `/`（当前文件夹）
   - **Root directory**: `/`（如果从根目录部署，设置为 `frontend`）

### 重要提示

- 所有文件路径使用相对路径，无需修改
- Worker API 默认使用开发者的公共端点
- 如需修改 Worker API 地址，编辑 `app-core.js` 中的 `DEFAULT_WORKER_API_URL`

---

## 验证清单

### Backend 验证

- [ ] Worker 可以正常部署
- [ ] D1 数据库已创建并初始化
- [ ] API 端点可以访问（测试 `/api/test-scheduled-message`）
- [ ] Cron 触发器正常工作

### Frontend 验证

- [ ] 页面可以正常加载
- [ ] Service Worker 已注册
- [ ] PWA 功能正常
- [ ] Worker API 连接正常（使用默认或自定义 URL）

---

## 常见问题

### Q: 两个文件夹可以部署到同一个 Cloudflare 账户吗？
A: 可以，但需要分别创建两个项目：
- 一个 Workers 项目（backend）
- 一个 Pages 项目（frontend）

### Q: 如何更新 Worker API URL？
A: 编辑 `frontend/app-core.js` 第 7 行的 `DEFAULT_WORKER_API_URL` 常量

### Q: 前端需要构建步骤吗？
A: 不需要，所有文件都是静态文件，可以直接部署

### Q: Worker 需要环境变量吗？
A: 目前不需要，但可以在 `wrangler.toml` 中配置（如 `WEBHOOK_URL`）
