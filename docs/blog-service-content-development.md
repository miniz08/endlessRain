# blog_service 内容与互动开发拆解文档

生成日期：2026-05-03

## 1. 本阶段范围

本轮先恢复 `blog_service` 的内容发布与互动核心，不展开推荐系统和图片上传。

已完成：

1. 文章列表、详情、创建、删除。
2. 评论列表、创建、删除。
3. 文章 emoji reaction。
4. 评论 emoji reaction。
5. 发布文章后可选调用 `ai_service` 进行文本分析。
6. 审计日志写入。

## 2. 数据表归属

本阶段使用的表：

| 表名 | 使用方式 | 说明 |
| --- | --- | --- |
| `article` | 读写 | 社交内容主体。 |
| `comment` | 读写 | 文章评论与楼中楼回复。 |
| `article_reaction` | 读写 | 文章 emoji reaction。 |
| `comment_reaction` | 读写 | 评论 emoji reaction。 |
| `article_tag` | 写 | 人工标签字典。 |
| `article_tag_on_article` | 写 | 文章与人工标签关联。 |
| `article_ai_analysis` | 读 | 返回文章 AI 评分。 |
| `article_ai_tag` | 读 | 返回文章 AI 标签名。 |
| `article_ai_tag_on_article` | 读 | 返回文章 AI 标签置信度与权重。 |
| `user` | 读 | 作者、评论者和认证用户信息。 |
| `audit_log` | 写 | 记录文章、评论、reaction 操作。 |

## 3. Reaction 设计

文章与评论各自有独立 reaction 表：

- `article_reaction`
- `comment_reaction`

两张表都保留了唯一索引：

```text
article_reaction: @@unique([articleId, userId, emoji])
comment_reaction: @@unique([commentId, userId, emoji])
```

因此当前交互语义是：

1. 同一个用户可以对同一篇文章或同一条评论使用多个不同 emoji。
2. 同一个用户对同一个对象再次点击同一个 emoji 时，会取消该 reaction。
3. 接口返回聚合后的 `counts`、`total` 和当前用户的 `myReactions`。

默认 reaction 配置位于：

- `blog_service/src/services/reactionConfig.ts`

当前保留 25 个常用 emoji，可直接给前端渲染 reaction 面板。

## 4. 接口设计

### 文章

```text
GET    /articles
POST   /articles
GET    /articles/:articleId
DELETE /articles/:articleId
GET    /articles/:articleId/reactions
POST   /articles/:articleId/reactions
```

`POST /articles` 请求体：

```json
{
  "content": "今天分享一个关于人工智能学习方法的理性讨论。",
  "tag": "人工智能",
  "tags": ["人工智能", "学习方法"]
}
```

### 评论

```text
GET    /articles/:articleId/comments
POST   /articles/:articleId/comments
DELETE /comments/:commentId
GET    /comments/:commentId/reactions
POST   /comments/:commentId/reactions
```

`POST /articles/:articleId/comments` 请求体：

```json
{
  "content": "这个角度很有帮助。",
  "parentId": 1,
  "replyToUserId": 2
}
```

`parentId` 和 `replyToUserId` 均可选。若传入 `parentId`，服务会检查父评论必须属于同一篇文章。

### Reaction

文章和评论 reaction 使用相同请求体：

```json
{
  "emoji": "👍"
}
```

返回示例：

```json
{
  "action": "added",
  "summary": {
    "total": 3,
    "counts": [
      {
        "emoji": "👍",
        "count": 2
      }
    ],
    "myReactions": ["👍"]
  }
}
```

## 5. AI 服务衔接

文章创建后可选调用 AI 服务：

```env
AI_SERVICE_URL=http://127.0.0.1:3004
AI_ANALYSIS_ON_CREATE=true
AI_SERVICE_TIMEOUT_MS=5000
```

若未配置 `AI_SERVICE_URL`，文章仍可正常创建，只是不会自动触发 AI 分析。这样可以保证答辩演示时即使模型服务未启动，内容服务也不会整体不可用。

当前 `article` 表没有 `status` 字段，所以文章接口会返回 `aiAnalysis` 与 `aiTags`，由前端或推荐服务根据评分决定展示策略。

## 6. 删除策略

文章删除：

1. 删除文章下评论 reaction。
2. 删除文章评论。
3. 删除文章 reaction。
4. 删除人工标签关联、AI 标签关联、AI 分析记录。
5. 删除文章本体。

评论删除：

1. 如果评论没有回复，直接删除评论和 reaction。
2. 如果评论已有回复，改为 `status=deleted` 且清空正文，保留楼层结构。

## 7. 代码结构

```text
blog_service/
  src/index.ts
  src/api/article.ts
  src/api/comment.ts
  src/controllers/articleController.ts
  src/controllers/commentController.ts
  src/services/articleService.ts
  src/services/commentService.ts
  src/services/reactionService.ts
  src/services/reactionConfig.ts
  src/services/auditService.ts
  src/services/contentSanitizer.ts
  src/utils/validation.ts
  middlewares/auth.ts
  lib/prisma.ts
  prisma/schema.prisma
```

## 8. 验证记录

已执行：

```bash
npx prisma generate
npm run build
```

运行时只读验证：

1. `GET /health` 返回 `status=ok`。
2. `GET /articles?limit=2` 能返回文章列表、AI 标签和文章 reaction 聚合结构。
3. `GET /articles/:articleId/comments?limit=3` 能返回评论列表结构。

本轮没有对云端库执行真实 reaction 写入测试，以避免污染现有数据。

## 9. 后续任务

下一阶段建议继续恢复：

1. 关注与取消关注接口。
2. 关注时间线。
3. 简化推荐流。
4. 前端文章卡片、评论区和 emoji reaction 面板。
