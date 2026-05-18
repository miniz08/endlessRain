# 推荐流、展示控制流与用户画像流答辩说明

本文用于说明系统中推荐流、公开展示控制流、用户画像流三者的计算方式和交互关系。整体上，本系统采用的是“规则过滤 + 画像向量 + AI 评分 + 行为反馈”的混合推荐思路：先保证内容能不能展示，再决定内容排在前面还是后面，最后把用户行为重新写回画像和统计表中。

## 1. 答辩口述版

如果在答辩中需要用一段话解释，可以这样表述：

本系统的内容分发不是单纯按发布时间排序，而是先经过展示控制流判断文章是否允许出现在公共页面，再由推荐流根据用户画像、文章 AI 标签、作者质量、内容质量、时间新鲜度、风险惩罚和已看惩罚进行综合打分。用户在推荐页看到、点击、停留、点赞、评论、收藏、关注、隐藏或举报文章时，系统会把这些动作记录为推荐事件，并按照不同权重更新用户画像和文章日统计。这样推荐结果会随着用户行为变化，同时低质量或风险内容会被过滤或降权。

## 2. 三条流程的职责

| 流程 | 主要问题 | 输入 | 输出 |
| --- | --- | --- | --- |
| 展示控制流 | 这篇文章能不能被当前用户看到 | 文章状态、AI 合法性分、用户身份、作者关系 | 允许展示、隐藏或返回 404 |
| 用户画像流 | 这个用户对什么标签、哪些作者更感兴趣 | 最近 90 天、最多 500 条推荐事件 | 标签兴趣向量、作者亲近度向量 |
| 推荐流 | 在可展示文章中，哪些应排在前面 | 公开候选文章、用户画像、AI 分析、互动统计、已看记录 | 个性化推荐列表 |

三者的关系可以理解为：

```text
文章发布与 AI 审核
        |
        v
文章状态与 AI 分析结果
        |
        +----> 展示控制流：决定文章是否允许进入公开集合
        |
        v
推荐候选池
        |
        +----> 用户画像流：提供用户偏好的标签和作者权重
        |
        v
推荐流：综合打分、排序、返回列表
        |
        v
曝光、点击、停留、点赞、评论、收藏、隐藏、举报
        |
        v
推荐事件表、文章日统计、已看记录、用户画像刷新
```

## 3. 展示控制流

展示控制流的核心原则是：推荐只能在“允许展示”的内容中排序，不能用推荐算法绕开展示权限。

### 3.1 普通列表展示

普通文章列表由 `GET /api/articles` 进入，对应代码主要在：

- `blog_service/src/controllers/articleController.ts`
- `blog_service/src/services/articleService.ts`

普通访问者只能看到状态为 `PUBLISHED` 或 `LOW_PRIORITY` 的文章。系统中把这两个状态定义为公共可见状态：

```text
PUBLIC_ARTICLE_STATUSES = ["PUBLISHED", "LOW_PRIORITY"]
```

文章列表还支持按作者、关注作者、标签和游标分页过滤。排序方式为：

```text
posttime desc, id desc
```

也就是默认仍保留时间流特征，但先执行公开状态过滤。

### 3.2 详情页展示

文章详情页会调用 `canViewArticle` 进行判断：

| 用户类型 | 是否能看非公开文章 |
| --- | --- |
| 普通未登录用户 | 不能 |
| 普通登录用户 | 不能 |
| 文章作者本人 | 可以看自己的文章 |
| admin | 可以看审核相关内容 |

如果无权访问，接口返回 404，而不是返回“无权限”。这样可以避免泄露非公开文章确实存在的信息。

### 3.3 AI 合法性控制

在推荐流和部分 feed 场景中，系统还会判断 AI 合法性分：

```text
legalityScore >= 40 才允许进入 feed
```

如果合法性分低于 40，则即使状态异常被写成公开，也不会进入推荐 feed。这里相当于增加了一层安全兜底。

### 3.4 LOW_PRIORITY 的含义

`LOW_PRIORITY` 不是删除，也不是完全隐藏。它表示内容可以公开展示，但不应该被强推荐。因此它会进入公共集合，但在推荐计算中受到风险惩罚。

这点适合在答辩中强调：系统把“能不能看”和“要不要优先推荐”分开处理。这样既保留内容可见性，也避免低质量或边界内容占据推荐位。

## 4. 用户画像流

用户画像流对应代码主要在：

- `blog_service/src/services/userProfileService.ts`
- `blog_service/src/services/recoEventService.ts`
- `blog_service/src/controllers/recoController.ts`

画像由推荐事件生成。系统读取当前用户最近 90 天内、最多 500 条推荐事件，根据事件类型、发生时间、文章 AI 标签和作者信息，计算两个向量：

