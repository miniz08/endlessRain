# 安全日志记录与审计模块实现文档

## 模块职责

本模块负责请求追踪、关键操作日志、网关健康检查、路由指标、审计日志查询和管理员运行摘要。它为系统安全性、可追踪性、测试复盘和答辩演示提供支撑。

## 核心实现位置

| 类型 | 文件 |
| --- | --- |
| 网关入口 | `api_gateway/src/index.ts` |
| 网关状态 | `api_gateway/src/gatewayStatus.ts` |
| 路由配置 | `api_gateway/src/config/routes.ts` |
| 代理逻辑 | `api_gateway/src/proxy/proxyHandler.ts` |
| 请求 ID | `api_gateway/src/utils/requestId.ts` |
| 审计服务 | `user_service/src/services/auditService.ts`、`blog_service/src/services/auditService.ts`、`ai_service/src/services/auditService.ts`、`chat_service/src/services/auditService.ts` |
| 前端运维页 | `mofukaze/pages/ops.vue` |

## 数据表

| 表名 | 作用 |
| --- | --- |
| `audit_log` | 保存请求 ID、用户、角色、IP、方法、路径、动作、结果、状态码和详情 |

## 核心代码讲解

请求追踪从 API 网关开始。`assignRequestId` 会读取请求头中的 `x-request-id`，如果调用方没有传入，则生成新的随机 id，并写回响应头。后续服务写审计日志时都使用同一个 requestId，便于把一次跨服务请求串起来。

网关代理由 `registerProxies` 和 `createGatewayProxy` 完成。每条路由在 `routes.ts` 中配置前缀、目标服务环境变量和默认目标地址。代理请求时会设置 `x-request-id` 和 `x-gateway-route`，并根据 `stripPrefix` 把 `/api/articles` 这类路径改写成后端服务实际使用的 `/articles`。

WebSocket 升级由 `handleProxyUpgrade` 单独处理。测试修复后，只有 `supportsWebSocket: true` 的 chat 路由会开启 `ws: true`，升级请求也只匹配这些路由。这避免了所有 HTTP 代理都注册 upgrade 监听造成的监听器过多和路由混乱。

路由指标由 `collectGatewayMetrics` 收集。它只统计 `/api` 下且非 `/api/gateway` 的业务请求，在响应结束时记录请求次数、错误次数、HTTP 方法分布、最后状态码、最后延迟和最后访问时间。`gatewayMetricsController` 把这些内存指标返回给前端运维页面。

聚合健康检查由 `gatewayHealthController` 实现。它按目标服务去重后访问每个上游服务的 `/health`，根据上游返回结果汇总为 `ok`、`degraded` 或 `down`。这使前端和测试脚本可以通过一个网关接口判断整个平台是否基本可用。

审计日志由各服务在关键动作中主动写入。不同服务的 `writeAuditLog` 结构相近，都会保存 requestId、用户信息、IP、请求方法、路由、动作、结果、状态码和详情。审计写入失败只打印错误，不阻断主业务流程，避免日志系统异常影响正常使用。

审计查询和管理员摘要在 `gatewayStatus.ts` 中实现。`auditLogsController` 和 `adminSummaryController` 都会先解析 access token，并只允许 `reviewer` 或 `admin` 角色访问。摘要接口会统计指定时间窗口内的审计事件数、失败率、热点动作、热点路由和最近失败请求，便于测试报告和运维页面展示。

## 主要接口

| 接口 | 说明 |
| --- | --- |
| `GET /health` | 网关基础健康检查 |
| `GET /api/gateway/health` | 聚合上游服务健康状态 |
| `GET /api/gateway/routes` | 查询网关路由 |
| `GET /api/gateway/metrics` | 查询路由运行指标 |
| `GET /api/gateway/audit-logs` | 查询审计日志 |
| `GET /api/gateway/admin-summary` | 查询管理员摘要 |

## 测试关联

黑盒测试首先验证网关健康、聚合健康、路由列表、指标结构、未知路径和 requestId 透传。安全测试验证游客和普通用户不能访问审计数据。压力测试中网关健康检查 180 次请求全部成功，说明网关基础响应能力稳定。

## 已实现能力

- 每个请求会生成或透传 `requestId`。
- 各服务会在关键成功/失败动作中写入审计日志。
- 网关统计路由请求数、错误数、方法分布和最后响应状态。
- 管理员或审核员可以查看审计日志和运行摘要。
- 健康检查能够检测上游服务可用性。
- WebSocket 代理只对 chat 路由开启，降低升级连接误路由风险。
