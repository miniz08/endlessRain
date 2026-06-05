# 推荐分项计算细节说明

本文用于答辩时解释推荐分到底如何计算，重点回答“哪些行为、哪些字段会影响每个分项”。

对应核心代码：

- `blog_service/src/services/recommendationService.ts`
- `blog_service/src/services/userProfileService.ts`
- `blog_service/src/services/recoEventService.ts`
- `ai_service/src/services/analysisService.ts`

## 1. 推荐总分

当前推荐总分公式为：

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

排序时按照 `total` 降序排列；如果分数相同，再按文章发布时间倒序排列。

在打分之前，系统先做候选过滤：

```text
article.status 必须是 PUBLISHED 或 LOW_PRIORITY
legalityScore 为空，或 legalityScore >= 40
```

也就是说，推荐公式只负责“可展示内容怎么排序”，不负责让审核中或拒绝内容绕过展示控制。

## 2. 用户画像如何生成

标签匹配分和作者亲和度都依赖用户画像。画像来自 `reco_event`，不是用户手动填写。

画像刷新时读取：

```text
最近 90 天内的推荐事件
最多 500 条
按 createdAt 倒序读取
```

每条事件先计算行为权重：

| 事件 | 权重 |
| --- | ---: |
| `IMPRESSION` | 0.03 |
| `CLICK` | 1 |
| `DWELL` | `min(3, max(0.2, dwellMs / 20000))` |
| `READ_COMPLETE` | 2 |
| `LIKE` | 3 |
| `COMMENT` | 4 |
| `FAVORITE` | 5 |
| `FOLLOW_AUTHOR` | 2.5 |
| `HIDE` | -3 |
| `REPORT` | -6 |

然后按时间衰减：

```text
ageDays = 当前时间 - 事件时间
ageFactor = exp(-ageDays / 30)
finalWeight = eventWeight * ageFactor
```

含义是：越新的行为影响越大，越旧的行为逐渐变弱。

注意：`IMPRESSION` 会写入事件和已看记录，但不会立即触发画像刷新；点击、停留、阅读完成、点赞、评论、收藏、关注作者、隐藏、举报会触发画像刷新。后续画像过期刷新时，曝光事件也会以很小权重参与计算。

## 3. 标签匹配分 tagMatch

来源：

```text
用户 tagVector
文章 AI 标签 article_ai_tag_on_article
```

计算方式：

```text
tagMatch =
  sum(
    用户对该标签的兴趣权重
    * 文章该 AI 标签的 weight
    * 文章该 AI 标签的 confidence
  )
```

代码逻辑：

```text
interest = tagVector[tagName] ?? 0
tagMatch += interest * (tagWeight ?? 0.7) * (confidence ?? 0.7)
```

哪些行为会影响它：

- 用户点击、停留、读完、点赞、评论某篇文章，会提高该文章 AI 标签在用户画像中的权重。
- 用户隐藏、举报某篇文章，会降低该文章 AI 标签在用户画像中的权重。
- 文章 AI 标签的 `confidence` 和 `weight` 越高，该标签对匹配分影响越大。
- 如果用户没有画像，或文章没有 AI 标签，这一项接近 0。

画像中的标签向量最多保留 60 个标签，并按最大绝对值归一化，因此标签兴趣通常落在约 `-1` 到 `1` 之间。负数表示用户对该类内容有负反馈。

在总分中的作用：

```text
tagMatch * 4
```

这是权重最高的兴趣项，说明系统优先考虑文章主题是否符合用户兴趣。

## 4. 作者亲和度 authorAffinity

来源：

```text
用户 authorAffinity
文章 authorId
```

画像生成时，每条行为都会影响该文章作者：

```text
authorAffinity[article.authorId] += finalWeight
```

推荐时读取：

```text
authorAffinity = userProfile.authorAffinity[String(article.authorId)] ?? 0
```

哪些行为会影响它：

- 用户经常点击、评论、点赞、读完某作者文章，该作者亲和度上升。
- 用户隐藏、举报某作者文章，该作者亲和度下降。
- `FOLLOW_AUTHOR` 事件会给该作者较强正反馈。
- 时间越近的行为影响越大。

作者向量最多保留 80 个作者，并按最大绝对值归一化。

在总分中的作用：

```text
authorAffinity * 2
```

它表示用户是否偏好某个作者，但权重低于标签匹配，避免推荐只被作者关系控制。

## 5. 作者质量分 authorQuality

来源：

```text
article.user.professionalism
article.user.friendliness
```

