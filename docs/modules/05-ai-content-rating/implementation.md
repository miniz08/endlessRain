# 基于 AI 分析的内容评分功能实现文档

## 模块职责

本模块负责接入 AI 分析服务，对文章文本进行语义分析，生成内容评分、风险等级、处理决策和 AI 标签，并将分析结果持久化。它是内容发布前审核、用户评分和推荐排序的重要数据来源。

## 核心实现位置

| 类型 | 文件 |
| --- | --- |
| 服务入口 | `ai_service/src/index.ts` |
| 路由定义 | `ai_service/src/api/analysis.ts` |
| 控制器 | `ai_service/src/controllers/analysisController.ts` |
| 分析服务 | `ai_service/src/services/analysisService.ts` |
| 评分策略 | `ai_service/src/services/scorePolicy.ts` |
| 标签体系 | `ai_service/src/services/tagTaxonomy.ts`、`ai_service/src/services/tagMapping.ts` |
| Provider | `ai_service/src/providers/mockProvider.ts`、`ai_service/src/providers/openaiCompatibleProvider.ts` |
| 数据模型 | `ai_service/prisma/schema.prisma` |

## 数据表

| 表名 | 作用 |
| --- | --- |
| `article_ai_analysis` | 保存文章四维评分 |
| `article_ai_tag` | 保存 AI 标签名称 |
| `article_ai_tag_on_article` | 保存文章与 AI 标签的关系、置信度和权重 |
| `article` | 保存审核状态、风险等级、审核原因和建议 |
| `user` | 保存作者基础专业度和友好度评分 |

## 核心代码讲解

AI 服务的入口是 `analysisController`。文本分析接口会校验正文，然后调用 `analysisService.analyzeText`；文章分析接口会根据文章 id 读取正文，再调用 `analyzeAndPersistArticle`。接口权限由中间件控制：普通用户不能直接调用管理分析能力，内部服务调用则通过服务 token 放行。

`analyzeText` 并不直接绑定某一个大模型，而是通过 `createProvider` 创建 provider。`AI_PROVIDER=mock` 时使用 `mockProvider`，适合测试和演示；配置为 OpenAI-compatible 时会走外部模型接口。provider 返回的原始分数会经过 `normalizeScores` 规整到 0-100，再由 `riskLevelFromScores` 和 `decisionFromScores` 生成风险等级与处理决策。

为了保证平台安全，`analyzeText` 对 provider 失败做了保守降级。如果模型调用异常，服务不会让文章直接通过，而是返回 `fallbackResult`：友好度、理性度、合法性和专业度给出偏低分数，风险等级为 `HIGH`，决策为 `REVIEW`。这会使文章进入复核状态，避免 AI 不可用时未审核内容直接公开。

持久化逻辑集中在 `persistArticleAnalysis`。它先检查文章是否存在，然后对 `article_ai_analysis` 做 upsert，保存四项评分；再对 AI 标签去重，并用 `article_ai_tag.upsert` 保证标签存在；最后写入 `article_ai_tag_on_article`，保存标签置信度和权重。对于本次分析没有返回的旧标签，会通过 `deleteMany` 清理，避免文章标签长期残留。

AI 决策会同步写回 `article` 表。`statusFromDecision` 将 `ALLOW` 映射为 `PUBLISHED`，`LOW_PRIORITY` 映射为 `LOW_PRIORITY`，`REJECT` 映射为 `REJECTED`，其他情况映射为 `REVIEW_REQUIRED`。同时保存 `reviewDecision`、`riskLevel`、`reviewReason`、`reviewSuggestion` 和 `reviewedAt`，供文章详情和通知模块使用。

分析完成后，`refreshUserRating` 会重新计算作者基础评分。它聚合作者文章的 AI 专业度、友好度，并根据低优先级、复核和拒绝数量扣分，最后更新 `user.professionalism` 和 `user.friendliness`。因此 AI 分析结果不只影响单篇文章，也会影响作者后续内容的推荐质量信号。

## 评分维度

| 字段 | 含义 |
| --- | --- |
| `friendlinessScore` | 内容友好度 |
| `rationalityScore` | 表达理性程度 |
| `legalityScore` | 合法合规程度 |
| `professionalismScore` | 内容专业程度 |

## 决策结果

| AI 决策 | 文章状态 |
| --- | --- |
| `ALLOW` | `PUBLISHED` |
| `LOW_PRIORITY` | `LOW_PRIORITY` |
| `REVIEW` | `REVIEW_REQUIRED` |
| `REJECT` | `REJECTED` |

## 测试关联

测试环境使用 `AI_PROVIDER=mock`，这样相同文本会得到稳定的分析结果。黑盒测试验证了普通用户访问 AI 管理接口被拒绝、管理员可访问标签分类、文本分析可返回 decision、文章分析查询可返回持久化结果。发布文章流程也间接验证了 AI 决策到文章状态的映射。

## 已实现能力

- 支持 mock provider，便于测试环境稳定运行。
- 支持 OpenAI-compatible provider，便于接入外部大模型接口。
- AI 分析结果会写入评分表和标签关联表。
- AI 决策会同步更新文章审核状态。
- 分析完成后会刷新作者基础评分。
- AI 调用失败时返回保守复核结果，避免内容直接公开。
