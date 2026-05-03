# API Gateway 与统一代理路径开发拆解文档

生成日期：2026-05-03

## 1. 恢复目标

项目原设计采用：

```text
浏览器
  -> 前端服务 Nginx
  -> /api 统一前缀
  -> api_gateway
  -> 各后端微服务
```

上一阶段为了快速验证推荐闭环，前端曾临时直连 `blog_service` 与 `user_service`。本阶段已恢复为统一代理形态：前端只请求 `/api/...`，不再感知各个服务端口。

## 2. 当前路径规范

| 前端请求路径 | Gateway 上游 | 上游实际路径 |
| --- | --- | --- |
| `/api/auth/*` | `user_service` | `/auth/*` |
| `/api/users/:id` | `user_service` | `/users/:id` |
| `/api/users/:id/rating` | `user_service` | `/users/:id/rating` |
| `/api/users/:id/follow` | `blog_service` | `/users/:id/follow` |
| `/api/users/:id/follow-summary` | `blog_service` | `/users/:id/follow-summary` |
| `/api/articles/*` | `blog_service` | `/articles/*` |
| `/api/comments/*` | `blog_service` | `/comments/*` |
| `/api/following` | `blog_service` | `/following` |
| `/api/followers` | `blog_service` | `/followers` |
| `/api/feeds/*` | `blog_service` | `/feeds/*` |
| `/api/reco/*` | `blog_service` | `/reco/*` |
| `/api/analysis/*` | `ai_service` | `/analysis/*` |
| `/api/chat/*` | `chat_service` | `/chat/*` |

注意：`/api/users/:id/follow` 与 `/api/users/:id/follow-summary` 必须优先于通用 `/api/users` 路由匹配，否则会被错误转发到 `user_service`。当前 gateway 已按这个顺序注册。

## 3. Gateway 服务

恢复文件：

```text
api_gateway/src/index.ts
api_gateway/src/config/routes.ts
api_gateway/src/proxy/proxyHandler.ts
api_gateway/src/utils/requestId.ts
api_gateway/Dockerfile
```

主要能力：

1. 统一 `/api` 路由前缀。
2. 转发 `x-request-id`。
3. 添加 `x-gateway-route` 上游标识。
4. 基础 CORS。
5. 基础限流。
6. `/health` 返回路由表和上游地址。
7. WebSocket upgrade 转发，当前主要用于 `/api/chat/ws`。

本阶段没有恢复复杂安全审计中间件，只保留最小稳定网关。安全审计仍由各服务自己的 `audit_log` 写入承担。

## 4. 前端代理策略

前端 `mofukaze` 现在只使用：

```env
NUXT_PUBLIC_API_BASE=/api
```

开发模式：

```text
浏览器 -> Nuxt dev server /api -> api_gateway
```

由 `mofukaze/server/api/[...path].ts` 完成代理。该文件只服务开发/SSR 场景，负责把本地 `/api/**` 原样转发到 gateway：

```env
NUXT_API_PROXY_TARGET=http://127.0.0.1:3001
```

说明：此前尝试过 `nuxt.config.ts` 的 `routeRules.proxy`，但在本项目的 Nuxt 3.13 开发服务中会先于 server route 接管 `/api/**`，并导致通配符目标路径异常。因此当前配置保持简单：开发模式使用 `server/api`，生产容器使用 Nginx。

生产 / Docker 模式：

```text
浏览器 -> frontend Nginx /api -> api_gateway:3001/api
```

由 `mofukaze/nginx.conf` 完成代理。

WebSocket 生产路径同样走统一前缀：

```text
浏览器 -> frontend Nginx /api/chat/ws -> api_gateway -> chat_service /chat/ws
```

`mofukaze/nginx.conf` 已设置 `Upgrade` 和 `Connection` 头，`api_gateway` 也已在 HTTP server 的 `upgrade` 事件中按路由表转发。

## 5. Docker Compose

已恢复：

```text
docker-compose.yml
docker-compose.dev.yml
```

生产式 compose 暴露：

| 服务 | 端口 |
| --- | --- |
| `frontend` | `8080:80` |
| `api_gateway` | `3001:3001` |
| `blog_service` | `3002:3002` |
| `user_service` | `3003:3003` |
| `ai_service` | `3004:3004` |

运行前需要提供：

```env
DATABASE_URL=mysql://user:password@host:3306/longseason
ACCESS_TOKEN_SECRET=replace-with-secret
```

开发式 compose 暴露前端开发服务：

```text
frontend: http://127.0.0.1:3000
gateway:  http://127.0.0.1:3001
```

## 6. 验证记录

已执行：

```bash
cd api_gateway
npm run build

cd ../mofukaze
npm run build
npm run typecheck
```

运行时验证：

1. `GET http://127.0.0.1:3001/health` 返回 gateway 路由表。
2. `GET http://127.0.0.1:3001/api/feeds/recommended?limit=1` 成功转发到 `blog_service`。
3. `GET http://127.0.0.1:3001/api/users/1` 成功转发到 `user_service`。
4. `GET http://127.0.0.1:3000/api/feeds/recommended?limit=1` 经 Nuxt 开发服务转发到 gateway，并返回推荐 JSON。

## 7. 当前结论

当前项目格式已经恢复为：

```text
前端统一 /api
  -> api_gateway 统一分发
  -> user_service / blog_service / ai_service / chat_service
```

这与原先“Docker 分容器 + gateway 统一路径 + 前端 Nginx 代理”的设计方向一致。
