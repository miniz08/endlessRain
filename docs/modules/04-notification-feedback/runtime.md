# 消息通知与处理结果反馈功能运行机制文档

## 通知生成机制

通知由业务动作触发，而不是由通知中心主动扫描生成。当前主要触发点包括：

- 文章审核完成后调用 `notifyArticleReviewResult`。
- 评论创建后调用 `notifyCommentCreated`。
- 文章 emoji 添加后调用 `notifyArticleReaction`。
- 评论 emoji 添加后调用 `notifyCommentReaction`。
- 关注成功后调用 `notifyFollowed`。

图表参考：[评论、reaction 与通知流程](../../diagrams/modules/social-feedback-flow.mmd)。

## 通知读取机制

用户进入通知中心后，前端调用通知列表接口和未读数量接口。通知按 `id` 倒序返回，未读通知通过 `readAt IS NULL` 判断。用户点击通知或手动标记已读时，系统写入 `readAt` 时间。

## 自触发过滤

系统会避免用户自己给自己发送通知。例如，用户评论自己的文章、对自己的文章添加 emoji、对自己的评论添加 emoji 时，不生成通知。这能减少通知中心噪声。

## 审核反馈边界

通知中心只向用户反馈“可理解的结果”，例如审核通过、低优先级、复核或拒绝，不暴露模型内部 prompt 或复杂判定过程。详细原因以 `reviewReason` 和 `reviewSuggestion` 的摘要形式展示。

## 与其他模块协作

- 内容模块提供文章审核结果。
- 互动模块提供评论、回复、emoji 和关注事件。
- 前端布局通过未读数量在导航栏展示提醒。
- 审计模块仍负责记录操作过程，通知模块负责用户反馈。

