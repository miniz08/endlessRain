# Docker 开发模式与云服务器部署全流程

生成日期：2026-05-03

## 1. 端口规划

本项目可以和你已有的博客微服务应用共存在同一台云服务器上。关键规则是：

```text
容器内部端口可以重复
宿主机端口不能重复
不同 compose 项目默认拥有不同 Docker network
```

本项目内部端口仍保持原设计：

| 服务 | 容器内部端口 |
| --- | --- |
| `frontend` Nginx | `80` |
| `frontend` Nuxt dev | `3000` |
| `api_gateway` | `3001` |
| `blog_service` | `3002` |
| `user_service` | `3003` |
| `ai_service` | `3004` |
| `chat_service` | `3005` |

生产模式只暴露前端：

```text
宿主机 800 -> frontend 容器 80
```

开发模式暴露一组避开常见冲突的宿主机端口：

| 访问对象 | 宿主机端口 | 容器端口 |
| --- | ---: | ---: |
| Nuxt dev 前端 | `13000` | `3000` |
| Gateway | `13001` | `3001` |
| Blog service | `13002` | `3002` |
| User service | `13003` | `3003` |
| AI service | `13004` | `3004` |
| Chat service | `13005` | `3005` |

这些默认值都已经写入根目录 `.env` 与 `.env.example`。开发模式优先使用根目录 `.env`，因此常规情况下不需要再临时手写端口变量。

## 2. 仓库上传前准备

本阶段已删除本地生成物：

```text
node_modules
各服务 dist
mofukaze/.nuxt
mofukaze/.output
```

保留内容：

```text
源码
package-lock.json
Prisma schema
Dockerfile
docs
.history 与 backups 目录
本地 .env
```

`.env`、`.history` 和 `backups` 已在 `.gitignore` 中忽略，默认不会进入 Git 仓库。如果你想保留本地恢复线索，不需要删除它们。

根目录已经生成了一份开发用 `.env`。它包含数据库连接、开发 token、端口和 AI provider 配置，目的是让 Docker 开发模式尽量开箱即用。`.env.example` 是可提交模板，供云服务器重新生成环境文件使用。

建议上传前检查：

```bash
git status --short
git add .
git status --short
```

如果看到 `node_modules`、`dist`、`.nuxt`、`.output`，说明 ignore 没生效，不要提交。

如果恢复目录里残留旧 `.git`，并且 `git status` 报 `object is corrupt` 一类错误，说明旧仓库对象已损坏。当前项目不依赖旧历史，可以重新初始化：

```bash
rm -rf .git
git init
git add .
git commit -m "restore ai social platform"
git branch -M main
git remote add origin <你的新仓库地址>
git push -u origin main
```

Windows PowerShell 对应：

```powershell
Remove-Item -Recurse -Force .git
git init
git add .
git commit -m "restore ai social platform"
git branch -M main
git remote add origin <你的新仓库地址>
git push -u origin main
```

## 3. 云服务器准备

服务器需要：

```bash
docker --version
docker compose version
git --version
```

如果服务器没有 Docker Engine，可在 Linux 上安装 Docker CE。项目不要求 Docker Desktop，也不要求 WSL。

克隆项目：

```bash
git clone <你的仓库地址> longseason-ai-social
cd longseason-ai-social
```

环境文件有两种处理方式。

方式一：从本机把已经准备好的 `.env` 传到服务器，最省事：

```bash
scp .env root@服务器IP:/path/to/longseason-ai-social/.env
```

方式二：在服务器上由模板生成：

```bash
cp .env.example .env
```

如果使用方式二，只需要把 `.env` 中的数据库连接改成你的开发数据库连接。其他开发 token、端口和 mock AI 配置已经有默认明文值：

```env
DATABASE_URL="mysql://用户名:密码:数据库地址:3306/数据库名"
```

如果使用真实模型：

```env
AI_PROVIDER="openai-compatible"
AI_BASE_URL="https://api.siliconflow.cn/v1"
AI_CHAT_PATH="/chat/completions"
AI_API_KEY="你的 key"
AI_MODEL="Qwen/QwQ-32B"
```

如果只做稳定演示：

```env
AI_PROVIDER="mock"
```

当前建议答辩演示先使用 `AI_PROVIDER="mock"`，这样不会因为外部模型额度、网络波动或 API key 问题影响流程闭环。需要展示真实模型能力时，再临时切到 `openai-compatible`。

