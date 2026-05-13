# 用户社交关系与互动功能实现文档

## 模块职责

本模块负责关注关系、粉丝/关注列表、关注摘要、评论、回复、文章 emoji、评论 emoji 和私信聊天等社交互动能力。它同时向通知模块和推荐模块输出事件，让用户互动能够被反馈、被统计、被用于后续展示排序。

## 核心实现位置

| 类型 | 文件 |
| --- | --- |
| 关注路由 | `blog_service/src/api/follow.ts` |
| 评论路由 | `blog_service/src/api/comment.ts` |
| reaction 路由 | `blog_service/src/api/article.ts`、`blog_service/src/api/comment.ts` |
| 关注服务 | `blog_service/src/services/followService.ts` |
| 评论服务 | `blog_service/src/services/commentService.ts` |
| reaction 服务 | `blog_service/src/services/reactionService.ts` |
| 聊天服务 | `chat_service/src/services/chatService.ts` |
| WebSocket | `chat_service/src/ws/server.ts` |
| 前端页面 | `mofukaze/pages/article/[id].vue`、`mofukaze/pages/u/[id].vue`、`mofukaze/pages/chat.vue` |

## 数据表

| 表名 | 作用 |
| --- | --- |
| `follow` | 保存关注关系和关注状态 |
| `comment` | 保存评论、回复和被回复用户 |
| `article_reaction` | 保存文章 emoji 反馈 |
| `comment_reaction` | 保存评论 emoji 反馈 |
| `chat_thread` | 保存单对单聊天线程 |
| `chat_message` | 保存聊天消息 |

## 核心代码讲解

关注功能由 `followService.followUser` 和 `unfollowUser` 实现。关注前先判断 `followerId === followingId`，禁止用户关注自己；随后检查目标用户是否存在。真正写入时使用 `follow.upsert`，如果关系不存在则创建，如果之前取消过关注则把状态恢复为 `ACTIVE`。取消关注不是直接删除记录，而是把状态改为 `INACTIVE`，这样可以保留关系历史并支持恢复。

关注列表和粉丝列表通过分页查询 `follow` 表实现，只返回 `ACTIVE` 状态。为了让前端在用户主页上直接显示“我是否关注了这个人”，列表服务会额外查询当前访问者与目标用户之间的关系，并把 `followedByMe` 合并到返回对象中。关注摘要则并行统计关注数、粉丝数和当前访问者关系。

评论功能由 `commentService.createComment` 实现。创建评论前会检查文章是否存在且处于公开状态，避免用户在不可见内容下继续互动。回复评论时，服务会记录父评论 id 和被回复用户 id，方便通知中心生成“回复了你”的提醒。删除评论时会检查操作者是否为评论作者、文章作者或管理员。

Emoji 反馈使用 `reactionService.toggleArticleReaction` 和 `toggleCommentReaction`。表上有联合唯一约束，例如同一用户对同一文章的同一 emoji 只能存在一条记录。服务层先查找现有 reaction：存在则删除并返回 removed，不存在则创建并返回 added。这个设计让前端按钮点击可以自然表现为“添加/取消”。

聊天功能拆分为 REST 历史消息和 WebSocket 实时消息。`chatService.getOrCreateThread` 会把两个用户 id 排序成固定的 `userAId`、`userBId`，再通过复合唯一键 `userAId_userBId` 做 upsert，保证同一对用户只有一个线程。`createMessage` 会先调用 `assertThreadParticipant` 确认发送者属于该线程，再写入 `chat_message`，并返回双方用户 id。

WebSocket 入口由 `installChatWebSocket` 安装到聊天服务的 HTTP server。升级请求到达 `/chat/ws` 后，`handleUpgrade` 从 query 或 Cookie 中提取 access token，校验通过后把连接加入 `connections` 映射。客户端发送 `send_message` 时，服务复用 `createMessage` 写库，然后通过 `broadcastMessage` 向线程双方在线连接推送 `message_created`。

测试中曾发现经 API 网关代理的 WebSocket 消息没有稳定送达。修复方式不在聊天服务内部，而是在网关层只为 chat 路由开启 `supportsWebSocket`，避免所有代理路由都注册升级监听。复验中两个用户经 `ws://127.0.0.1:3001/api/chat/ws` 连接后，接收方可以收到实时消息。

## 主要接口

| 接口 | 说明 |
| --- | --- |
| `POST /api/users/:userId/follow` | 关注用户 |
| `DELETE /api/users/:userId/follow` | 取消关注 |
| `GET /api/following` | 查询关注列表 |
| `GET /api/followers` | 查询粉丝列表 |
| `GET /api/users/:userId/follow-summary` | 查询关注摘要 |
| `GET /api/articles/:articleId/comments` | 查询评论 |
| `POST /api/articles/:articleId/comments` | 创建评论 |
| `POST /api/articles/:articleId/reactions` | 切换文章 emoji |
| `POST /api/comments/:commentId/reactions` | 切换评论 emoji |
| `GET /api/chat/threads` | 查询聊天线程 |
| `POST /api/chat/threads/:threadId/messages` | 发送消息 |
| `WS /api/chat/ws` | 实时聊天连接 |

## 测试关联

黑盒测试覆盖关注、重复关注、自我关注拦截、关注/粉丝列表、关注摘要、关注流、评论列表、游客评论拦截、评论参数校验、创建评论、越权删除、文章 reaction、评论 reaction、聊天线程、消息历史和 WebSocket 实时送达。WebSocket 修复后的定向复验也写入了测试报告。

## 已实现能力

- 关注关系支持创建、取消、恢复和自我关注拦截。
- 评论支持文章评论、父评论和回复目标用户。
- 文章和评论 reaction 使用联合唯一约束避免重复。
- 互动行为会写入推荐事件，参与用户画像和内容质量统计。
- 聊天支持 REST 历史消息和 WebSocket 实时推送。
- WebSocket 经网关代理后只由 chat 路由处理升级请求。
