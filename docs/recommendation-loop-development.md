# 推荐闭环开发拆解文档

生成日期：2026-05-03

## 1. 本阶段目标

本阶段把此前的“简化推荐流”升级为可解释的推荐闭环：

```text
信息流展示
  -> 写入曝光事件
  -> 用户点击、停留、评论、reaction、关注作者
  -> 写入 reco_event
  -> 生成 reco_user_profile
  -> 根据画像、内容质量、作者评级和风险评分重排推荐流
```

这套实现不是工业级复杂推荐系统，而是适合毕业设计答辩的轻量级混合推荐策略。它的优点是数据表完整、逻辑闭环清晰、评分公式可解释。

## 2. 已完成内容

1. `reco_event` 事件写入服务。
2. 推荐请求日志 `reco_request_log` 写入。
3. 曝光后写入 `reco_user_seen`。
4. 文章每日统计 `reco_article_daily_stat` 增量更新。
5. 基于用户行为和 AI 标签生成 `reco_user_profile`。
6. 推荐流从“最新文章”升级为“画像驱动排序”。
7. 评论、文章 reaction、文章详情点击、关注作者均接入推荐事件。
8. 前端恢复推荐流、关注流、关注按钮、粉丝列表、文章详情、评论与 reaction。

## 3. 表结构使用

| 表名 | 使用方式 | 说明 |
| --- | --- | --- |
| `reco_event` | 写 | 记录曝光、点击、停留、点赞、评论、关注作者等行为。 |
| `reco_request_log` | 写 | 记录每次推荐请求的候选数和返回文章 ID。 |
| `reco_user_seen` | 写 | 记录用户看过哪些文章，用于已看惩罚。 |
| `reco_article_daily_stat` | 写 | 记录文章每日曝光、点击、互动和质量分。 |
| `reco_user_profile` | 读写 | 保存用户标签兴趣向量和作者亲和度。 |
| `article_ai_tag_on_article` | 读 | 为用户画像和推荐排序提供 AI 标签。 |
| `article_ai_analysis` | 读 | 为内容展示控制和质量评分提供依据。 |
| `user` | 读 | 使用作者综合专业度、友好度影响排序。 |

## 4. 事件设计

已支持的事件类型：

```text
IMPRESSION
CLICK
DWELL
READ_COMPLETE
LIKE
COMMENT
FAVORITE
FOLLOW_AUTHOR
HIDE
REPORT
```

事件写入入口：

```text
POST /reco/events
```

请求示例：

```json
{
  "articleId": 12,
  "eventType": "DWELL",
  "dwellMs": 23000,
  "scene": "article_detail"
}
```

自动写入行为：

| 行为 | 事件 |
| --- | --- |
| 推荐流 / 关注流返回文章 | `IMPRESSION` |
| 打开文章详情 | `CLICK` |
| 文章 reaction 新增 | `LIKE` |
| 评论 reaction 新增 | `LIKE` |
| 发布评论 | `COMMENT` |
| 关注作者 | `FOLLOW_AUTHOR` |
| 前端离开文章详情页 | `DWELL` |
| 前端标记已读 | `READ_COMPLETE` |

## 5. 用户画像生成

画像生成入口：

```text
POST /reco/profile/me/refresh
GET  /reco/profile/me
```

画像生成逻辑：

1. 读取用户最近 90 天最多 500 条 `reco_event`。
2. 根据事件类型计算权重。
3. 根据事件时间做时间衰减。
4. 读取事件对应文章的 AI 标签。
5. 将 AI 标签累加为 `tagVector.tags`。
6. 将互动文章作者累加为 `authorAffinity`。
7. 归一化后写入 `reco_user_profile`。

`reco_user_profile.tagVector` 示例：

```json
{
  "tags": {
    "人工智能": 1,
    "学习方法": 0.72,
    "理性讨论": 0.31
  },
  "updatedFromEvents": 42,
  "version": 1
}
```

