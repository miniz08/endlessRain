# 通知中心与管理员监控平台开发拆解

生成日期：2026-05-05

## 1. 模块定位

本轮补全两个用于系统闭环的模块：

1. 通知中心：面向普通用户，反馈内容发布结果、评论、回复、reaction、关注等用户可感知事件。
2. 管理员监控平台：面向 `reviewer` / `admin`，展示服务健康、网关流量、审计统计、失败记录、AI 分析查询。

注意：通知中心不暴露 AI 审查过程，只反馈“动态已发布”等用户侧结果，保持 AI 治理的静默设计。

## 2. 新增通知表

通知表由 `blog_service` 在启动时自动创建，避免云端库需要手动迁移。

表名：`notification`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT AUTO_INCREMENT` | 通知主键 |
| `userId` | `INT` | 接收通知的用户 |
| `type` | `VARCHAR(64)` | 通知类型 |
| `title` | `VARCHAR(191)` | 通知标题 |
| `body` | `VARCHAR(512)` | 通知正文，可为空 |
| `actorId` | `INT` | 触发通知的用户，可为空 |
| `articleId` | `INT` | 关联文章，可为空 |
| `commentId` | `INT` | 关联评论，可为空 |
| `link` | `VARCHAR(512)` | 前端跳转路径 |
| `readAt` | `DATETIME(3)` | 已读时间，空值表示未读 |
| `createdAt` | `DATETIME(3)` | 创建时间 |

ER 图建议关系：

```text
user 1 --- N notification
user 1 --- N notification.actorId
article 1 --- N notification
comment 1 --- N notification
```

`notification` 未设置硬外键，原因是当前恢复项目使用共享云数据库，运行期自建表更稳妥；论文 ER 图中仍可按逻辑外键表达。

## 3. 通知触发事件

| 事件 | 通知类型 | 接收者 |
| --- | --- | --- |
| 用户发布动态成功 | `CONTENT_PUBLISHED` | 作者本人 |
| 用户评论文章 | `COMMENT` | 文章作者 |
| 用户回复评论 | `REPLY` | 被回复用户 |
| 用户给文章 reaction | `ARTICLE_REACTION` | 文章作者 |
| 用户给评论 reaction | `COMMENT_REACTION` | 评论作者 |
| 用户关注他人 | `FOLLOW` | 被关注用户 |

触发流程：

```text
用户操作
  -> blog_service 业务处理
  -> 写入业务表
  -> 写入 reco_event / audit_log
  -> 写入 notification
  -> 前端通知中心展示
```

## 4. 通知 API

统一经 gateway 暴露：

```text
GET   /api/notifications?limit=20&cursor=通知ID
GET   /api/notifications/unread-count
PATCH /api/notifications/:id/read
PATCH /api/notifications/read-all
```

前端页面：

```text
/notifications
```

导航栏会展示未读数量。

## 5. 管理员监控平台

前端页面：

```text
/ops
```

本轮新增 gateway 汇总接口：

```text
GET /api/gateway/admin-summary?hours=24
```

权限要求：

```text
role = reviewer 或 admin
```

返回内容：

1. 最近 N 小时审计事件总数。
2. 成功/失败数量。
3. 失败率。
4. Top 审计动作。
5. Top 路由分组。
6. 最近失败记录。
7. gateway 内存路由指标。

管理员监控流程：

```text
管理员登录
  -> 访问 /ops
  -> gateway 校验 reviewer/admin
  -> 聚合 health、metrics、audit_log、AI taxonomy
  -> 前端展示服务状态、路由流量、审计统计、失败明细、AI 分析查询
```

## 6. 代码位置

通知中心：

- `blog_service/src/services/notificationService.ts`
- `blog_service/src/controllers/notificationController.ts`
- `blog_service/src/api/notification.ts`
- `mofukaze/pages/notifications.vue`

管理员监控：

- `api_gateway/src/gatewayStatus.ts`
- `api_gateway/src/index.ts`
- `mofukaze/pages/ops.vue`

## 7. 验证记录

已通过：

```bash
cd blog_service
npx prisma generate
npm run build

cd ../api_gateway
npx prisma generate
npm run build

cd ../mofukaze
npm run typecheck
npm run generate
```

## 8. 论文图示建议

ER 图新增实体：

```text
notification
```

流程图建议新增两张：

1. 用户互动通知流程图。
2. 管理员审计监控流程图。

系统闭环可以描述为：

```text
内容发布 -> AI 静默分析 -> 内容展示/推荐 -> 用户互动 -> 通知反馈 -> 审计记录 -> 管理员监控
```
