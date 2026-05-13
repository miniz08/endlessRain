# 基于评分机制的推荐与展示控制功能实现文档

## 模块职责

本模块负责推荐流、关注流、用户画像、推荐事件采集和基于评分机制的展示控制。它把 AI 内容评分、用户画像、作者评分、发布时间、已看记录和互动反馈结合起来，生成内容展示顺序。

## 核心实现位置

| 类型 | 文件 |
| --- | --- |
| 推荐路由 | `blog_service/src/api/feed.ts`、`blog_service/src/api/reco.ts` |
| 推荐控制器 | `blog_service/src/controllers/feedController.ts`、`blog_service/src/controllers/recoController.ts` |
| 推荐服务 | `blog_service/src/services/recommendationService.ts`、`blog_service/src/services/feedService.ts` |
| 推荐事件 | `blog_service/src/services/recoEventService.ts` |
| 用户画像 | `blog_service/src/services/userProfileService.ts` |
| 前端页面 | `mofukaze/pages/index.vue`、`mofukaze/pages/topic.vue` |

## 数据表

| 表名 | 作用 |
| --- | --- |
| `reco_event` | 记录曝光、点击、停留、点赞、评论、隐藏、举报等行为 |
| `reco_request_log` | 记录推荐请求、候选数量和结果 id |
| `reco_user_profile` | 保存用户标签向量和作者亲和度 |
| `reco_user_seen` | 保存用户已看文章和曝光次数 |
| `reco_article_daily_stat` | 保存文章每日行为统计和质量分 |

## 核心代码讲解

推荐流入口是 `feedController.recommendedFeedController`，它读取分页参数、当前用户 id 和 `requestId`，然后调用 `listRecommendedFeed`。推荐服务最终进入 `recommendationService.listPersonalizedRecommendations`。

`listPersonalizedRecommendations` 的流程可以分成五步。第一步，如果用户已登录，调用 `ensureProfile` 读取或刷新用户画像；画像超过 6 小时会重新计算。第二步，从公开文章中加载候选内容，候选状态只允许 `PUBLISHED` 和 `LOW_PRIORITY`。第三步并行加载 reaction 汇总、评论数量、近 14 天文章统计和已看记录。第四步对每篇文章调用 `scoreArticle` 算分并排序。第五步记录本次推荐请求和曝光事件。

排序函数 `scoreArticle` 把多个信号合成一个总分：

```text
total =
  tagMatch * 4 +
  authorAffinity * 2 +
  authorQuality * 1.2 +
  contentQuality +
  freshness -
  riskPenalty -
  seenPenalty
```

其中 `tagMatch` 来自文章 AI 标签与用户画像标签向量的匹配，`authorAffinity` 来自用户对作者的历史互动，`authorQuality` 来自作者的专业度和友好度，`contentQuality` 来自 AI 质量和互动统计，`freshness` 表示新鲜度，`riskPenalty` 根据合法性分数惩罚风险内容，`seenPenalty` 降低重复曝光内容优先级。

用户画像由 `userProfileService.refreshUserProfile` 生成。它读取用户最近 90 天最多 500 条推荐事件，按事件类型赋予不同权重，再按时间衰减。点击、停留、阅读完成、点赞、评论、收藏和关注作者等行为增加标签和作者亲和度；隐藏和举报产生负向信号。最终结果写入 `reco_user_profile`。

推荐事件由 `recordRecoEvent` 写入。它会先确认文章存在且处于公开状态，再创建 `reco_event`。随后更新文章日统计；如果事件是曝光，还会更新 `reco_user_seen`；如果事件属于会影响画像的类型，则刷新用户画像。

压力测试暴露出一个重要工程问题：在 16 并发访问推荐流时，`reco_user_seen.upsert` 和 `reco_user_profile.upsert` 在首次并发写入同一主键时可能触发唯一键冲突。修复后，推荐热路径上的 `reco_user_seen`、`reco_user_profile` 和 `reco_article_daily_stat` 都改为 MySQL 原子 `INSERT ... ON DUPLICATE KEY UPDATE`，避免并发首次写入时失败。定向复验中推荐流 160 次请求全部返回 200。

关注流由 `feedService.listFollowingFeed` 实现。它先读取当前用户关注的人，再把自己和已关注用户作为作者集合查询公开文章。关注流也会记录推荐请求和曝光事件，因此关注内容同样参与画像和统计。

## 主要接口

| 接口 | 说明 |
| --- | --- |
| `GET /api/feeds/recommended` | 推荐流 |
| `GET /api/feeds/following` | 关注流 |
| `POST /api/reco/events` | 上报推荐事件 |
| `GET /api/reco/profile/me` | 查询我的画像 |
| `POST /api/reco/profile/me/refresh` | 刷新我的画像 |

## 测试关联

黑盒测试覆盖推荐流、关注流、推荐事件上报、非法事件拦截和用户画像刷新。压力测试中推荐流是最慢的接口，修复后并发 16、160 次请求无 500，但 P95 仍约 5 秒，说明候选加载、画像刷新和多表统计仍是后续优化重点。

## 已实现能力

- 推荐流只使用公开状态内容作为候选。
- 关注流按关注关系拉取内容。
- 推荐排序参考 AI 标签、用户画像、作者质量、内容质量、时间新鲜度和风险惩罚。
- 用户行为会写入推荐事件并更新画像。
- 推荐结果会写入请求日志，便于审计和调试。
- 推荐高频写入使用原子插入更新，降低并发主键冲突风险。
