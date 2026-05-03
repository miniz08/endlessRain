# User Service 开发拆解

生成时间：2026-05-03

## 1. 本阶段目标

本阶段完成 `user_service` 的基础复原，使它成为后续内容发布、AI 分析、推荐和审计的身份基础。

已完成：

- Express + TypeScript 服务入口。
- Prisma Client 连接云端共库。
- 注册、登录、刷新、退出、当前用户接口。
- 用户资料与用户综合评级查询接口。
- 管理员更新用户角色接口。
- refresh token 数据库持久化、轮换和撤销。
- JWT access token 短期登录凭证。
- `audit_log` 安全审计写入。
- `/health` 健康检查。

## 2. 使用表

`user_service` 当前使用三张表：

- `user`
  - 用户基础信息。
  - `role` 用于权限控制。
  - `professionalism`、`friendliness` 用于用户综合行为评级的存储值。

- `auth_refresh_token`
  - 保存 refresh token 的 SHA-256 hash。
  - 支持 `csrfToken`、`expiresAt`、`revokedAt`、`replacedByTokenHash`。
  - 登录和刷新时写入，退出时撤销。

- `audit_log`
  - 记录注册、登录、刷新、退出、角色更新和错误请求。

## 3. 接口设计

### 3.1 认证接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/auth/register` | 注册并自动登录 |
| `POST` | `/auth/login` | 登录并签发 token |
| `POST` | `/auth/refresh` | 使用 refresh token 轮换新 token |
| `POST` | `/auth/logout` | 撤销 refresh token 并清除 cookie |
| `GET` | `/auth/me` | 获取当前登录用户 |

注册请求：

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "password123"
}
```

登录请求：

```json
{
  "identifier": "alice",
  "password": "password123"
}
```

登录成功后会设置：

- `ls_access_token`: httpOnly cookie，默认 15 分钟。
- `ls_refresh_token`: httpOnly cookie，默认 30 天。
- `ls_refresh_csrf`: 非 httpOnly cookie，用于 refresh 防 CSRF。

`/auth/refresh` 需要 `x-csrf-token` header 或 body 中的 `csrfToken`。

### 3.2 用户接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/users/:id` | 用户公开资料 |
| `GET` | `/users/:id/rating` | 用户综合评级 |
| `PATCH` | `/users/:id/role` | 管理员更新角色 |

角色更新需要登录用户是 `admin`。

## 4. 代码结构

```text
user_service/
  index.ts
  lib/prisma.ts
  middlewares/auth.ts
  src/api/auth.ts
  src/api/user.ts
  src/controllers/authController.ts
  src/controllers/userController.ts
  src/services/auditService.ts
  src/services/authService.ts
  src/services/userService.ts
  src/utils/cookies.ts
  src/utils/validation.ts
```

职责划分：

- `index.ts`
  - Express 装配、CORS、JSON、requestId、路由、错误处理。

- `middlewares/auth.ts`
  - 从 Bearer header 或 cookie 中读取 access token。
  - 验证 JWT 后写入 `req.auth`。
  - 提供 `requireRole`。

- `authService.ts`
  - 密码哈希。
  - access token 签发。
  - refresh token 创建、hash、轮换、撤销。

- `userService.ts`
  - 用户公开资料。
  - 用户综合评级查询。
  - 管理员角色更新。

- `auditService.ts`
  - 写入 `audit_log`。
  - 审计失败只记录错误，不影响主流程。

## 5. 用户评级实现

当前 `user` 表只有 `professionalism` 和 `friendliness` 两个存储字段。评级接口会同时返回：

- `stored`
  - 直接来自 `user.professionalism`
  - 直接来自 `user.friendliness`

- `computed`
  - 从 `article` 与 `article_ai_analysis` 动态聚合：
    - `AVG(professionalismScore)`
    - `AVG(friendlinessScore)`
    - `AVG(rationalityScore)`
    - `AVG(legalityScore)`

综合分：

```text
combinedScore =
  professionalism * 0.45
  + friendliness * 0.35
  + rationality * 0.10
  + legality * 0.10
```

等级：

- `A`: 85+
- `B`: 70-84
- `C`: 50-69
- `D`: 0-49

## 6. 环境变量

运行服务至少需要：

```env
DATABASE_URL=...
ACCESS_TOKEN_SECRET=...
```

可选：

```env
PORT=3003
CORS_ORIGIN=http://localhost:3001
ACCESS_TOKEN_SECONDS=900
REFRESH_TOKEN_DAYS=30
```

开发环境如果没有 `ACCESS_TOKEN_SECRET`，代码会使用开发默认值；正式部署时必须显式配置。

## 7. 验证记录

已执行：

```bash
npm run build
```

结果：TypeScript 编译通过。

已执行临时端口健康检查：

```bash
PORT=3303 node dist/index.js
GET http://127.0.0.1:3303/health
```

返回：

```json
{
  "service": "user_service",
  "status": "ok"
}
```

本轮未执行注册或登录写入测试，避免污染云端用户数据。

## 8. 下一步衔接

下一个推荐恢复模块是 `ai_service`：

1. 实现 mock provider，保证离线演示稳定。
2. 实现 openai-compatible provider，接入真实大模型。
3. 输出 `friendlinessScore`、`rationalityScore`、`legalityScore`、`professionalismScore` 和 AI 标签。
4. 为 `blog_service` 的发文闭环提供 `/analysis/text` 接口。
