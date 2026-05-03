# 数据库 Prisma 复原报告

生成时间：2026-05-03

## 1. 复原依据

本次复原以云端 MySQL 数据库中的真实表结构为权威来源。本地已损坏的 `schema.prisma` 不再作为数据模型依据。

本次没有把数据库连接密钥写入仓库文件。执行 `prisma db pull`、`prisma generate` 和只读连库测试时，数据库地址仅通过当前 shell 的 `DATABASE_URL` 环境变量临时传入。

## 2. 已恢复文件

全量权威 schema：

- `prisma/schema.prisma`

服务级 schema：

- `user_service/prisma/schema.prisma`
- `blog_service/prisma/schema.prisma`
- `ai_service/prisma/schema.prisma`
- `chat_service/prisma/schema.prisma`
- `api_gateway/prisma/schema.prisma`

为支持 Prisma Client 生成，同时恢复了这些服务的 `package.json` 和 `package-lock.json`：

- `user_service/package.json`
- `blog_service/package.json`
- `ai_service/package.json`
- `chat_service/package.json`
- `api_gateway/package.json`

## 3. 表结构分配

| 服务 | 负责表 |
| --- | --- |
| `user_service` | `user`, `auth_refresh_token`, `audit_log` |
| `blog_service` | `user`, `article`, `article_ai_analysis`, `article_tag`, `article_tag_on_article`, `article_ai_tag`, `article_ai_tag_on_article`, `comment`, `comment_reaction`, `article_reaction`, `follow`, `reco_*`, `audit_log` |
| `ai_service` | `user`, `article`, `article_ai_analysis`, `article_ai_tag`, `article_ai_tag_on_article`, `audit_log` |
| `chat_service` | `user`, `chat_thread`, `chat_message`, `audit_log` |
| `api_gateway` | `audit_log` |

根目录 `prisma/schema.prisma` 保留云端数据库完整 20 个模型和 2 个 enum，用于后续重新切分或核对。

## 4. 验证结果

已完成：

- `prisma db pull` 成功，从云端库 introspect 出 20 个模型。
- 五个服务的 `prisma validate` 均通过。
- 五个服务的 `prisma generate` 均成功。
- 五个服务的 Prisma Client 都能只读连接云端库。

只读 smoke test 结果：

| 服务 | 测试表 | count |
| --- | --- | --- |
| `user_service` | `user` | 17 |
| `blog_service` | `article` | 12 |
| `ai_service` | `article_ai_analysis` | 6 |
| `chat_service` | `chat_thread` | 9 |
| `api_gateway` | `audit_log` | 42915 |

## 5. 后续注意事项

1. 服务运行时仍需要在各服务环境中提供 `DATABASE_URL`。
2. 当前是共库模式，服务级 schema 是逻辑隔离，不是物理隔离。
3. 若云端表结构后续变化，先更新根目录全量 schema，再同步调整服务级 schema。
4. 不要对云端库执行 `prisma migrate reset`。
5. 在没有确认迁移方案前，不要直接对云端库执行破坏性 migration。
