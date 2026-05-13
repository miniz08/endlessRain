# 项目文档入口

当前 `docs` 已整理为五类文档：模块化设计文档、论文正文稿、图表源文件、测试文档、运维与补完记录。写论文和准备答辩时，优先从本入口进入，不再引用旧版根目录开发记录。

## 1. 模块化设计文档

主入口：[modules/README.md](modules/README.md)

模块化文档按照论文第 4 章的 8 个模块编排。每个模块包含：

- `implementation.md`：实现文档，说明模块职责、核心代码、数据表、接口和已完成能力。
- `runtime.md`：运行机制文档，说明请求流转、状态变化、权限边界、异常处理和模块协作方式。

## 2. 论文正文稿

新版正文稿：[thesis-draft/main-text-v2.md](thesis-draft/main-text-v2.md)

该正文稿已经按照最新论文结构重写，并在正文中标注了图片插入位置和对应 Mermaid 源文件。

## 3. 图表与 Mermaid 源文件

图表入口：[diagrams/README.md](diagrams/README.md)

论文正文中的插图位置已经在 `main-text-v2.md` 中标注，图表源文件统一放在 `docs/diagrams` 下。

## 4. 测试文档

测试入口：[testing/README.md](testing/README.md)

系统黑盒测试方案已归档到：[testing/black-box-test-plan.md](testing/black-box-test-plan.md)

## 5. 运维与补完记录

运维入口：[operations/README.md](operations/README.md)

其中保留了部署运行流程，以及内容审核、用户评级和通知反馈补完实施记录。

## 6. 清理说明

原本散落在 `docs` 根目录的服务开发记录、恢复记录和旧版集中图表文档，已经按价值重新处理：

- 有效实现要点已合并到 `docs/modules` 下对应模块。
- 可继续复用的测试与部署文档已移动到 `docs/testing` 和 `docs/operations`。
- 重合、过时或容易误导论文写作的旧文档已删除。

后续新增文档时，建议按模块或用途放入对应子目录，不再直接堆放到 `docs` 根目录。
