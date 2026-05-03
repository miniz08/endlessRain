# ai_service 开发与拆解文档

生成日期：2026-05-03

## 1. 服务定位

`ai_service` 是当前项目中“AI 内容评级功能”的核心服务。它负责对社交平台文本内容进行语义分析，生成四个维度评分、风险等级、发布建议和 AI 标签，并把分析结果写回共享 MySQL 数据库。

本轮恢复阶段暂不处理图片审核。图片字段与图片上传可以在内容服务恢复后作为普通媒体资源处理，答辩重点放在文本内容评级、标签生成、用户综合评级和后续展示控制的逻辑闭环上。

## 2. 当前完成范围

已恢复内容：

1. AI 服务 TypeScript/Express 基础结构。
2. Prisma Client 与共享数据库连接。
3. 50 个大类、300 个小标签的中文标签库。
4. 免费离线可演示的 `mock` 规则模型。
5. 面向 SiliconFlow、DeepSeek 等平台的 OpenAI Compatible 真实模型接入层。
6. JSON 格式分析结果解析、标签归一化和兜底策略。
7. 文章分析结果持久化。
8. 用户综合评分回写。
9. 审计日志写入。

## 3. 表结构归属

虽然项目名义上是微服务结构，但当前仍使用同一个 MySQL 数据库。AI 服务在逻辑上拥有以下表的写入职责：

| 表名 | 使用方式 | 说明 |
| --- | --- | --- |
| `article` | 读 | 读取文章正文与作者 ID，作为分析输入。 |
| `article_ai_analysis` | 写 | 每篇文章一条 AI 分析记录，保存四维评分。 |
| `article_ai_tag` | 写 | AI 小标签字典，按标签名 upsert。 |
| `article_ai_tag_on_article` | 写 | 文章与 AI 标签关联，保存置信度和权重。 |
| `user` | 写 | 根据历史文章分析结果刷新用户综合专业度与友好度。 |
| `audit_log` | 写 | 记录文本分析、文章分析、异常请求等审计信息。 |

AI 服务不直接维护 `article_tag` 与 `article_tag_on_article`，这两张表保留给人工标签或内容服务的人工分类能力。

## 4. 标签库设计

标签库代码位于：

- `ai_service/src/services/tagTaxonomy.ts`

设计规模：

- 50 个一级大类。
- 每个大类 6 个小标签。
- 总计 300 个小标签。

标签库以 TypeScript 常量维护，并通过接口输出为 JSON。这样做的原因是当前项目处于恢复阶段，不额外增加标签管理后台，也不引入迁移风险。后续如果需要运营侧编辑标签，可以把该常量迁移到数据库或独立配置文件。

标签结果格式：

```json
{
  "name": "人工智能",
  "category": "科技数码",
  "confidence": 0.86,
  "weight": 0.78
}
```

## 5. 评分与决策

当前四个评分维度均为 `0-100` 整数：

| 字段 | 含义 |
| --- | --- |
| `friendlinessScore` | 友好度，衡量表达是否礼貌、克制、尊重他人。 |
| `rationalityScore` | 理性度，衡量论证是否清晰、有依据、少情绪化。 |
| `legalityScore` | 合规度，衡量是否存在违法、诈骗、攻击辱骂、垃圾推广等风险。 |
| `professionalismScore` | 专业度，衡量内容的信息密度、方法意识和专业表达。 |

当前风险等级与发布建议主要由合规度驱动：

| 合规度 | 风险等级 | 决策 |
| --- | --- | --- |
| `>= 80` | `LOW` | `ALLOW` |
| `60-79` | `MEDIUM` | `LOW_PRIORITY` |
| `40-59` | `HIGH` | `REVIEW` |
| `< 40` | `BLOCK` | `REJECT` |

评分策略代码位于：

- `ai_service/src/services/scorePolicy.ts`

## 6. 模型接入策略

默认策略是 `AI_PROVIDER=mock`。这个模式不需要 API Key、不产生费用、不会受网络影响，适合答辩演示和本地开发。它基于关键词和文本特征生成稳定的模拟评分，但保留与真实模型相同的返回结构。

真实模型接入使用 `openai-compatible` provider，配置项如下：

```env
AI_PROVIDER=siliconflow
AI_BASE_URL=https://api.siliconflow.cn/v1
AI_CHAT_PATH=/chat/completions
AI_API_KEY=replace-with-your-api-key
AI_MODEL=Qwen/QwQ-32B
```

