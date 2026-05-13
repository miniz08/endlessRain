# 消息通知与处理结果反馈功能实现文档

## 模块职责

本模块负责把用户可感知的处理结果和社交互动反馈写入通知中心，包括内容审核结果、评论、回复、emoji 反馈和关注提醒。它让“系统做了什么处理”能够被用户看到，避免审核、互动和推荐行为只停留在后台数据中。

## 核心实现位置

| 类型 | 文件 |
| --- | --- |
| 路由定义 | `blog_service/src/api/notification.ts` |
| 控制器 | `blog_service/src/controllers/notificationController.ts` |
| 业务服务 | `blog_service/src/services/notificationService.ts` |
| 调用方 | `articleService.ts`、`commentService.ts`、`reactionService.ts`、`followService.ts` |
| 前端页面 | `mofukaze/pages/notifications.vue`、`mofukaze/layouts/default.vue` |
| 数据迁移 | `blog_service/prisma/migrations/20260511120000_article_review_feedback/migration.sql` |

## 数据表

| 表名 | 作用 |
| --- | --- |
| `notification` | 保存通知接收人、类型、标题、正文、动作用户、关联文章、关联评论、链接和已读状态 |

## 核心代码讲解

通知服务没有只依赖 Prisma model，而是通过 `ensureNotificationStore` 使用 SQL 确认 `notification` 表存在。这种写法适合当前共享数据库和补充迁移并存的阶段，可以避免本地数据库还没同步迁移时通知接口直接不可用。

通知列表由 `listNotifications` 实现。它先确保表存在，再用 SQL 查询通知记录，并左连接 `user` 表拿到动作用户信息。分页使用 `id < cursor` 的方式，结果按 `createdAt` 和 `id` 倒序排列。控制器 `listNotificationsController` 从 `req.auth.id` 读取当前用户，只允许用户查看自己的通知。

未读数量由 `getUnreadNotificationCount` 查询 `readAt IS NULL` 的记录。单条已读和全部已读分别由 `markNotificationRead`、`markAllNotificationsRead` 完成，写入时使用 `COALESCE(readAt, CURRENT_TIMESTAMP(3))`，避免重复标记时改变原已读时间。

通知写入统一经过 `createNotification`。该函数有一个重要边界：如果 `actorId` 与 `userId` 相同，就直接返回，不给用户自己对自己内容的操作生成通知。这样可以减少无意义提醒，例如作者自己给自己文章添加 reaction。

内容审核反馈由 `notifyArticleReviewResult` 负责。它根据文章状态选择不同通知类型：审核通过是 `CONTENT_REVIEW_APPROVED`，低优先级公开是 `CONTENT_REVIEW_LIMITED`，拒绝是 `CONTENT_REVIEW_REJECTED`，复核或 AI 失败则进入 `CONTENT_REVIEW_REQUIRED` 或 `CONTENT_REVIEW_FAILED`。通知正文会拼接审核原因、建议和风险等级，让用户知道内容为什么被这样处理。

社交通知由几个专门函数生成。`notifyCommentCreated` 会同时处理“评论了文章”和“回复了评论”两种情况，并避免给评论者本人或文章作者重复发送不必要的通知。`notifyArticleReaction`、`notifyCommentReaction` 和 `notifyFollowed` 分别对应文章 reaction、评论 reaction 和关注提醒。

## 通知类型

| 类型 | 场景 |
| --- | --- |
| `CONTENT_REVIEW_APPROVED` | 内容审核通过 |
| `CONTENT_REVIEW_LIMITED` | 内容可公开但推荐优先级较低 |
| `CONTENT_REVIEW_REQUIRED` | 内容进入复核 |
| `CONTENT_REVIEW_REJECTED` | 内容未通过审核 |
| `CONTENT_REVIEW_FAILED` | AI 审核失败，内容进入复核 |
| `COMMENT` | 他人评论了当前用户动态 |
| `REPLY` | 他人回复了当前用户评论 |
| `ARTICLE_REACTION` | 他人对当前用户动态添加 emoji |
| `COMMENT_REACTION` | 他人对当前用户评论添加 emoji |
| `FOLLOW` | 他人关注当前用户 |

## 主要接口

| 接口 | 说明 |
| --- | --- |
| `GET /api/notifications` | 查询通知列表 |
| `GET /api/notifications/unread-count` | 查询未读数量 |
| `PATCH /api/notifications/:id/read` | 标记单条已读 |
| `PATCH /api/notifications/read-all` | 标记全部已读 |

## 测试关联

黑盒测试中，评论、reaction 和关注流程都会检查通知是否随互动产生；通知模块还单独验证列表、未读数、全部已读和游客访问拦截。测试结果表明，通知中心能够把内容处理结果和社交互动反馈串起来。

## 已实现能力

- 通知中心支持分页查询。
- 支持未读数量统计。
- 支持单条和全部标记已读。
- 内容审核完成后会向作者发送明确反馈。
- 评论、回复、文章 emoji、评论 emoji 和关注都会产生互动通知。
- 自己触发自己的行为不会产生多余通知。
