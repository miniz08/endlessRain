# Gateway 与前端完整度增强开发拆解文档

生成日期：2026-05-03

## 1. 本阶段目标

本阶段补齐两个答辩演示缺口：

1. `api_gateway` 不只做转发，也提供上游健康聚合、路由表、代理指标和审计日志查询。
2. 前端新增运维控制台与私信页面，让管理视角和聊天服务不再只停留在后端接口。

## 2. Gateway 新增接口

新增文件：

```text
api_gateway/src/gatewayStatus.ts
api_gateway/src/lib/prisma.ts
```

新增接口：

| 路径 | 权限 | 用途 |
| --- | --- | --- |
| `GET /api/gateway/health` | 公开 | 聚合 `user_service`、`blog_service`、`ai_service`、`chat_service` 的 `/health` |
| `GET /api/gateway/routes` | 公开 | 返回 gateway 当前路由表、目标地址和前缀重写规则 |
| `GET /api/gateway/metrics` | 公开 | 返回按路由统计的请求次数、错误数、最近状态码和耗时 |
| `GET /api/gateway/audit-logs` | `admin` / `reviewer` | 查询 `audit_log` 最近记录 |

`metrics` 通过中间件在代理前记录，不侵入各业务服务。`audit-logs` 使用 access token 中的角色做轻量权限校验。

## 3. 前端新增页面

新增页面：

```text
mofukaze/pages/ops.vue
mofukaze/pages/chat.vue
```

新增导航：

```text
mofukaze/layouts/default.vue
```

### `/ops`

运维控制台包含：

- 上游服务健康状态。
- gateway 路由表与转发指标。
- reviewer/admin 查询文章 AI 分析结果。
- reviewer/admin 触发文章重新分析。
- reviewer/admin 查看最近审计日志。
- 标签库数量概览。

普通用户可以查看基础服务状态，但不能查询分析详情和审计日志。

### `/chat`

私信页面包含：

- 会话列表。
- 输入用户 ID 创建或打开单对单会话。
- 历史消息加载。
- WebSocket 实时收发。
- WebSocket 不可用时降级为 HTTP 发送。
- emoji 选择并作为消息内容的一部分发送。

开发模式默认将 WebSocket 指向 gateway：

```text
ws://127.0.0.1:3001/api/chat/ws
```

生产或 Nginx 同域模式下使用：

```text
/api/chat/ws
```

也可以通过 `NUXT_PUBLIC_WS_BASE` 显式指定。

## 4. 配置修复

同步修复了两个残损文件：

```text
blog_service/Dockerfile
.env.example
```

其中 `.env.example` 重新列出本项目本地和 Docker Compose 所需的核心环境变量。

## 5. 验证记录

已执行：

```text
api_gateway npm run prisma:generate
api_gateway npm run build
mofukaze npm run build
user_service npm run build
blog_service npm run build
ai_service npm run build
chat_service npm run build
```

本机运行检查：

```text
GET http://127.0.0.1:3001/api/gateway/health -> 200
GET http://127.0.0.1:3001/api/gateway/routes -> 200
GET http://127.0.0.1:3001/api/gateway/audit-logs -> 未登录 401
GET http://127.0.0.1:3001/api/chat/health -> 200
GET http://127.0.0.1:3000/ops -> 200
GET http://127.0.0.1:3000/chat -> 200
```

当前本机已重启新版 gateway 和 Nuxt dev server：

```text
frontend: http://127.0.0.1:3000
api_gateway: http://127.0.0.1:3001
```