也可以切换为 DeepSeek：

```env
AI_PROVIDER=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_CHAT_PATH=/chat/completions
AI_API_KEY=replace-with-your-api-key
AI_MODEL=deepseek-v4-pro
```

说明：

1. “免费模型”在工程上以 `mock` 模式兜底，保证项目不依赖付费调用即可演示。
2. SiliconFlow 和 DeepSeek 都需要 API Key，是否有免费额度以平台当期政策为准。
3. 当前实现使用 OpenAI Compatible 的 Chat Completions 形态，并要求模型输出 JSON object。
4. 真实模型返回异常时会进入保守兜底结果，决策为 `REVIEW`，避免错误放行。

参考文档：

- DeepSeek API 兼容 OpenAI 格式，base URL 为 `https://api.deepseek.com`：https://api-docs.deepseek.com/
- DeepSeek JSON Output 使用 `response_format: { "type": "json_object" }`：https://api-docs.deepseek.com/guides/json_mode/
- SiliconFlow Chat Completions 接口，包含 `https://api.siliconflow.cn/v1/chat/completions` 示例： https://siliconflow.readme.io/reference/chat-completions-1

## 7. 接口设计

### `GET /health`

健康检查，返回服务状态、当前 provider 和标签库规模。

### `GET /analysis/taxonomy`

返回完整标签库：

```json
{
  "count": {
    "categories": 50,
    "tags": 300
  },
  "categories": []
}
```

### `POST /analysis/text`

直接分析文本，不要求文章已经入库。

请求体：

```json
{
  "content": "今天分享一个关于人工智能学习方法的理性讨论，谢谢大家补充建议。",
  "articleId": 12,
  "persist": false
}
```

当 `persist=true` 且传入 `articleId` 时，会把分析结果写入对应文章。通常内容服务后续可以在文章创建后调用该接口。

### `POST /analysis/articles/:articleId`

读取数据库中的文章正文，执行 AI 分析并持久化结果。

### `GET /analysis/articles/:articleId`

查询指定文章的 AI 分析结果和关联标签。

## 8. 持久化流程

文章分析的持久化顺序如下：

1. 根据 `articleId` 读取 `article.content` 和 `article.authorId`。
2. 调用当前 provider 生成结构化结果。
3. upsert `article_ai_analysis`。
4. upsert `article_ai_tag`。
5. upsert `article_ai_tag_on_article`。
6. 根据该作者所有已分析文章，重新计算 `user.professionalism` 与 `user.friendliness`。
7. 写入 `audit_log`。

当前 `article` 表没有状态字段，因此“通过、降权、复核、拒绝”暂时以 AI 分析结果表达。内容服务恢复时可以选择两种方案：

1. 保持现有表结构，通过查询 `article_ai_analysis` 控制展示。
2. 在后续迁移中给 `article` 增加 `status` 与 `riskLevel` 字段。

为了降低恢复风险，当前阶段采用第一种方案。

## 9. 代码结构

```text
ai_service/
  src/index.ts
  src/api/analysis.ts
  src/controllers/analysisController.ts
  src/providers/types.ts
  src/providers/mockProvider.ts
  src/providers/openaiCompatibleProvider.ts
  src/providers/index.ts
  src/services/analysisService.ts
  src/services/auditService.ts
  src/services/scorePolicy.ts
  src/services/tagMapping.ts
  src/services/tagTaxonomy.ts
  src/utils/validation.ts
  middlewares/auth.ts
  lib/prisma.ts
  prisma/schema.prisma
```

## 10. 验证记录

已执行验证：

```bash
npx prisma generate
npm run build
```

运行时验证：

1. 使用 `AI_PROVIDER=mock` 启动服务。
2. `GET /health` 返回 `status=ok`，并确认标签库为 `50/300`。
3. `POST /analysis/text` 返回四维评分、风险等级、决策和标签。

## 11. 后续衔接

下一阶段建议恢复 `blog_service` 内容发布模块，并在发布流程中调用 AI 服务：

1. 用户提交文本内容。
2. 内容服务创建文章。
3. 内容服务调用 `POST /analysis/articles/:articleId`。
4. 根据 `decision` 控制首页、关注流和推荐流的展示优先级。
5. 前端在文章详情或管理员页面展示评分与标签。

这样可以把毕业设计中的“AI 内容审查、内容评级、用户综合行为评级、展示控制”串成完整闭环。
