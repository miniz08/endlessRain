# blog_service 关注关系与时间线开发拆解文档

生成日期：2026-05-03

## 1. 本阶段范围

本阶段在上一轮文章、评论、emoji reaction 的基础上，恢复社交关系和基础信息流能力。

已完成：

1. 关注用户。
2. 取消关注用户。
3. 查询关注列表。
4. 查询粉丝列表。
5. 查询用户关注概览。
6. 关注时间线。
7. 简化推荐流入口。本功能已在后续 [recommendation-loop-development.md](recommendation-loop-development.md) 中升级为画像驱动推荐闭环。

## 2. 数据表归属

| 表名 | 使用方式 | 说明 |
| --- | --- | --- |
| `follow` | 读写 | 维护用户关注关系，使用 `ACTIVE` / `REMOVED` 状态软删除。 |
| `user` | 读 | 返回用户公开信息与校验目标用户。 |
| `article` | 读 | 生成关注时间线和推荐流候选内容。 |
| `article_ai_analysis` | 读 | 过滤明显高风险内容。 |
| `article_ai_tag_on_article` | 读 | 返回 AI 标签。 |
| `article_reaction` | 读 | 返回文章 reaction 聚合。 |
| `comment` | 读 | 返回文章评论数。 |
| `audit_log` | 写 | 记录关注与取关操作。 |

## 3. 关注关系设计

`follow` 表中有唯一索引：

```text
@@unique([followerId, followingId])
```

因此当前策略为：

1. 第一次关注时创建记录，状态为 `ACTIVE`。
2. 取消关注时不物理删除，改为 `REMOVED`。
3. 再次关注同一用户时复用原记录，将状态改回 `ACTIVE`。
4. 不允许关注自己。

这样可以保留关系历史，也避免重复关注记录。

## 4. 接口设计

### 关注关系

```text
POST   /users/:userId/follow
DELETE /users/:userId/follow
GET    /users/:userId/follow-summary
GET    /following?userId=:userId
GET    /followers?userId=:userId
```

`POST` 和 `DELETE` 需要登录。列表接口可以公开查询，若带登录态则会额外返回 `followedByMe`。

关注概览返回：

```json
{
  "summary": {
    "userId": 1,
    "followingCount": 3,
    "followerCount": 2,
    "followedByMe": false
  }
}
```

### 信息流

```text
GET /feeds/following
GET /feeds/recommended
```

`/feeds/following` 需要登录。当前返回：

1. 当前用户自己发布的文章。
2. 当前用户已关注作者发布的文章。
3. 按发布时间倒序排列。
4. 默认隐藏 AI 合规度低于 40 的明显高风险内容。

`/feeds/recommended` 是简化推荐流。当前策略为“最新可见文章”，保留统一返回结构，后续可接入 `reco_*` 表做更完整的推荐。

## 5. 展示控制

由于 `article` 表没有 `status` 字段，当前展示控制以 `article_ai_analysis.legalityScore` 为准：

| 条件 | 处理 |
| --- | --- |
| 无 AI 分析记录 | 暂时可展示，便于恢复阶段兼容旧数据。 |
| `legalityScore >= 40` | 可进入普通信息流。 |
| `legalityScore < 40` | 从关注流和推荐流中过滤。 |

这是一版答辩友好的简化策略。后续若新增 `article.status`，可以把该逻辑前移到发布流程。

## 6. 代码结构

新增文件：

```text
blog_service/src/api/feed.ts
blog_service/src/api/follow.ts
blog_service/src/controllers/feedController.ts
blog_service/src/controllers/followController.ts
blog_service/src/services/feedService.ts
blog_service/src/services/followService.ts
```

复用文件：

```text
blog_service/src/services/articleService.ts
blog_service/src/services/reactionService.ts
blog_service/src/services/auditService.ts
```

## 7. 验证记录

已执行：

```bash
npm run build
```

运行时只读验证：

1. `GET /feeds/recommended?limit=2` 返回简化推荐流。
2. `GET /users/:userId/follow-summary` 返回粉丝数、关注数。
3. 使用测试 JWT 访问 `GET /feeds/following?limit=2`，返回关注时间线。

本阶段没有真实执行关注/取关写入测试，以避免污染云端数据库。

## 8. 后续任务

下一阶段建议：

1. 将 `reco_event` 写入推荐曝光、点击、评论、reaction 等行为。
2. 基于 `reco_user_profile` 和 AI 标签生成用户兴趣向量。
3. 前端恢复关注按钮、粉丝列表、关注时间线页面。
4. 根据用户综合评分调整推荐或展示优先级。
