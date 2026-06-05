# AI 模块与聊天功能实现过程答辩说明

本文补充说明两个容易被问到的具体实现点：

1. AI 模块到底如何调用、用了什么方法和包、运行机制是什么。
2. 聊天功能到底如何实现、REST 和 WebSocket 如何配合、用了什么包和原理。

## 1. AI 模块调用与运行机制

### 1.1 一句话答辩口径

AI 模块采用独立 `ai_service`，博客服务在文章创建后通过 HTTP 内部接口调用它；AI 服务内部用 Provider 模式屏蔽 Mock Provider 和真实大模型 Provider 的差异，再把返回结果规范化为四项评分、风险等级、审核决策和标签，最后写入数据库，供文章状态、推荐和用户评分使用。

### 1.2 涉及的服务和代码位置

| 部分 | 位置 |
| --- | --- |
| 文章发布入口 | `blog_service/src/controllers/articleController.ts` |
| AI 调用发起 | `blog_service/src/services/articleService.ts` 的 `requestAiAnalysis` |
| AI 服务入口 | `ai_service/src/index.ts` |
| AI 路由 | `ai_service/src/api/analysis.ts` |
| AI 控制器 | `ai_service/src/controllers/analysisController.ts` |
| AI 分析逻辑 | `ai_service/src/services/analysisService.ts` |
| Provider 选择 | `ai_service/src/providers/index.ts` |
| Mock Provider | `ai_service/src/providers/mockProvider.ts` |
| 真实模型 Provider | `ai_service/src/providers/openaiCompatibleProvider.ts` |

### 1.3 用到的主要包

| 包或能力 | 作用 |
| --- | --- |
| `express` | 提供 AI 服务 HTTP 接口 |
| `cors` | 处理跨域访问配置 |
| `dotenv` | 读取环境变量，如模型地址、key、provider 类型 |
| `jsonwebtoken` | 校验管理员 access token |
| `@prisma/client` | 读写文章、AI 分析结果和标签表 |
| Node 原生 `fetch` | 调用外部 OpenAI-compatible 大模型接口 |
| `AbortController` | 给 AI 调用设置超时 |
| Provider 模式 | 把 Mock 和真实模型调用封装成统一接口 |

这里没有使用某个大模型专属 SDK，而是通过 OpenAI-compatible HTTP 接口调用，这样后续换模型供应商时改配置即可。

### 1.4 文章发布后如何触发 AI

流程如下：

```text
1. 用户提交文章
2. 前端请求 API 网关 `/api/articles`
3. 网关转发到 `blog_service`
4. `blog_service` 校验登录身份和文章内容
5. 文章先写入 `article` 表，状态为 `PENDING_REVIEW`
6. `blog_service` 调用 `requestAiAnalysis`
7. `requestAiAnalysis` 使用 fetch 请求 `AI_SERVICE_URL/analysis/articles/:articleId`
8. 请求头携带 `x-internal-service-token`
9. AI 服务确认是内部服务调用后开始分析
```

答辩重点：

文章不是先公开再分析，而是先进入待审核状态。AI 调用失败时也不会让未审核内容直接进入公开流。

### 1.5 内部服务调用如何鉴权

AI 服务的分析接口不是普通用户随便能调用的。它使用 `requireAdminOrInternal`：

```text
管理员 access token
或
x-internal-service-token
```

博客服务调用 AI 服务时会带：

```text
x-internal-service-token: AI_INTERNAL_TOKEN
x-request-id: 当前请求 ID
```

这样可以区分“用户请求”和“服务内部调用”，避免普通用户直接调用审核接口。

### 1.6 Provider 模式是什么

AI 服务没有把代码写死为某一个模型，而是抽象了统一接口：

```text
provider.analyze(input) -> AnalysisResult
```

不同 Provider 的区别：

| Provider | 实现方式 | 用途 |
| --- | --- | --- |
| Mock Provider | 本地关键词规则 | 测试和答辩演示稳定 |
| OpenAI-compatible Provider | HTTP 调用外部大模型 | 真实语义分析 |
| fallback | provider 异常时返回保守结果 | 防止未审核内容直接公开 |

答辩可以说：

这是典型的策略模式/Provider 模式，把“怎么调用模型”和“系统怎么处理分析结果”解耦。

### 1.7 真实大模型调用过程

真实 Provider 的主要过程：

