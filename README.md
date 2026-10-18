# QW电竞 后端 (Cloudflare Pages)

## 目录结构

```
/
├── public/
│   └── index.html          # 静态首页
├── functions/
│   └── api/
│       └── [[path]].js     # 全部 /api/* 接口
└── package.json
```

## Cloudflare Pages 部署设置

| 字段 | 填写 |
|------|------|
| 框架预设 | None |
| 构建命令 | 留空 |
| 构建输出目录 | `public` |
| 根目录 | `/` |

部署成功后访问：
- 首页：`https://你的项目.pages.dev`
- 健康检查：`https://你的项目.pages.dev/api/health`

App 后端地址填：`https://你的项目.pages.dev`（不要末尾斜杠）

## 绑定 D1（可选，持久化）

Pages 项目 → 设置 → 函数 → 绑定 D1，变量名：`DB`
