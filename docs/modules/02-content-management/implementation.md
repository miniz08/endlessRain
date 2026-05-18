# 社交内容发布与管理模块实现文档

## 模块职责

本模块负责文章发布、查询、详情展示、删除、标签管理和发布前审核状态控制。它承载平台最核心的内容生产入口，同时也负责确保未审核或高风险内容不会直接进入公开信息流。

## 核心实现位置

| 类型 | 文件 |
| --- | --- |
| 路由定义 | `blog_service/src/api/article.ts` |
| 控制器 | `blog_service/src/controllers/articleController.ts` |
| 业务服务 | `blog_service/src/services/articleService.ts` |
| 内容清洗 | `blog_service/src/services/contentSanitizer.ts` |
| AI 调用 | `blog_service/src/services/articleService.ts` 中的 `requestAiAnalysis` |
| 前端组件 | `mofukaze/components/ArticleComposer.vue`、`mofukaze/components/ArticleCard.vue` |
| 数据模型 | `blog_service/prisma/schema.prisma`、`prisma/schema.prisma` |

## 数据表

| 表名 | 作用 |
| --- | --- |
| `article` | 保存文章正文、作者、主标签、发布时间、审核状态、审核原因和建议 |
| `article_tag` | 保存普通标签 |
| `article_tag_on_article` | 保存文章与普通标签的多对多关系 |
| `article_ai_analysis` | 保存 AI 四项评分 |
| `article_ai_tag` | 保存 AI 标签 |
| `article_ai_tag_on_article` | 保存文章与 AI 标签的关系、置信度和权重 |

## 核心代码讲解

文章发布入口是 `articleController.createArticleController`。控制器从 `req.auth` 读取作者 id，从请求体读取正文和标签，然后调用 `articleService.createArticle`。控制器本身不直接写数据库，而是负责参数整理、审计日志和 HTTP 返回结构。

`createArticle` 是发布流程的核心。它先通过 `sanitizeContent` 去除首尾空白并压缩连续空行，防止空内容或明显无效内容写入数据库。随后创建文章时把状态固定为 `PENDING_REVIEW`，并写入“等待 AI 审核”的默认反馈。这样即使后续 AI 调用较慢，文章也不会以公开状态提前出现在首页。

文章创建完成后，服务层会调用 `syncManualTags` 同步普通标签。该函数先对标签去重，再通过 `article_tag.upsert` 保证标签表中存在对应标签，最后写入 `article_tag_on_article`。主标签权重为 1，其余标签权重为 0.8，方便前端展示和后续排序使用。

发布前审核由 `requestAiAnalysis` 和 `applyReviewResult` 串起来。`requestAiAnalysis` 会根据 `AI_SERVICE_URL` 和内部 token 调用 AI 服务；如果 `AI_ANALYSIS_ON_CREATE=false` 或 AI 服务地址缺失，则返回跳过结果。`applyReviewResult` 根据 AI 返回的 decision 更新文章状态：`ALLOW` 对应 `PUBLISHED`，`LOW_PRIORITY` 对应低优先级公开，`REJECT` 对应拒绝，其余情况进入 `REVIEW_REQUIRED`。如果 AI 调用失败，文章会进入复核状态并保存失败原因。

查询逻辑由 `listArticles` 和 `getArticle` 完成。列表接口只展示 `PUBLISHED` 和 `LOW_PRIORITY` 内容，并额外过滤合法性分数过低的文章。详情接口会调用 `canViewArticle`：公开内容所有人可见，非公开内容只有作者本人或管理员可见。返回 DTO 时统一组装作者信息、AI 分析、AI 标签、普通标签、reaction 汇总和评论数。

删除逻辑由 `deleteArticle` 实现。它先检查操作者是否是作者本人或管理员，然后在事务中清理评论 reaction、评论、文章 reaction、AI 标签关系、普通标签关系、AI 分析记录，最后删除文章。这样可以避免删除后留下孤立数据。

## 文章状态

| 状态 | 含义 |
| --- | --- |
| `PENDING_REVIEW` | 内容已提交，等待 AI 审核 |
| `PUBLISHED` | 审核通过，正常公开 |
| `LOW_PRIORITY` | 可以公开，但推荐优先级降低 |
| `REVIEW_REQUIRED` | 需要复核，暂不公开 |
| `REJECTED` | 未通过审核，暂不公开 |

## 主要接口

| 接口 | 说明 |
| --- | --- |
| `GET /api/articles` | 查询文章列表 |
| `POST /api/articles` | 发布文章 |
| `GET /api/articles/tags` | 查询标签列表 |
| `GET /api/articles/:articleId` | 查询文章详情 |
| `DELETE /api/articles/:articleId` | 删除文章 |

## 测试关联

黑盒测试覆盖了游客访问文章列表、游客发文被拒绝、空正文校验、用户发文、文章详情、标签列表和越权删除。测试结果显示公开列表、详情和删除权限逻辑均能形成闭环；文章发布时使用 mock AI，可以保证审核状态可重复。

## 已实现能力

- 文章发布前进行内容清洗和基础校验。
- 新文章先进入 `PENDING_REVIEW` 状态。
- AI 分析完成后映射为公开、低优先级、复核或拒绝状态。
- 公开列表、关注流和推荐流只展示公开状态内容。
- 作者本人和管理员可查看非公开内容详情。
- 删除文章时清理评论、reaction、标签关系和 AI 分析关联。
