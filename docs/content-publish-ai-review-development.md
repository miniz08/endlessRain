# 内容发布与静默 AI 治理闭环开发拆解文档

生成日期：2026-05-03

## 1. 产品边界

本阶段的关键修正是：AI 审查不是面向普通用户的显性功能，而是发布链路中的后台自动化过程。

普通用户感知到的是：

```text
发布内容
  -> 内容进入信息流
  -> 看到内容标签、专业度、友好度、理性度等社交画像信号
  -> 基于这些信号进行阅读、评论、reaction、关注
```

普通用户不应感知到的是：

```text
审查中
审查失败
风险等级
处理决策
模型建议
后台治理原因
```

管理员或审核角色可以查询完整 AI 分析结果，用于审计、复核和答辩演示。

## 2. 后台链路

```text
POST /api/articles
  -> api_gateway
  -> blog_service
  -> 写入 article / article_tag_on_article
  -> blog_service 使用内部 token 调用 ai_service
  -> ai_service 生成四维评分与标签
  -> 写入 article_ai_analysis / article_ai_tag_on_article
  -> 刷新 user.professionalism / user.friendliness
  -> 写入 audit_log
  -> 前端只收到正常文章数据
```

## 3. 数据表

| 表 | 用途 |
| --- | --- |
| `article` | 用户发布内容 |
| `article_tag` | 人工标签字典 |
| `article_tag_on_article` | 人工标签关联 |
| `article_ai_analysis` | 后台评分结果 |
| `article_ai_tag` | AI 标签字典 |
| `article_ai_tag_on_article` | AI 标签关联 |
| `user` | 用户综合专业度、友好度 |
| `audit_log` | 发布、分析、失败降级、复核查询记录 |

## 4. 服务边界

### 普通内容接口

`POST /api/articles` 对普通用户只表现为发布接口。响应中返回文章数据，不返回 AI 调用状态、风险决策或失败原因。

公开文章 DTO 仍可携带内容画像所需的结果：

```ts
{
  article: {
    id: number,
    content: string,
    tag: string,
    author: PublicUser,
    aiAnalysis: {
      professionalismScore: number,
      friendlinessScore: number,
      rationalityScore: number,
      legalityScore: number
    } | null,
    aiTags: Array<{ name: string; confidence: number | null; weight: number | null }>
  }
}
```

前端只展示其中适合社交互动的部分：内容标签、专业度、友好度、理性度。合法性评分用于后台治理与推荐降权，不在普通界面强调。

### 内部分析接口

`blog_service` 调用 `ai_service` 时带：

```text
x-internal-service-token
```

对应环境变量：

```env
AI_INTERNAL_TOKEN=replace-with-shared-internal-token
```

Docker Compose 已将该变量同时注入 `blog_service` 与 `ai_service`。

### 管理员查询接口

`/api/analysis/*` 现在只允许：

```text
admin
reviewer
internal service
```

普通用户不会通过该接口看到审查细节。

## 5. 前端改动

普通用户界面使用：

```text
mofukaze/components/ArticleComposer.vue
mofukaze/components/ContentProfilePanel.vue
mofukaze/components/ArticleCard.vue
```

界面文案已避免“AI 审查”“审查中”“风险”“模型建议”等治理语言。

发布器只显示：

```text
发布中
发布成功
内容画像
内容标签
专业度 / 友好度 / 理性度
```

## 6. 审计与降级

后台仍写入：

| action | 含义 |
| --- | --- |
| `ARTICLE_CREATE` | 文章创建成功 |
| `AI_ANALYSIS_ATTACHED` | AI 分析成功并挂接 |
| `AI_ANALYSIS_SKIPPED` | AI 分析被配置跳过 |
| `AI_ANALYSIS_FAILED` | AI 分析失败，文章仍保留 |

AI 失败不会阻断发布。失败原因只进入审计日志，不提示普通用户。

## 7. 当前结论

当前实现符合“AI 审查静默存在”的产品设定：普通用户能利用标签和内容画像进行互动，但不会感觉平台在显性地展示审查流程；管理员仍能查询完整分析结果并进行审计复核。

## 8. 验证记录

已执行：

```bash
cd blog_service
npm run build

cd ../ai_service
npm run build

cd ../mofukaze
npm run typecheck
npm run build
```

运行时验证：

```text
GET  http://127.0.0.1:3004/health                         -> 200
POST http://127.0.0.1:3000/api/analysis/text               -> 403，普通用户不可访问分析接口
POST http://127.0.0.1:3004/analysis/text + internal token  -> 200，内部服务可调用
GET  http://127.0.0.1:3000/api/feeds/recommended?limit=1   -> 200，信息流正常
GET  http://127.0.0.1:3000/                                -> 200，前端正常
```

源码检查：

```text
普通前端源码未发现“审查中、分析失败、风险等级、模型建议”等用户可见治理文案。
本阶段相关源码未发现 NUL 字节文件。
```