## 6. 推荐排序公式

当前推荐流接口：

```text
GET /feeds/recommended
```

推荐分由以下部分组成：

```text
total =
  tagMatch * 4
+ authorAffinity * 2
+ authorQuality * 1.2
+ contentQuality
+ freshness
- riskPenalty
- seenPenalty
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `tagMatch` | 文章 AI 标签与用户兴趣向量的匹配度。 |
| `authorAffinity` | 用户历史上对该作者内容的互动亲和度。 |
| `authorQuality` | 作者 `professionalism` 与 `friendliness` 的综合加成。 |
| `contentQuality` | AI 四维评分、互动统计和每日质量分。 |
| `freshness` | 发布时间新鲜度。 |
| `riskPenalty` | 合规度越低惩罚越高，低于 40 直接过滤。 |
| `seenPenalty` | 用户已多次曝光的文章降权。 |

返回文章中会包含：

```json
{
  "recommendation": {
    "total": 4.213,
    "tagMatch": 0.8,
    "authorAffinity": 0.2,
    "authorQuality": 0.5,
    "contentQuality": 1.1,
    "freshness": 0.9,
    "riskPenalty": 0,
    "seenPenalty": 0.55
  }
}
```

## 7. 展示控制

当前展示控制仍基于已有表结构，不新增字段：

| 条件 | 处理 |
| --- | --- |
| 无 AI 分析记录 | 暂时允许进入候选，保证旧数据兼容。 |
| `legalityScore >= 40` | 可进入关注流和推荐流。 |
| `legalityScore < 40` | 从推荐与关注流过滤。 |
| `legalityScore 40-59` | 不过滤，但有明显风险惩罚。 |
| 作者综合评分较高 | 获得轻量加成。 |

## 8. 前端恢复范围

前端目录 `mofukaze` 已恢复为 Nuxt 3 + Vue 3 + TypeScript：

```text
mofukaze/pages/index.vue
mofukaze/pages/article/[id].vue
mofukaze/pages/u/[id].vue
mofukaze/pages/login.vue
mofukaze/components/ArticleCard.vue
mofukaze/components/FollowButton.vue
mofukaze/composables/useApi.ts
mofukaze/composables/useAuth.ts
```

页面能力：

1. `/` 推荐流与关注流。
2. `/article/:id` 文章详情、评论、文章 reaction、评论 reaction、停留事件、已读事件。
3. `/u/:id` 用户主页、关注按钮、粉丝列表、关注列表。
4. `/login` 基础登录。

前端默认使用统一 API 前缀：

```text
/api -> api_gateway
```

可通过环境变量覆盖：

```env
NUXT_PUBLIC_API_BASE=/api
NUXT_API_PROXY_TARGET=http://127.0.0.1:3001
```

## 9. 验证记录

后端：

```bash
cd blog_service
npm run build
```

运行时验证：

1. `GET /feeds/recommended?limit=2` 返回 `source=personalized`、`strategy=ai-tag-profile-v1`。
2. `POST /reco/events` 可写入 `CLICK` 事件。
3. `POST /reco/profile/me/refresh` 可生成用户画像。
4. 带登录态访问推荐流会返回 `profileReady=true`。

前端：

```bash
cd mofukaze
npm run build
npm run typecheck
```

注意：当前机器 Node.js 为 `20.8.0`，新版本 Nuxt/Nuxi 的部分依赖要求更高 Node 版本。因此前端将 `nuxt` 与 `nuxi` 固定为 `3.13.2`，保证当前环境可构建。

## 10. 后续可增强点

1. 增加 `HIDE`、`REPORT` 的前端按钮。
2. 把推荐参数抽成配置，方便答辩时展示不同策略。
3. 增加管理员页面查看 `reco_event` 和 `reco_user_profile`。
4. 给 `article` 增加 `status` 字段后，将展示控制前移到发布流程。
