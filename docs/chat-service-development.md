# chat_service 单对单聊天恢复开发拆解文档

生成日期：2026-05-03

## 1. 恢复目标

`chat_service` 按独立聊天插件思路恢复：它不参与内容推荐、AI 审查或主信息流排序，只负责用户之间的单对单实时消息。前端和部署层仍保持原项目的统一代理形态：

```text
浏览器
  -> /api/chat/*
  -> api_gateway
  -> chat_service
```

WebSocket 入口为：

```text
/api/chat/ws  ->  /chat/ws
```

HTTP 接口用于会话列表、创建会话和历史消息分页；WebSocket 用于在线发送和即时广播。消息正文使用 `longtext` 保存，emoji 被视为消息内容的一部分，可以单独发送，也可以随正文一起发送。

## 2. 使用数据表

| 表 | 用途 |
| --- | --- |
| `user` | 鉴权后校验用户是否仍存在，并返回聊天对象基础信息 |
| `chat_thread` | 单对单会话，使用 `userAId` / `userBId` 保存双方 |
| `chat_message` | 聊天消息，保存发送者、会话、正文和创建时间 |
| `audit_log` | 记录会话创建、消息发送、WebSocket 连接等关键行为 |

会话采用稳定排序：

```text
userAId = min(currentUserId, peerId)
userBId = max(currentUserId, peerId)
```

这样同一对用户无论从哪一方发起，都会命中 `@@unique([userAId, userBId])`，避免重复会话。

## 3. 代码结构

```text
chat_service/src/index.ts
  Express 入口、健康检查、REST 路由、HTTP server、WebSocket 安装

chat_service/src/controllers/chatController.ts
  REST controller：会话列表、创建会话、消息列表、发送消息

chat_service/src/services/chatService.ts
  领域逻辑：会话去重、参与者校验、消息落库、DTO 输出

chat_service/src/ws/server.ts
  WebSocket upgrade、连接池、心跳、实时发送、广播

chat_service/src/middlewares/auth.ts
  复用 user_service 的 access token 规则，支持 Bearer、Cookie 和 WS query token

chat_service/src/services/auditService.ts
  写入 audit_log

chat_service/src/utils/validation.ts
  参数校验、分页解析、消息正文与 emoji 合并
```

## 4. REST 接口

所有 `/chat/*` 接口都需要登录。经 gateway 后，前端请求路径为 `/api/chat/*`。

### `GET /chat/threads`

获取当前用户的会话列表。

查询参数：

```text
limit?: number
cursor?: number
```

响应：

```ts
{
  items: Array<{
    id: number
    userAId: number
    userBId: number
    createdAt: string
    counterpart: {
      id: number
      username: string
      avatar: string | null
      role: string
    }
    lastMessage: ChatMessage | null
  }>
  nextCursor?: number
}
```

### `POST /chat/threads`

创建或获取与某个用户的一对一会话。

请求体：

```json
{
  "peerId": 2
}
```

响应：

```ts
{
  item: ChatThread
}
```

### `GET /chat/threads/:threadId/messages`

获取某个会话的历史消息。只有会话双方可以读取。

查询参数：

```text
limit?: number
cursor?: number
```

返回的 `items` 按时间正序排列，`nextCursor` 用于继续加载更早消息。

### `POST /chat/threads/:threadId/messages`

通过 HTTP 发送消息，并同步广播给在线的会话双方。

请求体：

```json
{
  "content": "今晚继续改答辩稿",
  "emoji": "🙂"
}
```

`emoji` 可选；如果 `content` 为空但 `emoji` 存在，则允许发送纯 emoji 消息。

## 5. WebSocket 协议

WebSocket 路径：

```text
ws://127.0.0.1:3001/api/chat/ws
wss://your-domain/api/chat/ws
```

认证方式：

1. 同域 Cookie：`ls_access_token`
2. Header：`Authorization: Bearer <token>`
3. 查询参数：`?token=<token>`

浏览器同域场景推荐使用 Cookie；手写调试脚本可以使用 query token。

连接成功后服务端发送：

```json
{
  "type": "ready",
  "userId": 1
}
```

客户端发送消息：

```json
{
  "type": "send_message",
  "threadId": 9,
  "content": "收到",
  "emoji": "👌",
  "clientId": "optional-client-id"
}
```

服务端向会话双方广播：

```json
{
  "type": "message_created",
  "message": {
    "id": 101,
    "threadId": 9,
    "senderId": 1,
    "content": "👌 收到",
    "createdAt": "2026-05-03T12:00:00.000Z",
    "sender": {
      "id": 1,
      "username": "longseason",
      "avatar": null,
      "role": "user"
    }
  },
  "clientId": "optional-client-id"
}
```

心跳：

```json
{ "type": "ping" }
```

响应：

```json
{ "type": "pong" }
```

错误：

```json
{
  "type": "error",
  "code": "THREAD_NOT_FOUND",
  "message": "Chat thread not found"
}
```

## 6. Gateway 与 Docker 接入

已补充 `api_gateway` 的 WebSocket upgrade 转发：

```text
api_gateway/src/proxy/proxyHandler.ts
api_gateway/src/index.ts
```

普通 HTTP 和 WebSocket 都会遵循同一套路由表。`/api/chat/ws` 会先由 gateway 匹配 `/api/chat`，再重写为 `/chat/ws` 转发到 `chat_service`。

`docker-compose.yml` 和 `docker-compose.dev.yml` 已新增：

```text
chat_service:3005
```

并让 `api_gateway` 依赖 `chat_service`。生产前端 Nginx 已有 `Upgrade` / `Connection` 头设置，可以代理 WebSocket。

开发模式注意：当前 Nuxt 的 `server/api/[...path].ts` 主要服务 HTTP 代理，不保证转发 WebSocket。开发联调聊天时建议浏览器直接连：

```text
ws://127.0.0.1:3001/api/chat/ws
```

生产 Docker / Nginx 场景仍使用同域：

```text
/api/chat/ws
```

## 7. 验证记录

已执行：

```text
chat_service npm run prisma:generate
chat_service npm run build
api_gateway npm run build
chat_service /health 运行检查
gateway /api/chat/health 转发检查
gateway /api/chat/ws 未登录 WebSocket upgrade 返回 401
```

验证结果：

```text
chat_service TypeScript 编译通过
api_gateway TypeScript 编译通过
/health 返回 service=chat_service, status=ok
/api/chat/health 经 gateway 返回 service=chat_service, status=ok
/api/chat/ws 可以被 gateway 转发到 chat_service，并正确拒绝未登录连接
```

本次验证没有向 `chat_thread` 或 `chat_message` 写入测试数据，只确认服务能启动并连通数据库。

`docker compose config` 未能在当前机器验证，因为本机没有可用的 `docker` 命令。

## 8. 后续衔接

1. 前端恢复一个轻量聊天入口：用户卡片或个人页的私信按钮。
2. 实现聊天抽屉或悬浮插件：会话列表、消息区、emoji 选择器、发送状态。
3. 如果答辩演示需要多开浏览器实时互动，可增加本地脚本生成测试 token 或通过正式登录 Cookie 连接 WebSocket。
4. 当前表结构没有已读回执、撤回、消息状态和未读计数；如果后续要做完整聊天体验，可以新增 `chat_read_state` 或在 `chat_thread` 增加 `updatedAt` / `lastMessageId`。
