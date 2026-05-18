# 自动化内容审核外文翻译材料说明

本文件夹用于替代或弱化原先“微服务安全综述”材料在外文翻译中的主文献位置。相比微服务架构背景，这篇文献更贴近论文的核心创新点：AI 评分、风险阈值、内容治理、展示控制以及用户后续行为反馈。

## 文件说明

- `translation.md`：按本科外文资料翻译格式整理的中文译文。
- `original/horta-ribeiro-cheng-west-2023-automated-content-moderation.pdf`：作者公开版本 PDF。
- `original/horta-ribeiro-cheng-west-2023-automated-content-moderation-arxiv.pdf`：arXiv 版本 PDF，便于作为原文复印件存档。
- `original/crossref-metadata.json`：Crossref 元数据，用于核对 DOI、作者、会议、页码等出处信息。
- `original/arxiv-metadata.xml`：arXiv 元数据。
- `images/`：从原文 PDF 渲染并裁剪出的图表图片，已在译文中引用。

## 推荐使用方式

建议将本文献作为外文翻译的第一篇或主文献。理由如下：

- 文献直接讨论自动化内容审核系统，而不是泛泛讨论微服务架构。
- 文献中的核心机制是“分类器评分 S + 阈值 t + 隐藏/删除干预”，可对应论文中的 AI 评分、风险等级与展示流控制。
- 文献把审核结果与用户后续行为联系起来，可对应论文中的用户画像更新和推荐流反馈。
- 文献出自 ACM Web Conference 2023，出处权威，原文长度超过 6000 个印刷符号。

如果学校明确要求“两篇外文文献”，原先的 `docs/foreign-translation/microservice-security/` 可以作为第二篇架构类补充材料；如果希望两篇都紧扣论文创新点，后续可再补一篇“AI 内容治理/自动审核系统实现”方向的开放获取期刊文章。