计算方式：

```text
authorQuality =
  ((professionalism + friendliness) / 2 - 50) / 50
```

如果作者专业度和友好度都是 100：

```text
((100 + 100) / 2 - 50) / 50 = 1
```

如果两项都是 50：

```text
0
```

如果两项都是 0：

```text
-1
```

作者专业度和友好度来自 AI 对作者历史文章的统计。AI 服务会计算作者文章的平均专业性分、平均友好度分，并按低优先级、复核、拒绝文章数量扣分：

```text
penalty =
  LOW_PRIORITY 数量 * 3
  + REVIEW_REQUIRED 数量 * 8
  + REJECTED 数量 * 18

professionalism = avgProfessionalism - penalty
friendliness = avgFriendliness - penalty * 0.6
```

最后会限制在 `0-100`。

在总分中的作用：

```text
authorQuality * 1.2
```

它让高质量作者在同等兴趣匹配下略微靠前，但不会压过用户兴趣和内容质量。

## 6. 内容质量分 contentQuality

来源：

```text
AI 四项评分
最近 14 天文章互动统计 reco_article_daily_stat
```

计算分三部分：

```text
contentQuality =
  aiQuality * 1.8
  + statQuality
  + engagement
```

### 6.1 AI 质量 aiQuality

如果文章已有 AI 分析：

```text
aiQuality =
  (
    friendlinessScore
    + rationalityScore
    + professionalismScore
    + legalityScore
  ) / 400
```

四项都为 100 时，`aiQuality = 1`。

如果没有 AI 分析，默认：

```text
aiQuality = 0.45
```

在内容质量中：

```text
aiQuality * 1.8
```

说明 AI 评分是内容质量分的重要来源。

### 6.2 近期质量统计 statQuality

系统会读取最近 14 天的 `reco_article_daily_stat`。

每次推荐事件会改变文章日统计中的 `qualityScore`：

| 事件 | qualityScore 增量 |
| --- | ---: |
| `CLICK` | +0.2 |
| `DWELL` | `min(1.5, max(0, dwellMs) / 30000)` |
| `READ_COMPLETE` | +1.2 |
| `LIKE` | +1.5 |
| `COMMENT` | +2 |
| `FAVORITE` | +2.5 |
| `FOLLOW_AUTHOR` | +2 |
| `HIDE` | -2 |
| `REPORT` | -5 |
| `IMPRESSION` | 0 |

然后：

```text
statQuality = clamp(qualityScore / 8, -2, 4)
```

也就是说：

- 点击、停留、读完、点赞、评论会提高内容质量分。
- 隐藏、举报会降低内容质量分。
- 分数被限制在 `-2` 到 `4`，避免某篇文章因为短期互动过高而无限放大。

### 6.3 互动率 engagement

如果文章有曝光：

```text
engagement =
  (
    clicks * 0.6
    + likes
    + comments * 1.2
    + favorites * 1.4
    - hides
    - reports * 2
  ) / max(10, impressions)
```

如果没有曝光：

```text
engagement = 0
```

这里的含义是：

- 点击、点赞、评论、收藏提高互动率。
- 隐藏、举报降低互动率。
- 分母至少为 10，避免曝光很少时互动率被极端放大。
- `READ_COMPLETE`、`DWELL`、`FOLLOW_AUTHOR` 不直接进入 engagement，但会通过 `qualityScore` 影响 `statQuality`。

## 7. 时间新鲜度 freshness

来源：

```text
article.posttime
```

计算方式：

```text
ageHours = 当前时间 - 发布时间
freshness = exp(-ageHours / 72)
```

含义：

- 刚发布的文章接近 `1`。
- 发布约 72 小时后，约为 `0.37`。
- 发布约 144 小时后，约为 `0.14`。

它是指数衰减，不是线性下降。这样新文章有初始曝光机会，但不会长期仅凭“新”排在前面。

## 8. 风险惩罚 riskPenalty

来源：

```text
article_ai_analysis.legalityScore
```

计算方式：

| legalityScore | riskPenalty |
| ---: | ---: |
| 未分析 / 为空 | 0.2 |
| >= 80 | 0 |
| >= 60 且 < 80 | 0.8 |
| >= 40 且 < 60 | 2.2 |
| < 40 | 100 |

同时，推荐候选过滤阶段已经要求：

```text
legalityScore 为空，或 legalityScore >= 40
```

所以正常情况下，`legalityScore < 40` 的文章不会进入推荐候选。`riskPenalty = 100` 是一层兜底保护。