```text
1. 从环境变量读取 AI_BASE_URL、AI_CHAT_PATH、AI_API_KEY、AI_MODEL
2. 构造 system prompt 和 user prompt
3. user prompt 中包含文章内容、标签体系和输出 schema
4. 使用 fetch 请求 `/chat/completions`
5. 设置 temperature = 0.2，降低随机性
6. 设置 response_format = json_object，要求返回 JSON
7. 解析模型返回的 JSON
8. 规范化评分、风险等级、标签和建议
```

真实请求本质是普通 HTTP POST，不是直接在本地运行模型。系统只负责调用和处理结果。

### 1.7.1 Prompt 是如何构造的

真实 Provider 发送给外部大模型的不是随意拼接的一段自然语言，而是 OpenAI Chat Completions 风格的 `messages` 数组，包含两条消息：

```text
messages = [
  system message,
  user message
]
```

#### system message

system message 用来规定模型身份和硬约束：

```text
你是社交平台内容质量与安全评级器。
你必须只输出 JSON 对象，不要输出 Markdown。
评分均为 0-100 的整数，100 表示最好或风险最低。
tags 必须从给定标签库中选择。
```

它的语义重点有四个：

| 约束 | 作用 |
| --- | --- |
| 社交平台内容质量与安全评级器 | 限定任务场景，不是普通聊天 |
| 只输出 JSON | 方便服务端解析和落库 |
| 评分 0-100 | 统一四项评分范围 |
| 标签必须来自标签库 | 避免模型自由创造无法匹配的标签 |

#### user message

user message 不是普通长文本，而是一个 JSON 字符串，里面包含任务说明、输出 schema、标签库和文章内容：

```json
{
  "task": "分析社交平台文本内容，返回四维评分、标签、理由和建议。",
  "schema": {
    "friendlinessScore": "0-100 integer",
    "rationalityScore": "0-100 integer",
    "legalityScore": "0-100 integer",
    "professionalismScore": "0-100 integer",
    "tags": [
      {
        "name": "标签库中的小标签名",
        "confidence": "0-1 number",
        "weight": "0-1 number"
      }
    ],
    "reason": "简短中文理由",
    "suggestion": "简短中文建议"
  },
  "taxonomy": "...压缩后的标签库...",
  "content": "用户文章正文"
}
```

也就是说，模型实际被要求做的是一个“文本分类 + 四维打分 + 标签选择 + 简短解释”的结构化任务。

### 1.7.2 标签库是如何放进 Prompt 的

系统的完整标签库定义在 `tagTaxonomy.ts`，当前是 50 个一级分类，每类 6 个小标签，总计约 300 个标签。直接把所有说明、code、description 都发给模型会比较冗长，所以系统使用 `compactTaxonomyForPrompt()` 做了压缩。

压缩后的结构只保留：

```json
[
  {
    "category": "社会民生",
    "tags": ["公共服务", "城市治理", "社区生活", "社会观察", "民生保障", "公共安全"]
  },
  {
    "category": "科技数码",
    "tags": ["人工智能", "软件开发", "数码产品", "网络安全", "云计算", "开源社区"]
  },
  {
    "category": "内容风险",
    "tags": ["攻击辱骂", "歧视偏见", "低俗色情", "违法犯罪", "虚假信息", "垃圾广告"]
  }
]
```

真实发送时不是只有这三类，而是所有分类都会以这种简洁格式放入 `taxonomy`。分类描述和内部 code 不进入 prompt，减少 token 占用。

答辩时可以这样解释：

标签库虽然看起来庞大，但它在 prompt 中是结构化数组：一级分类帮助模型理解范围，小标签是模型最终必须选择的候选项。模型不能随便生成新标签，服务端后续还会用 `normalizeTags` 再校验一次。

### 1.7.3 模型返回后为什么还要二次规范化

即使 prompt 里要求模型从标签库选择，服务端仍然不完全信任模型输出。后处理会做：

```text
1. parseJsonObject 解析 JSON
2. normalizeScores 把四项评分限制到 0-100
3. normalizeTags 校验标签是否在标签库中
4. 最多保留 8 个标签
5. confidence 和 weight 限制到 0-1
6. 如果没有可用标签，使用兜底标签
```

如果模型返回了近似标签名，系统还会尝试模糊匹配；如果完全匹配不上，则不会保存该标签。

这就是本系统对大模型结果的基本安全边界：模型负责语义判断，系统负责结构、范围和落库规则。

### 1.8 Mock Provider 的原理

Mock Provider 不调用外部模型，而是本地规则：

