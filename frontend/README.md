# 前端部署 / Frontend Deployment

## Cloudflare Pages 部署

1. 在 Cloudflare Dashboard 中创建新的 Pages 项目
2. 连接你的 Git 仓库
3. 设置构建配置：
   - **Build command**: （留空，无需构建）
   - **Build output directory**: `/`（当前文件夹）
   - **Root directory**: `/`（当前文件夹）

## 文件说明

- `index.html` - 主入口文件
- `*.js` - 所有 JavaScript 模块
- `style.css` - 样式文件
- `sw.js` - Service Worker（PWA 支持）
- `manifest.json` - PWA 清单文件
- `.nojekyll` - GitHub Pages 支持文件

## 注意事项

- 所有文件路径使用相对路径，可以直接部署
- Worker API 默认使用开发者的公共端点：`https://scheduled-messages-worker.wcl20091007.workers.dev`
- 如需修改 Worker API 地址，请编辑 `app-core.js` 中的 `DEFAULT_WORKER_API_URL`
