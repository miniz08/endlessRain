# 基于云端数据库表结构的复原实施计划

本文档是后续代码实施阶段的数据模型基准。当前本地 `schema.prisma` 已损坏，不再作为依据；云端数据库中的现有表结构是权威来源。后续恢复代码时，应优先让服务逻辑贴合这些表，而不是重新发明一套新表名。

## 1. 总原则

1. 以云端数据库为准：表名、字段名、字段类型、默认值优先保持不变。
2. Prisma 通过 `prisma db pull` 反向生成：先恢复可运行 schema，再做命名整理。
3. 第一轮不做大规模改表：除非某个毕业设计目标完全无法实现，否则通过服务逻辑适配现有结构。
4. 先完成答辩闭环：认证、发文、AI 评分、标签、用户评分、关注时间线、推荐控制、审计日志。
5. 图片 AI 分析继续暂缓：图片只作为资源内容处理，不进入 AI 评分主线。

## 2. Prisma 重建路径

### 2.1 从云端库反向生成

每个需要访问数据库的服务先建立最小 `schema.prisma`：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

然后执行：

```bash
npx prisma db pull
npx prisma generate
```

注意事项：

- 不要对云端库执行 `prisma migrate reset`。
- 不要在未确认前直接对云端库执行 `prisma migrate dev`。
- 本地开发库可以用 `db push` 从 schema 建测试库。
- 如果 Prisma 生成了小写模型名，例如 `model user`，第一轮可以保留；后续再用 `model User` + `@@map("user")` 整理。

### 2.2 推荐 Prisma 命名策略

为了让 TypeScript 代码更自然，建议最终整理为：

| 数据库表 | Prisma 模型名 | 所属服务 |
| --- | --- | --- |
| `user` | `User` | `user_service` |
| `auth_refresh_token` | `AuthRefreshToken` | `user_service` |
| `article` | `Article` | `blog_service` |
| `article_ai_analysis` | `ArticleAiAnalysis` | `ai_service` 或 `blog_service` |
| `article_tag` | `ArticleTag` | `blog_service` |
| `article_tag_on_article` | `ArticleTagOnArticle` | `blog_service` |
| `article_ai_tag` | `ArticleAiTag` | `ai_service` |
| `article_ai_tag_on_article` | `ArticleAiTagOnArticle` | `ai_service` |
| `comment` | `Comment` | `blog_service` |
| `comment_reaction` | `CommentReaction` | `blog_service` |
| `article_reaction` | `ArticleReaction` | `blog_service` |
| `follow` | `Follow` | `blog_service` |
| `chat_thread` | `ChatThread` | `chat_service` |
| `chat_message` | `ChatMessage` | `chat_service` |
| `reco_user_profile` | `RecoUserProfile` | `blog_service` |
| `reco_event` | `RecoEvent` | `blog_service` |
| `reco_request_log` | `RecoRequestLog` | `blog_service` |
| `reco_user_seen` | `RecoUserSeen` | `blog_service` |
| `reco_article_daily_stat` | `RecoArticleDailyStat` | `blog_service` |
| `audit_log` | `AuditLog` | `api_gateway` |

## 3. 表结构实施映射

### 3.1 用户认证与权限

权威表：

- `user`
- `auth_refresh_token`

`user` 字段已经能支撑核心身份系统：

- `username`、`email`、`password` 用于注册登录。
- `avatar` 用于用户资料。
- `role` 用于基础权限控制，默认值是 `'user'`。
- `professionalism`、`friendliness` 用于用户综合行为评级。

`auth_refresh_token` 已经比较完整，可以恢复为更安全的双 token 认证：

- access token 短期有效，放在内存或 httpOnly cookie。
- refresh token 只保存 hash 到 `auth_refresh_token.tokenHash`。
- `csrfToken` 用于刷新接口防 CSRF。
- `revokedAt`、`replacedByTokenHash` 支持刷新令牌轮换和登出。

