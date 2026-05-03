# Mofukaze 前端恢复说明

当前前端已精简恢复为 Nuxt 3 + Vue 3 + TypeScript，用于支撑毕业设计答辩中的社交内容、关注关系和推荐闭环演示。

主要页面：

- `/`：推荐流与关注流。
- `/article/:id`：文章详情、评论、reaction。
- `/u/:id`：用户关注概览、关注按钮、粉丝/关注列表。
- `/login`：基础登录入口。

运行前请启动后端：

```bash
cd ../user_service && npm run start
cd ../blog_service && npm run start
```

前端只请求统一 API 前缀 `/api`。开发模式下 Nuxt 会把 `/api` 代理到 `api_gateway`，生产模式下由 Nginx 完成同样的代理。

前端开发：

```bash
npm run dev
```

可覆盖代理目标：

```env
NUXT_API_PROXY_TARGET=http://127.0.0.1:3001
NUXT_PUBLIC_API_BASE=/api
```