```text
1. 统计辱骂、违法、垃圾推广等风险词
2. 统计专业词、友好词
3. 按规则计算友善度、理性度、合法性、专业性
4. 根据合法性分生成风险等级和审核决策
5. 根据关键词映射标签
```

它的价值不是语义能力强，而是结果稳定、可重复，适合测试和答辩时保证流程不受外部网络影响。

### 1.9 结构化结果如何落库

AI 返回结果后，`analysisService.persistArticleAnalysis` 会做几件事：

```text
1. 对 `article_ai_analysis` 做 upsert
2. 保存四项评分
3. 对 AI 标签去重
4. 写入 `article_ai_tag`
5. 写入 `article_ai_tag_on_article`，保存置信度和权重
6. 清理本次未返回的旧标签关系
7. 更新 `article.status`
8. 更新 `reviewDecision`、`riskLevel`、`reviewReason`、`reviewSuggestion`、`reviewedAt`
9. 刷新作者 `professionalism` 和 `friendliness`
```

这里用 upsert 的原因是：同一篇文章可能重复分析，系统要更新当前分析结果，而不是无限插入重复记录。

### 1.10 AI 决策和文章状态

| AI 决策 | 文章状态 | 含义 |
| --- | --- | --- |
| `ALLOW` | `PUBLISHED` | 正常公开 |
| `LOW_PRIORITY` | `LOW_PRIORITY` | 可以公开，但推荐降权 |
| `REVIEW` | `REVIEW_REQUIRED` | 暂不公开，等待复核 |
| `REJECT` | `REJECTED` | 拒绝公开 |

风险等级主要由合法性分决定：

```text
>= 80  LOW
>= 60  MEDIUM
>= 40  HIGH
< 40   BLOCK
```

### 1.11 AI 失败时如何处理

有三层保护：

```text
1. blog_service 调 AI 服务时有 AbortController 超时
2. OpenAI-compatible Provider 内部有 timeout 和 retry
3. AI 服务 provider 失败后返回 fallbackResult
```

fallback 的结果是：

```text
风险等级 HIGH
决策 REVIEW
文章进入 REVIEW_REQUIRED
```

答辩口径：

系统采用保守降级策略。模型不可用时，内容不会直接公开，而是进入复核，保证内容安全优先。

### 1.12 AI 模块答辩高频问答

#### Q1：AI 服务是怎么调用的？

博客服务在文章创建后通过 HTTP 调用 AI 服务的 `/analysis/articles/:articleId`，请求头带内部服务 token。AI 服务再通过 Provider 调用 Mock 或真实大模型。

#### Q2：为什么要用 Provider？

Provider 把模型调用封装成统一接口。测试时用 Mock，真实环境用 OpenAI-compatible Provider，系统后续更换模型时不需要改业务流程。

#### Q3：怎么保证 AI 返回结果能被系统使用？

prompt 要求 JSON，真实接口使用 JSON output，服务端还会解析、校验、规范化分数和标签。最终只保存结构化字段，不直接依赖一段自然语言。

#### Q4：AI 是否自己训练模型？

没有。系统重点是接入和使用大模型能力，不涉及模型训练。Mock 是本地规则，真实 Provider 调用外部模型接口。

#### Q5：AI 结果和推荐有什么关系？

AI 标签用于和用户画像做标签匹配，四项评分参与内容质量分，合法性分参与展示过滤和风险惩罚。

## 2. 聊天功能实现过程

### 2.1 一句话答辩口径

聊天模块采用“REST 接口持久化 + WebSocket 实时推送”的方式实现。REST 负责创建聊天线程、读取历史消息和发送消息；WebSocket 负责在线用户之间的实时消息推送。消息会先写入数据库，再广播给聊天双方在线连接。

### 2.2 涉及的服务和代码位置

| 部分 | 位置 |
| --- | --- |
| 聊天服务入口 | `chat_service/src/index.ts` |
| 聊天控制器 | `chat_service/src/controllers/chatController.ts` |
| 聊天业务逻辑 | `chat_service/src/services/chatService.ts` |
| WebSocket 服务 | `chat_service/src/ws/server.ts` |
| 聊天鉴权 | `chat_service/src/middlewares/auth.ts` |
| 网关代理 | `api_gateway/src/proxy/proxyHandler.ts` |
| 网关路由配置 | `api_gateway/src/config/routes.ts` |

### 2.3 用到的主要包

