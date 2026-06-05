# 国内 OpenAI-compatible 免费模型与轮询调用适配

## 1. 结论口径

为了避免答辩现场依赖海外网络，AI 服务的真实大模型调用目标已经改成国内模型商或国内云厂商提供的 OpenAI-compatible 接口。

当前配置思路是：

```text
AI_PROVIDER=openai-compatible
AI_PROVIDER_TARGETS=[国内 OpenAI-compatible provider 列表]
```

系统每次分析文章时，会把配置中的 provider/model 展开成候选列表，并按轮询方式选择起点；某个供应商或模型调用失败时，会自动尝试下一个候选目标。

## 2. 当前保留的国内可用目标

| 平台 | OpenAI-compatible 地址 | 免费口径 | 示例模型 |
| --- | --- | --- | --- |
| 硅基流动 SiliconFlow | `https://api.siliconflow.cn/v1/chat/completions` | 官方模型页列出免费模型 | `Qwen/Qwen2-7B-Instruct`、`THUDM/glm-4-9b-chat`、`internlm/internlm2_5-7b-chat` |
| 智谱 BigModel | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | 官方免费模型 | `glm-4.7-flash` |
| 阿里云百炼 DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | 新用户免费额度/Token，以控制台为准 | `qwen-turbo`、`qwen-plus` |
| 百度千帆 Qianfan | `https://qianfan.baidubce.com/v2/chat/completions` | 新用户免费额度/Token，以控制台为准 | `ernie-4.5-turbo-32k`、`ernie-x1-turbo-32k` |

答辩时注意区分：

```text
硅基流动、智谱更接近“免费模型”；
阿里百炼、百度千帆更接近“免费额度/试用额度”。
```

这些免费模型、额度和限速都可能随平台政策变化，最终以各平台控制台和官方文档为准。

## 3. 获取 API Key 的控制台

| 环境变量 | 平台 | 控制台地址 |
| --- | --- | --- |
| `SILICONFLOW_API_KEY` | 硅基流动 | `https://cloud.siliconflow.cn/account/ak` |
| `ZHIPU_API_KEY` | 智谱 BigModel | `https://bigmodel.cn/usercenter/proj-mgmt/apikeys` |
| `DASHSCOPE_API_KEY` | 阿里云百炼 | `https://bailian.console.aliyun.com/?apiKey=1&tab=globalset` |
| `QIANFAN_API_KEY` | 百度千帆 | `https://console.bce.baidu.com/qianfan/ais/console/apiKey` |

实际启用时，只需要填已经拿到的 key。缺 key 的 provider 会被系统自动跳过。

## 4. 示例配置

根目录 `.env`、`.env.example`、`ai_service/.env.example` 已经写入：

```text
SILICONFLOW_API_KEY=""
ZHIPU_API_KEY=""
DASHSCOPE_API_KEY=""
QIANFAN_API_KEY=""
```

拿到 key 后，把对应变量填上，并将：

```text
AI_PROVIDER="mock"
```

改为：

```text
AI_PROVIDER="openai-compatible"
```

## 5. 轮询调用流程

真实调用流程如下：

```text
1. 读取 AI_PROVIDER_TARGETS JSON 配置
2. 跳过没有 API key 的 provider
3. 将 provider/models 展开成候选列表
4. 每次请求从不同候选起点开始调用
5. 当前候选失败时自动尝试下一个候选
6. 所有候选失败时，业务层按保守策略进入 REVIEW
```

这套机制的价值不是追求高并发负载均衡，而是让毕业设计可以在真实外部模型上验证语义分析能力，同时保留 Mock Provider 作为稳定演示兜底。

## 6. 可引用资料

- SiliconFlow 模型列表和免费模型说明：`https://docs.siliconflow.com/quickstart/models`
- SiliconFlow Chat Completions 文档：`https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions`
- 智谱免费模型 GLM-4.7-Flash：`https://docs.bigmodel.cn/cn/guide/models/free/glm-4.7-flash`
- 智谱接口调用总览：`https://docs.bigmodel.cn/cn/api/introduction`
- 阿里云百炼 OpenAI 兼容模式：`https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope`
- 阿里云百炼免费额度说明：`https://help.aliyun.com/zh/model-studio/new-free-quota`
- 百度千帆 OpenAI 兼容接口：`https://cloud.baidu.com/doc/qianfan/s/Imi2rpirg`
- 百度千帆免费额度说明：`https://cloud.baidu.com/doc/qianfan/s/Pmb3in3eg`
