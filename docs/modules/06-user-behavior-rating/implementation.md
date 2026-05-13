# 用户综合行为评分功能实现文档

## 模块职责

本模块负责根据用户发布内容的 AI 评分、审核结果和互动反馈生成综合行为评分。评分结果用于用户主页展示、推荐排序中的作者质量信号，以及平台治理时的参考。

## 核心实现位置

| 类型 | 文件 |
| --- | --- |
| 用户服务 | `user_service/src/services/userService.ts` |
| 用户控制器 | `user_service/src/controllers/userController.ts` |
| AI 评分刷新 | `ai_service/src/services/analysisService.ts` |
| 推荐事件 | `blog_service/src/services/recoEventService.ts` |
| 前端展示 | `mofukaze/pages/u/[id].vue` |

## 数据来源

| 数据 | 来源 |
| --- | --- |
| 内容质量评分 | `article_ai_analysis` |
| 审核状态 | `article.status` |
| 正向反馈 | `reco_event` 中的点赞、评论、收藏、关注作者、完整阅读 |
| 负向反馈 | `reco_event` 中的隐藏和举报 |
| 用户基础评分 | `user.professionalism`、`user.friendliness` |

## 核心代码讲解

评分查询入口是 `userController.getRating`，实际计算由 `userService.getUserRating` 完成。服务先读取用户基础字段，如果用户不存在则返回 404。随后并行执行两条 SQL 聚合：第一条从 `article` 和 `article_ai_analysis` 统计 AI 平均分、文章总数、公开数、低优先级数、复核数和拒绝数；第二条从 `article` 和 `reco_event` 统计正向反馈、完整阅读、负向反馈和举报数。

内容质量分使用 AI 四项评分加权计算：

```text
contentQualityScore =
  professionalism * 0.35 +
  friendliness * 0.25 +
  rationality * 0.2 +
  legality * 0.2
```

合规分从 100 分起扣。低优先级内容每篇扣 4 分，复核内容每篇扣 12 分，拒绝内容每篇扣 28 分，举报每次扣 8 分。这个设计让严重风险比普通低优先级内容影响更大。

互动反馈分从 50 分起算。点赞、评论、收藏和关注作者等正向反馈会加分，完整阅读也会轻微加分；隐藏和举报等负向反馈会明显扣分。最终综合分按内容质量 55%、合规 25%、互动反馈 20% 加权得到，并通过 `levelFromScore` 映射为 A、B、C、D 四个等级。

评分结果还包含 `signals` 风险说明。`buildRatingSignals` 会根据低优先级、复核、拒绝、举报、负向反馈、合法性均分和互动反馈生成中文提示，例如“进入复核内容 1 篇”“收到举报 2 次”“内容互动反馈较好”。这样前端展示时不仅有分数，还有解释。

AI 服务中的 `refreshUserRating` 会在文章分析持久化后更新 `user` 表里的基础 `professionalism` 和 `friendliness`。这两个字段是用户的长期基础分；`getUserRating` 则在查询时结合最新内容、审核和反馈生成更完整的综合评分。

## 输出结果

用户评级接口返回：

- 内容质量分。
- 合规分。
- 互动反馈分。
- 综合分。
- 等级：`A`、`B`、`C`、`D`。
- 内容数量、低优先级数量、复核数量、拒绝数量。
- 正向反馈、完整阅读、负向反馈、举报数量。
- 风险信号列表。

## 测试关联

黑盒测试通过 `/api/users/:id/rating` 验证用户评分结构可返回。文章发布、AI 分析、评论、reaction 和推荐事件测试都会间接影响评分数据来源。论文中可以把它作为“内容治理结果被用户画像和推荐继续使用”的连接点。

## 已实现能力

- `/api/users/:id/rating` 可查询指定用户综合评级。
- AI 分析持久化后会刷新 `user` 表中的基础评分。
- 用户主页展示综合等级和三类分数。
- 低优先级、复核、拒绝、举报和负向反馈会降低评分。
- 正向互动和完整阅读会提高互动反馈分。
- 返回风险信号，便于解释评分原因。