需要注意一个边界：

设计上可以把 `LOW_PRIORITY` 理解为低优先级/风险内容，但当前实际代码里的 `riskPenalty` 主要按 `legalityScore` 计算，并没有额外读取 `article.status === LOW_PRIORITY` 再单独加罚。`LOW_PRIORITY` 通常是 AI 合法性分处于中间区间后映射出来的状态，因此会通过较低 `legalityScore` 间接受到风险惩罚。

如果答辩时被追问，可以这样说：

> 当前实现中，风险惩罚主要由 AI 合法性分驱动；低优先级状态本身不会额外叠加一个固定惩罚，但它通常来源于较低的合法性分，所以会间接体现在 riskPenalty 中。后续如果要更严格，可以在公式中增加 LOW_PRIORITY 的状态惩罚项。

## 9. 已看惩罚 seenPenalty

来源：

```text
reco_user_seen.seenCount
```

推荐流返回文章后，会自动记录曝光：

```text
recordImpressions(...)
```

如果用户已登录，每次 `IMPRESSION` 会更新：

```text
reco_user_seen.seenCount += 1
lastSeenAt = 当前时间
```

计算方式：

```text
seenPenalty = min(2, seenCount * 0.55)
```

举例：

| seenCount | seenPenalty |
| ---: | ---: |
| 0 | 0 |
| 1 | 0.55 |
| 2 | 1.10 |
| 3 | 1.65 |
| 4 及以上 | 2 |

它的作用是减少重复曝光，而不是彻底屏蔽文章。因为惩罚上限是 2，如果文章本身高度匹配、质量很高，仍然可能再次出现，只是排序会降低。

## 10. 哪些行为会影响哪些分项

| 用户行为 / 系统事件 | 影响标签匹配分 | 影响作者亲和度 | 影响内容质量分 | 影响已看惩罚 |
| --- | --- | --- | --- | --- |
| 推荐曝光 `IMPRESSION` | 低权重影响，通常延迟到画像刷新 | 低权重影响，通常延迟到画像刷新 | 增加曝光数，影响 engagement 分母 | 增加 seenCount |
| 点击详情 `CLICK` | 提高文章 AI 标签权重 | 提高作者亲和度 | `qualityScore +0.2`，点击数进入 engagement | 不直接影响 |
| 停留 `DWELL` | 按停留时长提高标签权重 | 按停留时长提高作者亲和度 | `qualityScore` 按停留时长增加 | 不直接影响 |
| 阅读完成 `READ_COMPLETE` | 提高标签权重 | 提高作者亲和度 | `qualityScore +1.2` | 不直接影响 |
| 点赞 / reaction `LIKE` | 明显提高标签权重 | 明显提高作者亲和度 | `qualityScore +1.5`，likes 进入 engagement | 不直接影响 |
| 评论 `COMMENT` | 强提高标签权重 | 强提高作者亲和度 | `qualityScore +2`，comments 进入 engagement | 不直接影响 |
| 收藏 `FAVORITE` | 很强提高标签权重 | 很强提高作者亲和度 | `qualityScore +2.5`，favorites 进入 engagement | 不直接影响 |
| 关注作者 `FOLLOW_AUTHOR` | 提高文章标签权重 | 提高作者亲和度 | `qualityScore +2` | 不直接影响 |
| 隐藏 `HIDE` | 降低标签权重 | 降低作者亲和度 | `qualityScore -2`，hides 降低 engagement | 不直接影响 |
| 举报 `REPORT` | 强降低标签权重 | 强降低作者亲和度 | `qualityScore -5`，reports 强降低 engagement | 不直接影响 |

说明：`FAVORITE` 在当前前端中作为推荐强正反馈入口存在，点击“收藏”会写入推荐事件并影响画像和文章日统计；它不是完整收藏夹功能，不提供收藏列表管理。

## 11. 答辩时的简短解释版本

可以压缩为：

> 推荐分由兴趣、质量、时效、风险和重复曝光几类信号组成。兴趣来自用户画像，画像由最近 90 天、最多 500 条推荐事件计算，点击、停留、点赞、评论会提高相关标签和作者权重，隐藏、举报会降低它们。质量来自 AI 四项评分和最近 14 天互动统计；新鲜度按发布时间指数衰减；风险惩罚主要由 AI 合法性分决定；已看惩罚来自曝光记录，避免同一篇文章反复出现。因此推荐不是单纯按时间或热度排序，而是 AI 内容分析和用户行为反馈共同作用的结果。

