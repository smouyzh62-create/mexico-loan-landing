# Cloudflare 部署

这个项目可以用 Cloudflare Worker 作为线上后台 API，前台继续保留在 GitHub Pages。

## 需要做的事

1. 在 Cloudflare 创建一个 Worker
2. 创建一个 KV Namespace，并绑定到 `SITE_CONFIG_KV`
3. 把 `wrangler.toml` 里的 `REPLACE_WITH_KV_NAMESPACE_ID` 改成真实 ID
4. 设置 Worker 环境变量 `ADMIN_PASSWORD`
5. 如果你想用固定域名，给 Worker 配一个子域名，例如 `api.ustrade.cc`

## 运行方式

Worker 提供这些接口：

- `GET /api/config`
- `POST /api/config`
- `GET /api/deploy-status`
- `GET /config.js`

## 前台配置

前台和后台都从 `config.json` 里的 `apiBaseUrl` 读取配置地址。

当前默认值：

- `https://api.ustrade.cc`

如果你的 Worker 地址不同，请修改 `config.json` 后重新同步发布。