| 包或能力 | 作用 |
| --- | --- |
| `express` | 提供 REST 接口 |
| Node 原生 `http.createServer` | 创建可挂载 WebSocket upgrade 的 HTTP server |
| `ws` | 实现 WebSocket 服务端 |
| `jsonwebtoken` | 校验 access token |
| `@prisma/client` | 读写聊天线程和消息 |
| `cors` | 跨域配置 |
| `dotenv` | 读取端口、JWT secret 等配置 |
| `http-proxy-middleware` | API 网关代理 HTTP 请求和 WebSocket upgrade |

### 2.4 为什么同时用 REST 和 WebSocket

两者职责不同：

| 技术 | 职责 |
| --- | --- |
| REST | 创建线程、查询线程列表、查询历史消息、普通发送消息 |
| WebSocket | 用户在线时实时推送新消息 |

答辩时可以说：

REST 适合“请求一次返回一次”的历史数据查询，WebSocket 适合“服务端主动推送”的实时聊天。

### 2.5 WebSocket 的基本原理

WebSocket 不是普通 HTTP 轮询。它先通过 HTTP 发起 Upgrade 请求：

```text
HTTP 请求
Upgrade: websocket
```

服务端同意后，连接升级为 WebSocket 长连接。之后客户端和服务端可以在同一条 TCP 连接上双向发送消息。

本系统用 `ws` 包实现这个过程，并使用 `WebSocketServer({ noServer: true })`，让它挂载到已有 HTTP server 的 upgrade 事件上。

### 2.6 网关如何转发 WebSocket

前端连接的是：

```text
ws://网关地址/api/chat/ws
```

网关配置中只有 chat 路由开启：

```text
supportsWebSocket: true
```

网关收到 upgrade 请求后：

```text
1. 判断路径是否匹配 `/api/chat`
2. 把路径从 `/api/chat/ws` 改写为 `/chat/ws`
3. 使用 `http-proxy-middleware` 转发到 `chat_service`
4. 同时透传 `x-request-id` 和 `x-gateway-route`
```

答辩重点：

WebSocket 不是前端直连聊天服务，而是仍然通过 API 网关统一入口，符合系统整体架构。

### 2.7 聊天鉴权如何做

WebSocket 连接建立前，聊天服务会从以下位置提取 access token：

```text
1. query 参数 token
2. Authorization: Bearer
3. Cookie 中的 ls_access_token
```

然后用 `jsonwebtoken` 校验 JWT，再查数据库确认用户存在。认证失败则拒绝 WebSocket upgrade。

REST 聊天接口也使用同样的 access token 校验，未登录用户不能访问聊天线程和消息。

### 2.8 聊天线程如何创建

创建线程接口：

```text
POST /api/chat/threads
```

核心逻辑：

```text
1. 当前用户传入 peerId
2. 禁止和自己创建聊天线程
3. 检查对方用户是否存在
4. 将两个用户 ID 排序为 userAId、userBId
5. 使用复合唯一键 upsert
6. 保证同一对用户只有一个聊天线程
```

为什么要排序？

如果不排序，A-B 和 B-A 可能生成两条线程。排序后无论谁发起，都会映射到同一组 `userAId`、`userBId`。

### 2.9 消息如何发送和保存

REST 发送消息：

```text
POST /api/chat/threads/:threadId/messages
```

WebSocket 发送消息：

```json
{
  "type": "send_message",
  "threadId": 1,
  "content": "hello",
  "clientId": "optional-client-id"
}
```

两种方式最终都会调用同一个核心逻辑：

```text
createMessage
```

`createMessage` 的流程：

```text
1. 校验发送者是否属于该聊天线程
2. 校验消息内容不能为空、不能超长
3. 写入 `chat_message`
4. 返回消息和线程双方用户 ID
5. WebSocket 场景下广播给双方在线连接
```

答辩重点：

实时推送不是直接把消息发出去就结束，而是先持久化，再广播。这样断线用户之后也能通过历史消息读取。

### 2.10 如何防止越权读取聊天记录

聊天服务使用 `assertThreadParticipant`：

```text
where:
  id = threadId
  and (userAId = 当前用户 or userBId = 当前用户)
```

如果当前用户不是线程参与者，返回 404。这样用户 C 不能读取用户 A 和 B 的聊天记录。

答辩时可以说：

聊天权限不是只看登录状态，还要看用户是否属于该线程。

### 2.11 WebSocket 连接如何管理

聊天服务维护一个内存 Map：

```text
connections: Map<userId, Set<WebSocket>>
```