## 4. 生产模式运行

生产模式使用：

```bash
docker compose --env-file .env --project-name longseason-ai-social up -d --build
```

查看状态：

```bash
docker compose --project-name longseason-ai-social ps
docker compose --project-name longseason-ai-social logs -f api_gateway
```

访问：

```text
http://服务器IP:800
```

如果 `800` 也被占用，可以在 `.env` 改：

```env
FRONTEND_HTTP_PORT=18080
```

然后重新启动：

```bash
docker compose --env-file .env --project-name longseason-ai-social up -d --build
```

访问变为：

```text
http://服务器IP:18080
```

生产模式下，`api_gateway`、`blog_service`、`user_service`、`ai_service`、`chat_service` 不暴露宿主机端口，只在 Docker 网络内通信。外部请求路径是：

```text
浏览器 -> frontend Nginx -> /api -> api_gateway -> 各服务
```

## 5. Docker 开发模式运行

开发模式使用 `docker-compose.dev.yml`：

```bash
docker compose --env-file .env --project-name longseason-ai-social-dev -f docker-compose.dev.yml up --build
```

后台运行：

```bash
docker compose --env-file .env --project-name longseason-ai-social-dev -f docker-compose.dev.yml up -d --build
```

访问：

```text
前端:    http://服务器IP:13000
Gateway: http://服务器IP:13001
Blog:    http://服务器IP:13002
User:    http://服务器IP:13003
AI:      http://服务器IP:13004
Chat:    http://服务器IP:13005
```

开发模式默认前端仍请求统一路径：

```text
/api
```

Nuxt dev server 会把 `/api/**` 代理到容器内的 `api_gateway:3001`。

如果你要在开发模式下测试聊天 WebSocket，默认代码会把：

```text
http://服务器IP:13000/api/chat/ws
```

转换为：

```text
ws://服务器IP:13001/api/chat/ws
```

如果你改了开发端口，请同时设置：

```env
NUXT_PUBLIC_WS_BASE="ws://服务器IP:你的Gateway宿主机端口/api"
```

例如：

```env
NUXT_PUBLIC_WS_BASE="ws://106.52.xxx.xxx:13001/api"
```

## 6. 开发模式端口覆盖

`.env` 可覆盖默认端口：

```env
DEV_FRONTEND_PORT=13000
DEV_GATEWAY_PORT=13001
DEV_BLOG_PORT=13002
DEV_USER_PORT=13003
DEV_AI_PORT=13004
DEV_CHAT_PORT=13005
```

如果某个端口被占用，例如 `13000` 也被占：

```env
DEV_FRONTEND_PORT=14000
```

然后：

```bash
docker compose --env-file .env --project-name longseason-ai-social-dev -f docker-compose.dev.yml up -d --build
```

## 7. 常用验证命令

生产模式：

```bash
curl http://127.0.0.1:${FRONTEND_HTTP_PORT:-800}
docker compose --env-file .env --project-name longseason-ai-social exec api_gateway wget -qO- http://127.0.0.1:3001/api/gateway/health
```

开发模式：

```bash
curl http://127.0.0.1:${DEV_GATEWAY_PORT:-13001}/api/gateway/health
curl http://127.0.0.1:${DEV_CHAT_PORT:-13005}/health
curl http://127.0.0.1:${DEV_FRONTEND_PORT:-13000}/ops
```

查看日志：

```bash
docker compose --project-name longseason-ai-social-dev -f docker-compose.dev.yml logs -f
```

只看某个服务：

```bash
docker compose --project-name longseason-ai-social-dev -f docker-compose.dev.yml logs -f api_gateway
docker compose --project-name longseason-ai-social-dev -f docker-compose.dev.yml logs -f blog_service
```

停止：

```bash
docker compose --project-name longseason-ai-social-dev -f docker-compose.dev.yml down
```

生产模式停止：

```bash
docker compose --project-name longseason-ai-social down
```

## 8. 与已有博客应用共存

建议显式指定 project name：

```bash
docker compose --env-file .env --project-name longseason-ai-social up -d --build
```

这样 Docker 网络名、容器名前缀、资源名前缀都会和已有博客应用区分开。

不要在两个 compose 项目中使用同一个宿主机端口。例如，如果博客已占用：

```text
80
3000
3001
3002
```

本项目生产默认只用：

```text
800
```

开发默认使用：

```text
13000-13005
```

因此不会与已有博客应用冲突。