| 向量 | 含义 |
| --- | --- |
| tagVector | 用户对各类 AI 标签的兴趣强弱 |
| authorAffinity | 用户对不同作者的亲近度 |

### 4.1 推荐事件类型

系统支持这些事件：

```text
IMPRESSION, CLICK, DWELL, READ_COMPLETE, LIKE, COMMENT,
FAVORITE, FOLLOW_AUTHOR, HIDE, REPORT
```

其中，强行为会触发画像刷新：

```text
CLICK, DWELL, READ_COMPLETE, LIKE, COMMENT, FAVORITE,
FOLLOW_AUTHOR, HIDE, REPORT
```

`IMPRESSION` 只表示用户看到了内容，它会写入已看记录和日统计，但不会立即刷新画像。这样可以避免用户只是被动刷到内容就强烈改变兴趣。

### 4.2 行为权重

画像更新时，不同事件的权重不同：

| 事件 | 权重含义 |
| --- | --- |
| IMPRESSION | 0.03，只作为很弱的曝光信号 |
| CLICK | 1，表示初步兴趣 |
| DWELL | 按停留时长计算，最长记为 3 |
| READ_COMPLETE | 2，表示完整阅读 |
| LIKE | 3，表示正向认可 |
| COMMENT | 4，表示参与讨论 |
| FAVORITE | 5，表示较强收藏意愿 |
| FOLLOW_AUTHOR | 2.5，表示对作者产生兴趣 |
| HIDE | -3，表示不想继续看类似内容 |
| REPORT | -6，表示强烈负反馈 |

停留事件的权重计算为：

```text
DWELL 权重 = min(3, max(0.2, dwellMs / 20000))
```

也就是说，停留时间越长，兴趣权重越高，但最高不会无限增加。

### 4.3 时间衰减

用户兴趣不是永久不变的。系统用指数衰减降低旧行为的影响：

```text
ageDays = 当前时间与事件时间相差的天数
ageFactor = exp(-ageDays / 30)
finalWeight = eventWeight * ageFactor
```

这样最近行为影响更大，较早的行为会逐渐变弱。答辩时可以说明：这是为了避免用户早期的一次兴趣长期绑架推荐结果。

### 4.4 标签向量计算

每条行为会影响文章对应的 AI 标签。若某篇文章有 AI 标签关系：

```text
tagWeight = relation.weight * relation.confidence
```

则该标签累加：

```text
tagVector[tagName] += finalWeight * tagWeight
```

正向行为会提高对应标签权重，隐藏、举报等负向行为会降低对应标签权重。

### 4.5 作者亲近度计算

同一条行为也会影响作者亲近度：

```text
authorAffinity[authorId] += finalWeight
```

这说明系统不仅学习“用户喜欢什么主题”，也学习“用户更常与哪些作者互动”。

### 4.6 向量归一化

最后系统会对向量排序、截断和归一化：

```text
标签向量最多保留 60 个标签
作者向量最多保留 80 个作者
每个值除以最大绝对值，缩放到大约 -1 到 1 之间
```

这样做有两个好处：

1. 控制画像字段大小，避免历史行为无限增长。
2. 让不同用户的兴趣强度可比较，方便后续推荐计算。

画像最终写入 `reco_user_profile` 表，其中 `tagVector` 存放标签兴趣，`authorAffinity` 存放作者亲近度。

## 5. 推荐流

推荐流对应代码主要在：

- `blog_service/src/controllers/feedController.ts`
- `blog_service/src/services/feedService.ts`
- `blog_service/src/services/recommendationService.ts`
- `blog_service/src/services/recoEventService.ts`

推荐入口为：

```text
GET /api/feeds/recommended
```

经过 API Gateway 后转发到 blog service。

### 5.1 推荐流程

推荐流的执行顺序如下：

```text
1. 接收推荐请求，读取 userId、limit、cursor、requestId
2. 如果用户已登录，读取用户画像
3. 如果画像不存在或超过 6 小时未更新，则刷新画像
4. 加载候选文章，数量为 max(80, limit * 8)
5. 只取 PUBLISHED 和 LOW_PRIORITY 状态的候选
6. 并行读取互动汇总、评论数量、最近 14 天文章统计、用户已看记录
7. 对每篇候选文章计算推荐分
8. 按推荐分降序排序，分数相同则按发布时间排序
9. 返回前 limit 条
10. 记录推荐请求和曝光事件
```

登录用户使用个性化画像；未登录用户画像为空，仍可以根据内容质量、时间新鲜度和互动数据获得基础推荐。

### 5.2 候选可见性

推荐候选再次执行可见性判断：

```text
status 必须为 PUBLISHED 或 LOW_PRIORITY
legalityScore 为空或大于等于 40
```

因此推荐排序不会把 `PENDING_REVIEW`、`REVIEW_REQUIRED`、`REJECTED` 等非公开状态推出去。

