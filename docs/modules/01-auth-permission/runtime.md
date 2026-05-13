# 用户认证与权限管理模块运行机制文档

## 注册与登录流程

1. 前端提交用户名、邮箱和密码。
2. API 网关将 `/api/auth/*` 请求转发至 `user_service`。
3. 用户服务校验输入格式和账号唯一性。
4. 注册时写入 `user` 表；登录时校验密码哈希。
5. 认证成功后生成 access token、refresh token 和 CSRF token。
6. refresh token 哈希写入 `auth_refresh_token`。
7. 前端通过 Cookie 或 Authorization 头在后续请求中携带身份。

图表参考：[用户认证流程](../../diagrams/modules/auth-flow.mmd)。

## 权限控制机制

系统使用两级权限控制：

- 登录态控制：`requireAuth` 保证用户已登录。
- 角色控制：`requireRole` 或 reviewer/admin 判断用户是否具备管理或审核权限。

普通用户可以浏览公开内容、发布文章、评论、关注和聊天；管理员或审核员可以访问审计日志、管理摘要、AI 分析查询等敏感功能。

## 会话刷新与退出

access token 有较短有效期，refresh token 有较长有效期。刷新会话时，系统会验证 refresh token 哈希和 CSRF token，并将旧 refresh token 标记为撤销，再签发新的一组令牌。退出登录时，系统撤销当前 refresh token。

## 异常处理

| 场景 | 处理方式 |
| --- | --- |
| 用户名或邮箱重复 | 返回 `USER_EXISTS` |
| 密码错误 | 返回 `INVALID_CREDENTIALS` |
| access token 过期 | 返回 `ACCESS_TOKEN_INVALID` |
| refresh token 过期或被撤销 | 返回 `REFRESH_TOKEN_INVALID` |
| 角色权限不足 | 返回 `FORBIDDEN` |

## 与其他模块协作

- 内容发布、评论、关注、聊天等模块依赖本模块识别当前用户。
- AI 分析和审计模块依赖用户角色区分普通用户、审核员和管理员。
- 用户综合评级复用 `user` 表中的评分字段，并通过 `/api/users/:id/rating` 暴露查询结果。

