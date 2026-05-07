# 项目恢复文档索引

当前仓库经历过文件内容损坏，旧文档中大量正文已经变成空白字节或不可读内容。已删除不可读旧文档，并保留或新增以下有效文档作为后续恢复依据。

## 当前有效文档

- [project-recovery-plan.md](project-recovery-plan.md)
  - 项目总体复原路线、阶段拆解和答辩优先级。
- [cloud-schema-implementation-plan.md](cloud-schema-implementation-plan.md)
  - 基于云端数据库表结构的实施计划。
- [database-recovery-report.md](database-recovery-report.md)
  - Prisma schema 从云端库复原的结果和验证记录。
- [user-service-development.md](user-service-development.md)
  - `user_service` 的认证、用户、评级、审计开发拆解。
- [ai-service-development.md](ai-service-development.md)
  - `ai_service` 的 AI 评分、标签库、模型接入、持久化开发拆解。
- [blog-service-content-development.md](blog-service-content-development.md)
  - `blog_service` 的文章、评论、emoji reaction 与 AI 服务衔接开发拆解。
- [blog-service-follow-feed-development.md](blog-service-follow-feed-development.md)
  - `blog_service` 的关注关系、粉丝列表、关注时间线与简化推荐流开发拆解。
- [recommendation-loop-development.md](recommendation-loop-development.md)
  - `reco_event`、用户画像、个性化推荐排序、展示控制和前端社交信息流闭环。
- [api-gateway-proxy-development.md](api-gateway-proxy-development.md)
  - `api_gateway`、前端 `/api` 统一前缀、Nginx 代理和 Docker Compose 连携恢复说明。
- [content-publish-ai-review-development.md](content-publish-ai-review-development.md)
  - 内容发布、静默 AI 治理、标签画像、管理员查询边界与审计日志闭环。
- [chat-service-development.md](chat-service-development.md)
  - `chat_service` 单对单 WebSocket 聊天、REST 历史消息、emoji 消息与 gateway 代理恢复说明。
- [gateway-frontend-completion-development.md](gateway-frontend-completion-development.md)
  - gateway 健康聚合、路由指标、审计查询，以及前端 `/ops`、`/chat` 页面补全说明。
- [frontend-topic-chat-ui-polish.md](frontend-topic-chat-ui-polish.md)
  - 标签分类文章页、聊天用户名搜索、个人页私聊入口、透明工业风 UI 优化与查漏补缺清单。
- [notification-admin-monitoring-development.md](notification-admin-monitoring-development.md)
  - 通知中心、运行期通知表、用户互动反馈、管理员监控汇总与论文图示建议。
- [system-model-diagrams.md](system-model-diagrams.md)
  - 当前系统核心功能链路、分模块 ER 图、流程图、数据模型图与总体结构图。
- [docker-deployment-workflow.md](docker-deployment-workflow.md)
  - Docker 开发模式、云服务器部署、端口避让、Git 上传前清理与验证命令。

## 文档维护规则

1. 每完成一个服务或关键功能模块，新增一份对应开发拆解文档。
2. 文档应说明使用表、接口、代码结构、验证方式和后续衔接。
3. 不再保留 100% NUL 字节覆盖的旧文档。
4. 数据库结构以云端库 introspection 结果为准。