### 5.3 推荐总分公式

系统的推荐总分为：

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

各项含义如下：

| 分项 | 作用 |
| --- | --- |
| tagMatch | 用户画像标签与文章 AI 标签的匹配程度 |
| authorAffinity | 用户对该作者的历史亲近度 |
| authorQuality | 作者专业度和友好度形成的基础质量 |
| contentQuality | AI 内容质量、近期互动质量、互动率综合结果 |
| freshness | 时间新鲜度，新文章略有优势 |
| riskPenalty | AI 合法性较低或低优先级内容的风险惩罚 |
| seenPenalty | 用户已经多次看过的文章会被降权 |

这个公式的特点是：兴趣匹配权重最高，但不会完全忽视质量、安全和重复曝光。

### 5.4 标签匹配分

标签匹配分来自用户画像和文章 AI 标签关系：

```text
tagMatch = sum(profileTagWeight[tag] * articleTagWeight * confidence)
```

其中：

```text
articleTagWeight = relation.weight
confidence = AI 标签置信度
```

如果用户长期点击“数据分析”“AI模型”标签文章，那么这些标签在画像中权重更高，相关内容的 tagMatch 就会上升。

### 5.5 作者质量分

作者质量分由用户表中的专业度和友好度计算：

```text
authorQuality = ((professionalism + friendliness) / 2 - 50) / 50
```

如果作者的专业度、友好度都高，作者质量分为正；如果低于中间值，则可能为负。这样可以让高质量作者在同等主题匹配下获得更靠前的位置。

### 5.6 内容质量分

内容质量分由 AI 分析和近期互动统计组成：

```text
aiQuality =
  (friendlinessScore + rationalityScore + professionalismScore + legalityScore) / 400
```

```text
statQuality = clamp(qualityScore / 8, -2, 4)
```

```text
engagement =
  (clicks * 0.6 + likes + comments * 1.2 + favorites * 1.4 - hides - reports * 2)
  / max(10, impressions)
```

```text
contentQuality = aiQuality * 1.8 + statQuality + engagement
```

这里把 AI 内容判断和用户真实反馈结合起来：一篇文章即使 AI 分数不错，如果被大量隐藏或举报，也会被降权；反过来，有较多完整阅读、评论和收藏的内容会获得更高质量分。

### 5.7 时间新鲜度

时间新鲜度使用指数函数：

```text
ageHours = 当前时间与发布时间相差的小时数
freshness = exp(-ageHours / 72)
```

这表示文章越新，freshness 越接近 1；随着时间增加逐渐衰减。72 小时相当于一个较平缓的衰减周期。

### 5.8 风险惩罚

风险惩罚主要由合法性分决定：

| legalityScore | riskPenalty |
| --- | --- |
| 为空 | 0.2 |
| >= 80 | 0 |
| >= 60 | 0.8 |
| >= 40 | 2.2 |
| < 40 | 100 |

其中低于 40 的内容实际上也会被可见性过滤挡掉。设置 100 的极大惩罚，是为了在异常情况下仍然让风险内容排到最后。

### 5.9 已看惩罚

系统通过 `reco_user_seen` 记录用户已看次数：

```text
seenPenalty = min(2, seenCount * 0.55)
```

用户看过越多次，文章越容易被降权，但惩罚上限为 2，避免一篇高度相关的文章因为一次曝光就完全消失。

## 6. 事件回写与闭环

推荐流返回结果后，会做两类记录：

1. 写入 `reco_request_log`：记录一次推荐请求的 requestId、用户、场景、候选数量、结果 ID。
2. 写入曝光事件：把本次返回的文章逐条记录为 `IMPRESSION`。

曝光事件会继续更新：

```text
reco_event：保留原始事件
reco_article_daily_stat：文章当日曝光、点击、点赞、隐藏等统计
reco_user_seen：用户对文章的已看次数
```

用户后续点击、停留、点赞、评论、收藏、关注、隐藏或举报时，也会进入同一套事件记录逻辑。区别在于这些强行为会触发画像刷新，让下一次推荐更贴近用户行为。

可以把闭环概括为：

```text
推荐结果 -> 用户行为 -> 推荐事件 -> 文章统计与用户画像 -> 下一次推荐排序变化
```

## 7. 数据表分工

| 表 | 作用 |
| --- | --- |
| article | 存放文章内容、状态、作者、发布时间 |
| article_ai_analysis | 存放 AI 友好度、理性度、合法性、专业度评分 |
| article_ai_tag / article_ai_tag_on_article | 存放 AI 标签及其置信度、权重 |
| reco_event | 存放用户推荐行为原始事件 |
| reco_article_daily_stat | 按天聚合文章曝光、点击、阅读、点赞、隐藏、举报等 |
| reco_user_seen | 记录用户对文章的已看次数 |
| reco_user_profile | 存放用户画像，包括标签向量和作者亲近度 |
| reco_request_log | 存放每次推荐请求的结果集合，便于追踪和测试 |