实施接口：

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /users/:id`
- `GET /users/:id/rating`

用户综合评级的第一轮实现：

```text
user.professionalism = 当前用户所有 article_ai_analysis.professionalismScore 的平均值
user.friendliness = 当前用户所有 article_ai_analysis.friendlinessScore 的平均值
```

如果要在页面展示综合等级，可运行时计算：

```text
combined = professionalism * 0.55 + friendliness * 0.45
A: >= 85
B: >= 70
C: >= 50
D: < 50
```

### 3.2 内容发布与 AI 分析

权威表：

- `article`
- `article_ai_analysis`
- `article_tag`
- `article_tag_on_article`
- `article_ai_tag`
- `article_ai_tag_on_article`

现有 `article` 表没有 `status` 字段，因此第一轮建议采用“不新增字段”的发布策略：

1. 用户提交内容。
2. `blog_service` 先调用 `ai_service` 获取评分与标签。
3. 若 `legalityScore` 低于拒绝阈值，直接拒绝写入 `article`，并写入 `audit_log`。
4. 若通过阈值，写入 `article`。
5. 写入 `article_ai_analysis`。
6. 写入 `article_ai_tag` 与 `article_ai_tag_on_article`。
7. 更新作者 `user.professionalism` 和 `user.friendliness`。

这条流程仍然符合“内容写入数据库前进入 AI 分析流程”的答辩目标。区别是：被拒绝内容不创建 `article` 记录，处理证据保存在审计日志中。

评分字段映射：

| 设计概念 | 当前字段 |
| --- | --- |
| 友好度 | `article_ai_analysis.friendlinessScore` |
| 理性度 | `article_ai_analysis.rationalityScore` |
| 合法合规度 | `article_ai_analysis.legalityScore` |
| 专业度 | `article_ai_analysis.professionalismScore` |
| 风险分 | `100 - legalityScore` |
| 风险等级 | 由 `legalityScore` 阈值运行时计算 |

建议阈值：

| `legalityScore` | 运行时风险等级 | 发布决策 | 展示策略 |
| --- | --- | --- | --- |
| `80-100` | `LOW` | 写入 `article` | 正常展示 |
| `60-79` | `MEDIUM` | 写入 `article` | 降低推荐权重 |
| `40-59` | `HIGH` | 第一轮可拒绝或仅管理员可见 | 不进公开推荐 |
| `0-39` | `BLOCK` | 拒绝写入 `article` | 只写审计 |

如果后续允许小规模改表，可给 `article` 增加 `status` 字段，用于更完整地表达 `pending/rejected/approved`。但第一轮不依赖该字段。

### 3.3 标签系统

权威表：

- 人工标签：`article_tag`、`article_tag_on_article`
- AI 标签：`article_ai_tag`、`article_ai_tag_on_article`

实施策略：

1. `article.tag` 保留为旧版单标签或主标签字段。
2. 人工标签由前端发布页或管理员维护，写入 `article_tag_on_article`。
3. AI 标签由 `ai_service` 根据大模型输出生成，写入 `article_ai_tag_on_article`。
4. `confidence` 表示模型置信度。
5. `weight` 表示推荐系统使用的标签权重。

AI 输出标签建议格式：

```json
{
  "tags": [
    { "name": "人工智能", "confidence": 0.92, "weight": 1.0 },
    { "name": "学习经验", "confidence": 0.81, "weight": 0.7 }
  ]
}
```

为了支撑“大型标签分类库”，第一轮可以在 `ai_service` 中保留一个本地标签分类常量库，模型输出后再映射到库内标签；数据库只保存最终命中的 `name/confidence/weight`。

### 3.4 评论、互动与关注

权威表：

- `comment`
- `comment_reaction`
- `article_reaction`
- `follow`

实施接口：

- `POST /articles/:id/comments`
- `GET /articles/:id/comments`
- `POST /comments/:id/reactions`
- `DELETE /comments/:id/reactions/:emoji`
- `POST /articles/:id/reactions`
- `DELETE /articles/:id/reactions/:emoji`
- `POST /users/:id/follow`
- `DELETE /users/:id/follow`
- `GET /timeline/following`

注意点：

- `comment.status` 已经存在，评论可以保留 `approved/pending/rejected` 等状态值。
- `comment.parentId` 与 `replyToUserId` 支持楼中楼回复。
- `follow.status` 是枚举：`ACTIVE | BLOCKED | REMOVED`。取消关注不要物理删除，更新为 `REMOVED` 即可。

### 3.5 聊天与通知反馈

权威表：

- `chat_thread`
- `chat_message`

当前没有独立 `notification` 表。第一轮建议让聊天系统兼任系统通知：

1. 为每个用户创建一个“系统通知线程”，例如 `userAId = 0` 或使用一个系统用户 ID。
2. 内容发布通过、拒绝、降权展示等结果写入 `chat_message`。
3. 前端通知中心读取该系统线程。

如果不想引入系统用户，也可以第一轮只通过发布接口返回处理结果；但为了满足“消息通知与处理结果反馈功能”，推荐使用 `chat_message` 落库。

### 3.6 推荐系统

权威表：

- `reco_user_profile`
- `reco_event`
- `reco_request_log`
- `reco_user_seen`
- `reco_article_daily_stat`

第一轮推荐策略不用复杂模型，重点体现“评级机制影响展示”：

1. 候选内容来自 `article`。
2. 查询 `article_ai_analysis`，过滤或降权低 `legalityScore` 内容。
3. 读取作者 `user.professionalism`、`user.friendliness`，作为作者质量因子。
4. 读取 `article_ai_tag_on_article`，与 `reco_user_profile.tagVector` 做简化匹配。
5. 生成结果后写入 `reco_request_log`。
6. 用户曝光、点击、点赞、评论等行为写入 `reco_event`。
7. 更新 `reco_user_seen`，避免同一用户反复看到同一内容。

推荐分数示例：

```text
score =
  tagMatchScore * 0.35
  + authorQualityScore * 0.25
  + articleQualityScore * 0.20
  + freshnessScore * 0.10
  - riskPenalty * 0.10