含义：

```text
一个用户可以有多个在线连接，比如多个浏览器标签页
```

用户连接成功后：

```text
1. 把 socket 加入 connections[userId]
2. 服务端发送 ready 消息
3. 写入 WebSocket 连接审计
```

用户断开后：

```text
从 connections[userId] 删除该 socket
```

### 2.12 消息如何实时广播

当用户通过 WebSocket 发送消息时：

```text
1. 解析客户端 JSON
2. 校验 type 是 send_message
3. 调用 createMessage 写库
4. 得到 participantIds
5. 调用 broadcastMessage
6. 给双方在线 socket 发送 message_created
```

广播消息结构大致为：

```json
{
  "type": "message_created",
  "message": {
    "id": 1,
    "threadId": 1,
    "senderId": 2,
    "content": "hello",
    "createdAt": "...",
    "sender": {}
  },
  "clientId": "optional-client-id"
}
```

### 2.13 心跳机制是什么

WebSocket 长连接可能异常断开，服务端不一定立刻知道。所以系统使用 ping/pong：

```text
每 30 秒：
1. 如果 socket 上次没有响应 pong，就 terminate
2. 否则设置 isAlive=false
3. 发送 ping
4. 客户端响应 pong 后重新设为 isAlive=true
```

作用：

及时清理失效连接，避免内存里保存无效 socket。

### 2.14 离线消息如何理解

当前系统支持“离线后查看历史消息”，因为消息会写入数据库。

但它没有做：

```text
离线推送
消息送达回执
已读回执
```

答辩口径：

当前是毕业设计原型，完成了聊天线程、消息持久化、历史查询和在线实时推送。离线推送和已读回执属于后续扩展。

### 2.15 聊天内容安全

当前聊天内容做了：

```text
1. 登录鉴权
2. 线程参与者权限校验
3. 内容不能为空
4. 最大长度限制
5. 聊天操作审计
```

当前没有做：

```text
聊天消息 AI 内容审核
敏感词过滤
端到端加密
已读回执
```

如果被问到，要主动承认：

聊天模块目前偏功能原型，安全治理主要在身份和权限层面，内容审核可以后续复用 AI 服务补充。

### 2.16 聊天功能答辩高频问答

#### Q1：为什么不用 HTTP 轮询实现聊天？

HTTP 轮询需要客户端不断请求服务器，延迟和开销都更高。WebSocket 建立长连接后，服务端可以主动推送消息，更适合实时聊天。

#### Q2：WebSocket 如何保证用户身份？

连接建立时携带 access token，聊天服务用 JWT 校验并查数据库确认用户存在。没有有效 token 的连接会被拒绝。

#### Q3：用户 A 能不能看 B 和 C 的聊天？

不能。查询消息和发送消息前都会检查当前用户是否属于该线程，不属于则返回错误。

#### Q4：消息是否一定能实时送达？

如果双方在线，WebSocket 会实时广播；如果对方离线，消息仍已保存到数据库，对方下次进入聊天页可以通过 REST 拉取历史消息。

#### Q5：聊天功能和通知功能是否联动？

当前聊天消息没有和通知中心形成完整联动。聊天主要通过聊天页和 WebSocket 实时消息体现，通知联动可以作为后续优化。

#### Q6：WebSocket 经网关转发有什么意义？

这样前端只连接统一网关地址，不直接暴露聊天服务端口。网关还可以统一透传 requestId、路由信息和处理跨服务代理。

## 3. AI 与聊天可以串起来的最终口述版

如果老师让你整体解释，可以这样说：

AI 模块采用独立服务，通过 HTTP 内部接口被博客服务调用。文章发布后先进入待审核状态，博客服务携带内部 token 调用 AI 服务，AI 服务通过 Provider 模式选择 Mock Provider 或 OpenAI-compatible Provider，把文章内容分析成四项评分、风险等级、审核决策、原因建议和标签。结果会写入 AI 分析表和标签关联表，并同步更新文章状态和作者基础评分。聊天模块则采用 REST 加 WebSocket 的方式实现，REST 负责线程创建、历史消息查询和普通消息发送，WebSocket 负责在线实时推送。WebSocket 连接通过网关升级转发到聊天服务，连接时用 JWT 鉴权，发送消息时先检查用户是否属于聊天线程，消息写入数据库后再广播给双方在线连接。因此 AI 模块强调结构化分析和内容治理，聊天模块强调身份校验、消息持久化和实时双向通信。