## 8. 与测试结果的对应关系

在 `docs/recommendation-display-test-2026-05-12` 中已经执行过一轮大规模验证，最终批次为：

```text
rdisp_mp2lkdct_82d2ca
```

本批次写入：

| 数据类型 | 数量 |
| --- | --- |
| 画像用户 | 3 |
| 作者用户 | 36 |
| 文章 | 291 |
| 公开或低优先级文章 | 255 |
| 非公开文章 | 36 |
| 推荐事件 | 1021 |
| 已看记录 | 1 |

验证结果为 13 项全部通过。重点观察如下：

1. 数据型用户的推荐 Top 主题集中在 `data`、`ai`、`backend`。
2. 生活型用户的推荐 Top 主题集中在 `travel`、`food`、`design`、`film`。
3. 安全型用户的推荐 Top 主题集中在 `security`、`finance`、`backend`。
4. 三类用户推荐主题集合明显不同，说明画像确实影响排序。
5. 展示流未返回非公开文章，并能展示 `LOW_PRIORITY` 文章。
6. 已看文章相对于同类未看文章排序下降，说明 seenPenalty 生效。
7. 80 次推荐请求、并发 10，全部返回 200，说明功能在该规模下可用。

## 9. 答辩问答准备

### Q1：你的推荐算法是不是深度学习模型？

不是。当前实现更接近可解释的混合排序模型。它使用 AI 标签和 AI 内容评分作为输入，再结合用户行为画像、作者质量、互动统计和风险惩罚进行综合排序。这样做的好处是实现成本较低、每个分数来源可解释，更适合本科毕业设计中的工程实现和答辩说明。

### Q2：为什么推荐之前还要做展示控制？

因为推荐算法只能决定排序，不能决定权限。展示控制流负责回答“这篇文章能不能被看到”，推荐流只在可见内容中回答“哪篇更靠前”。这样可以避免审核中、需复审、已拒绝的内容被推荐出去。

### Q3：LOW_PRIORITY 为什么还能展示？

`LOW_PRIORITY` 表示内容可以公开，但不应被重点推荐。因此它仍然在公开集合中，但推荐公式会通过 riskPenalty 降低其排序。这种设计比直接删除更温和，也更符合内容治理中的分级处理。

### Q4：冷启动用户怎么办？

未登录或没有画像的用户没有 tagVector 和 authorAffinity，但仍然会根据 AI 内容质量、作者质量、互动统计和时间新鲜度排序。用户产生点击、停留、点赞等行为后，画像会逐步形成，推荐会越来越个性化。

### Q5：如何避免用户一直看到同一篇文章？

系统会在曝光时写入 `reco_user_seen`，推荐时计算：

```text
seenPenalty = min(2, seenCount * 0.55)
```

已看次数越多，排序越靠后，从而减少重复曝光。

### Q6：用户兴趣变化怎么体现？

画像计算使用最近 90 天、最多 500 条事件，并对旧事件加入指数衰减：

```text
ageFactor = exp(-ageDays / 30)
```

所以近期行为比很久以前的行为更重要。用户如果开始点击新的主题，新主题权重会逐渐上升。

### Q7：负反馈是否参与推荐？

参与。`HIDE` 权重为 -3，`REPORT` 权重为 -6；同时隐藏和举报还会降低文章日统计中的质量分。也就是说，负反馈会同时影响用户画像和文章整体质量。

### Q8：AI 评分在系统中有什么作用？

AI 评分主要有两类作用：第一，合法性分用于展示过滤和风险惩罚；第二，友好度、理性度、专业度、合法性一起组成内容质量分。AI 标签还用于和用户画像标签做匹配。

### Q9：这套推荐机制有什么不足？

当前实现偏工程可解释，优点是清晰、可控，但也有不足：排序仍是单阶段打分，没有复杂召回层；曝光事件是同步写入，压力较大时会影响延迟；画像刷新目前比较直接，后续可以改为异步任务或缓存机制。已有压力测试显示功能正确，但 p95 延迟仍有优化空间。

## 10. 答辩时可以强调的设计取舍

1. 先过滤再排序，保证内容安全和权限边界。
2. 用 AI 标签连接文章和用户画像，让推荐有可解释依据。
3. 同时考虑正反馈和负反馈，不只记录点赞，也记录隐藏和举报。
4. LOW_PRIORITY 采用降权而不是完全隐藏，体现分级治理。
5. 使用时间衰减和已看惩罚，避免兴趣固化和重复曝光。
6. 保留 request log 和 raw event，便于测试复现和问题追踪。
