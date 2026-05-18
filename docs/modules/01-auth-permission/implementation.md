# 用户认证与权限管理模块实现文档

## 模块职责

本模块负责用户注册、登录、退出、会话刷新、当前用户识别、公开资料查询、用户搜索和角色权限控制。它是其他受保护功能的身份基础，文章发布、评论、关注、通知、聊天、AI 管理接口和审计查询都依赖本模块提供的用户身份与角色信息。

## 核心实现位置

| 类型 | 文件 |
| --- | --- |
| 服务入口 | `user_service/index.ts` |
| 路由定义 | `user_service/src/api/auth.ts`、`user_service/src/api/user.ts` |
| 控制器 | `user_service/src/controllers/authController.ts`、`user_service/src/controllers/userController.ts` |
| 业务服务 | `user_service/src/services/authService.ts`、`user_service/src/services/userService.ts` |
| 鉴权中间件 | `user_service/middlewares/auth.ts`、`blog_service/middlewares/auth.ts`、`chat_service/src/middlewares/auth.ts` |
| 输入校验 | `user_service/src/utils/validation.ts` |
| 数据模型 | `user_service/prisma/schema.prisma`、`prisma/schema.prisma` |

## 数据表

| 表名 | 作用 |
| --- | --- |
| `user` | 保存用户名、邮箱、密码哈希、头像、角色、用户评分和个人简介 |
| `auth_refresh_token` | 保存刷新令牌哈希、CSRF token、过期时间、撤销状态、用户代理和 IP |
| `audit_log` | 记录注册、登录、退出、角色变更等关键行为 |

## 核心代码讲解

注册入口在 `authController.register` 中完成第一层校验。控制器先检查请求体是否包含 `role` 字段，如果客户端试图传入角色，会直接抛出 `ROLE_NOT_ALLOWED`。这次黑盒测试发现公共注册接口曾允许创建管理员角色，因此现在把“公开注册只能创建普通用户”写进入口逻辑：

```ts
if (req.body?.role !== undefined) {
  throw new HttpError(400, "role cannot be set during public registration", "ROLE_NOT_ALLOWED");
}
```

控制器只从请求体中提取 `username`、`email`、`password` 和 `avatar`，随后调用 `registerUser`。服务层 `authService.registerUser` 会先查询用户名或邮箱是否已存在，再用 `bcrypt.hash` 保存密码哈希。为了避免以后其他调用路径再次传入外部角色，服务层创建用户时也固定写入 `role: "user"`。这样权限边界同时落在 controller 和 service 两层。

登录流程由 `authService.loginUser` 完成。它支持邮箱或用户名作为标识，先查找用户，再用 `bcrypt.compare` 对比密码。认证通过后调用 `issueTokens` 生成 access token、refresh token 和 CSRF token。access token 中保存用户 id、用户名、邮箱和角色，便于其他服务通过 JWT 识别调用者；refresh token 不直接明文保存，而是通过 `hashToken` 转为 SHA-256 哈希后写入 `auth_refresh_token`。

会话刷新由 `refreshTokens` 实现。它先根据 refresh token 哈希查找记录，再检查是否已撤销、是否过期，以及 CSRF token 是否匹配。校验通过后使用事务同时撤销旧 token、创建新 token，实现 refresh token rotation。退出登录时，`revokeRefreshToken` 会把当前 refresh token 标记为已撤销。

受保护接口通过 `requireAuth` 和 `requireRole` 实现。中间件会从 `Authorization: Bearer` 或 Cookie 中提取 access token，调用 `getUserByAccessToken` 校验 JWT，并把用户信息挂到 `req.auth`。需要管理员权限的接口再叠加 `requireRole`，例如角色修改、AI 管理和审计查询。

用户评分查询虽然由用户服务暴露，但它跨表读取文章、AI 分析和推荐事件。`userService.getUserRating` 使用 SQL 聚合计算内容质量、合规情况和互动反馈，再返回综合分、等级和风险信号。这使用户主页展示不只依赖静态字段，而是反映近期内容和互动表现。

## 主要接口

| 接口 | 说明 |
| --- | --- |
| `POST /api/auth/register` | 用户注册，只允许创建普通用户 |
| `POST /api/auth/login` | 用户登录 |
| `POST /api/auth/refresh` | 刷新会话 |
| `POST /api/auth/logout` | 退出登录 |
| `GET /api/auth/me` | 获取当前用户 |
| `GET /api/users/:id` | 查询公开用户资料 |
| `GET /api/users/search` | 用户搜索 |
| `GET /api/users/:id/rating` | 查询用户综合评级 |
| `PATCH /api/users/:id/role` | 管理员修改角色 |

## 测试与修复记录

黑盒测试中的 `SEC-001` 用例专门验证公共注册接口是否允许客户端指定管理员角色。修复后，带 `role=admin` 的注册请求返回 400，错误码为 `ROLE_NOT_ALLOWED`；普通注册仍返回 201，并且新用户角色为 `user`。这一点已经写入 `docs/test-execution-2026-05-12/raw/targeted-fix-validation.json`。

## 已实现能力

- 密码使用哈希保存，避免明文存储。
- 登录后签发 access token、refresh token 和 CSRF token。
- refresh token 只保存哈希，并支持撤销与轮换。
- 支持 Bearer token 和 Cookie 两种身份携带方式。
- 通过 `requireAuth` 和 `requireRole` 保护接口。
- 公共注册接口不能创建管理员角色。
- 用户综合评分接口可结合 AI 评分、审核状态和互动反馈输出等级。
