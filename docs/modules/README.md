# 模块化文档索引

本文档是当前系统设计与实现说明的主入口。文档按照论文第 4 章的 8 个模块重新编排，每个模块包含两类文档：

- `implementation.md`：实现文档，说明模块职责、核心代码、数据表、接口和已完成能力。
- `runtime.md`：运行机制文档，说明请求流转、状态变化、权限边界、异常处理和与其他模块的协作方式。

## 模块目录

| 模块 | 实现文档 | 运行机制文档 |
| --- | --- | --- |
| 用户认证与权限管理 | [implementation.md](01-auth-permission/implementation.md) | [runtime.md](01-auth-permission/runtime.md) |
| 社交内容发布与管理 | [implementation.md](02-content-management/implementation.md) | [runtime.md](02-content-management/runtime.md) |
| 用户社交关系与互动 | [implementation.md](03-social-interaction/implementation.md) | [runtime.md](03-social-interaction/runtime.md) |
| 消息通知与处理结果反馈 | [implementation.md](04-notification-feedback/implementation.md) | [runtime.md](04-notification-feedback/runtime.md) |
| 基于 AI 分析的内容评级 | [implementation.md](05-ai-content-rating/implementation.md) | [runtime.md](05-ai-content-rating/runtime.md) |
| 用户综合行为评级 | [implementation.md](06-user-behavior-rating/implementation.md) | [runtime.md](06-user-behavior-rating/runtime.md) |
| 基于评级机制的推荐与展示控制 | [implementation.md](07-recommendation-display/implementation.md) | [runtime.md](07-recommendation-display/runtime.md) |
| 安全日志记录与审计 | [implementation.md](08-audit-monitoring/implementation.md) | [runtime.md](08-audit-monitoring/runtime.md) |

## 图表入口

论文可用的 Mermaid 图表统一放在 [../diagrams/README.md](../diagrams/README.md)。新版论文稿优先引用 `docs/diagrams` 下拆分后的 `.mmd` 文件。

## 旧文档合并说明

原本位于 `docs` 根目录的服务开发记录已经完成合并和清理。下列旧文档中的有效内容已吸收到对应模块，旧文件本身已删除，后续以本目录文档为准：

| 旧文档 | 已合并到 |
| --- | --- |
| `user-service-development.md` | 用户认证与权限管理、用户综合行为评级 |
| `blog-service-content-development.md` | 社交内容发布与管理、用户社交关系与互动 |
| `blog-service-follow-feed-development.md` | 用户社交关系与互动、推荐与展示控制 |
| `content-publish-ai-review-development.md` | 社交内容发布与管理、AI 内容评级 |
| `ai-service-development.md` | AI 内容评级 |
| `recommendation-loop-development.md` | 推荐与展示控制、用户画像 |
| `notification-admin-monitoring-development.md` | 通知反馈、安全审计 |
| `chat-service-development.md` | 用户社交关系与互动 |
| `api-gateway-proxy-development.md` | 权限边界、网关代理、安全审计 |
| `gateway-frontend-completion-development.md` | 网关监控、安全审计 |
| `frontend-topic-chat-ui-polish.md` | 社交互动前端表现 |

测试、部署和补完实施类文档没有并入单个模块，已单独归档到 [../testing/README.md](../testing/README.md) 与 [../operations/README.md](../operations/README.md)。
