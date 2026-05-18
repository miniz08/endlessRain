# Mermaid 图表索引

本目录保存论文和答辩可用的 Mermaid 源文件。论文正文中使用“图 X-X 插入位置”标注，并链接到对应 `.mmd` 文件。后续可使用 Mermaid CLI、Typora、Obsidian、VS Code Mermaid 插件或在线 Mermaid 编辑器导出 PNG/SVG 图片。

## 系统级图表

| 图表 | 文件 | 建议用途 |
| --- | --- | --- |
| 系统业务闭环图 | [system/business-closed-loop.mmd](system/business-closed-loop.mmd) | 第 2 章系统流程分析 |
| 微服务运行结构图 | [system/microservice-runtime.mmd](system/microservice-runtime.mmd) | 第 1 章框架介绍、第 3 章架构设计 |
| 系统数据流总体图 | [system/data-flow-overview.mmd](system/data-flow-overview.mmd) | 第 3 章总体设计 |
| 数据库概念 E-R 图 | [system/database-overall-er.mmd](system/database-overall-er.mmd) | 第 3 章数据库概念结构设计 |

## 模块级图表

| 模块 | 文件 |
| --- | --- |
| 用户认证 ER 图 | [modules/auth-er.mmd](modules/auth-er.mmd) |
| 用户认证流程图 | [modules/auth-flow.mmd](modules/auth-flow.mmd) |
| 内容管理 ER 图 | [modules/content-er.mmd](modules/content-er.mmd) |
| 内容发布与审核流程图 | [modules/content-review-flow.mmd](modules/content-review-flow.mmd) |
| 社交通知 ER 图 | [modules/social-notification-er.mmd](modules/social-notification-er.mmd) |
| 评论、reaction 与通知流程图 | [modules/social-feedback-flow.mmd](modules/social-feedback-flow.mmd) |
| AI 内容评级 ER 图 | [modules/ai-rating-er.mmd](modules/ai-rating-er.mmd) |
| 推荐画像 ER 图 | [modules/recommendation-er.mmd](modules/recommendation-er.mmd) |
| 聊天 ER 图 | [modules/chat-er.mmd](modules/chat-er.mmd) |
| 审计 ER 图 | [modules/audit-er.mmd](modules/audit-er.mmd) |
| 推荐展示流程图 | [modules/recommendation-flow.mmd](modules/recommendation-flow.mmd) |
| 单对单聊天流程图 | [modules/chat-flow.mmd](modules/chat-flow.mmd) |
| 审计监控流程图 | [modules/audit-flow.mmd](modules/audit-flow.mmd) |

旧版集中式图表文档已经拆分为本目录下的独立 Mermaid 文件，并删除旧稿。后续补图时，优先在本目录新增独立 `.mmd` 文件，再从论文正文链接。
