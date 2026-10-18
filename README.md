# QW 电竞后端 Worker

## 仓库文件结构（必须在根目录）

```
/
├── wrangler.toml
├── package.json
├── index.js
└── src/
    └── index.js
```

## Cloudflare Git 部署设置

- 构建命令：留空
- 部署命令：`npx wrangler deploy --config wrangler.toml`
- 根目录：`/`

## 本地测试

```
npx wrangler deploy
```