```

其中：

```text
authorQualityScore = user.professionalism * 0.55 + user.friendliness * 0.45
riskPenalty = max(0, 80 - legalityScore)
```

答辩时可以强调：推荐系统不是追求工业级复杂度，而是证明“AI 内容评级 -> 用户画像/内容质量 -> 展示控制”的链路成立。

### 3.7 审计日志

权威表：

- `audit_log`

该表已经很适合网关统一审计：

- `requestId` 串联一次请求。
- `userId/username/role` 记录操作人。
- `ipAddress/method/route` 记录访问来源和接口。
- `action/result/statusCode/detail` 记录业务动作和结果。

必须审计的动作：

- 注册、登录、刷新 token、退出。
- 发布文章、AI 分析、拒绝发布。
- 评论、点赞、关注。
- 推荐请求与推荐结果。
- 管理员或审核员操作。

示例 `action`：

- `AUTH_LOGIN`
- `AUTH_REFRESH`
- `ARTICLE_CREATE`
- `AI_ANALYZE_ARTICLE`
- `ARTICLE_REJECT_BY_AI`
- `RECO_HOME_FEED`
- `FOLLOW_CREATE`

## 4. 服务实施顺序

### 阶段 A：数据模型恢复

目标：让 Prisma 客户端先能基于云端结构生成。

任务：

1. 为 `user_service`、`blog_service`、`ai_service`、`chat_service` 建立最小 Prisma 配置。
2. 使用云端 `DATABASE_URL` 执行 `prisma db pull`。
3. 生成 Prisma Client。
4. 将反向生成的 schema 保存为基线文件。
5. 补充模型关系时只改 Prisma 映射，不改云端表结构。

验收：

- `npx prisma generate` 成功。
- 能查询 `user`、`article`、`article_ai_analysis`。

### 阶段 B：用户认证

目标：恢复登录态，让后续接口都有用户身份。

优先实现：

1. 密码哈希校验。
2. access token + refresh token。
3. `auth_refresh_token` 轮换、撤销、过期。
4. 网关解析身份并传给下游服务。
5. 审计登录与失败登录。

### 阶段 C：AI 分析服务

目标：稳定输出四个维度评分和 AI 标签。

优先实现：

1. `mockProvider`：无密钥可运行。
2. `openaiCompatibleProvider`：真实大模型接口。
3. 统一 JSON 输出：

```json
{
  "friendlinessScore": 85,
  "rationalityScore": 78,
  "legalityScore": 92,
  "professionalismScore": 74,
  "tags": [
    { "name": "技术讨论", "confidence": 0.9, "weight": 1 }
  ],
  "reason": "内容表达理性，未发现明显违规风险。"
}
```

### 阶段 D：文章发布闭环

目标：恢复最核心演示链路。

流程：

1. 前端提交内容和人工标签。
2. `blog_service` 请求 `ai_service` 分析。
3. 低风险内容写入 `article`。
4. 写入 `article_ai_analysis`。
5. 写入 AI 标签关联表。
6. 更新 `user.professionalism/friendliness`。
7. 写入 `audit_log`。
8. 通过 `chat_message` 或接口响应反馈结果。

### 阶段 E：时间线与推荐展示

目标：让 AI 评分真正影响内容展示。

接口：

- `GET /articles`
- `GET /timeline/following`
- `GET /recommendations/home`

展示控制：

- 默认列表过滤 `legalityScore < 40` 的内容。
- 推荐流降低 `legalityScore < 80` 的排序。
- 作者专业度和友好度越高，推荐权重越高。
- 每次推荐写 `reco_request_log`。

### 阶段 F：前端答辩页

目标：用最少页面跑完整个故事。

页面：

1. 登录/注册。
2. 首页推荐流。
3. 关注时间线。
4. 发布文章。
5. 文章详情，展示 AI 四维评分与标签。
6. 用户主页，展示 `professionalism/friendliness` 和综合等级。
7. 系统通知或聊天消息页。
8. 简单审计日志页，管理员可见。

## 5. 需要特别注意的结构缺口

### 5.1 `article` 没有状态字段

这会影响“待审核/拒绝后保留记录”的表达。第一轮不改表时，用以下方式处理：

- 拒绝内容不写 `article`。
- 拒绝原因写 `audit_log.detail`。
- 前端通过接口响应或系统消息反馈用户。

如果后续要增强，可添加：

```sql
ALTER TABLE article
ADD COLUMN status varchar(191) NOT NULL DEFAULT 'approved';
```

### 5.2 没有独立通知表

第一轮用 `chat_message` 兼任系统反馈。后续如需增强，可新增 `notification` 表。

### 5.3 `user` 的综合评级字段较少

当前只有 `professionalism` 和 `friendliness`。第一轮用这两个字段承载用户行为评级；理性度、合规度可从 `article_ai_analysis` 实时统计。

## 6. 当前最优下一步

1. 在文档中保留这份云端表结构实施计划，作为后续所有代码恢复依据。
2. 连接云端数据库，执行 `prisma db pull`，把损坏的 Prisma schema 重新生成出来。
3. 先恢复 `user_service` 和 `ai_service`，因为它们是发布闭环的前置依赖。
4. 再恢复 `blog_service` 的文章发布接口，把 `article -> article_ai_analysis -> article_ai_tag_on_article -> user 评分更新 -> audit_log` 串起来。
5. 最后恢复前端演示路径。
