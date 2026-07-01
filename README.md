# Landing Page

## 本地启动

```bash
npm start
```

打开：

- 前台：`http://localhost:5173`
- 后台：`http://localhost:5173/admin`

## 自动同步到线上

如果你想在本地修改后自动推送到 GitHub，并让 GitHub Pages 自动更新，运行：

```bash
npm run sync:watch
```

这个命令会监听本地改动，自动同步静态页面文件并推送到 `main` 分支。GitHub Pages 会在推送后自动重新部署。

## 上线提醒

后台保存密码默认是 `admin123456`。正式上线时请设置环境变量：

```bash
ADMIN_PASSWORD="你的强密码" npm start
```

可在后台修改：

- WhatsApp 跳转号码
- WhatsApp 自动打招呼文案
- Facebook Pixel ID
