# 推荐流与展示流大规模数据验证报告

执行日期：2026-05-12
测试批次：`rdisp_mp2lkdct_82d2ca`
测试入口：`http://127.0.0.1:3001`

## 1. 测试目标

本次测试通过直接写入一批带有明确兴趣标签、作者质量、AI 评分、审核状态和推荐事件的数据，验证当前用户画像、AI 评分、推荐排序和公开展示过滤是否能够形成预期效果。

## 2. 数据规模

- 画像用户：3
- 作者用户：36
- 文章总数：291
- 公开或低优先级文章：255
- 低优先级文章：37
- 非公开文章：36
- 推荐事件：1021
- 已看记录：1

## 3. 验证结果

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| LOGIN-data_viewer | 通过 | 数据型用户 can login |
| PROFILE-data_viewer | 通过 | 数据型用户 profile contains expected tags |
| RECO-data_viewer | 通过 | 数据型用户 recommendation is personalized |
| LOGIN-life_viewer | 通过 | 生活型用户 can login |
| PROFILE-life_viewer | 通过 | 生活型用户 profile contains expected tags |
| RECO-life_viewer | 通过 | 生活型用户 recommendation is personalized |
| LOGIN-security_viewer | 通过 | 安全型用户 can login |
| PROFILE-security_viewer | 通过 | 安全型用户 profile contains expected tags |
| RECO-security_viewer | 通过 | 安全型用户 recommendation is personalized |
| RECO-DIVERGENCE | 通过 | different profiles produce different recommendation topic sets |
| DISPLAY-PUBLIC-FILTER | 通过 | public article display only returns public batch statuses |
| RECO-SEEN-PENALTY | 通过 | seen penalty lowers an otherwise comparable article |
| RECO-PRESSURE-LARGE-DATA | 通过 | recommended feed remains stable with generated large dataset |

## 4. 画像与推荐观察

### 4.1 用户画像 Top 标签

```json
{
  "data_viewer": {
    "topTags": [
      "数据分析",
      "AI模型",
      "后端架构",
      "微服务",
      "内容治理",
      "社区运营",
      "旅行记录",
      "生活方式",
      "游戏讨论",
      "前端体验"
    ],
    "updatedFromEvents": 315
  },
  "life_viewer": {
    "topTags": [
      "社区运营",
      "产品设计",
      "旅行记录",
      "生活方式",
      "影像评论",
      "前端体验",
      "安全审计",
      "金融观察",
      "内容治理",
      "数据分析"
    ],
    "updatedFromEvents": 401
  },
  "security_viewer": {
    "topTags": [
      "后端架构",
      "安全审计",
      "数据分析",
      "金融观察",
      "微服务",
      "内容治理",
      "社区运营",
      "游戏讨论",
      "生活方式",
      "前端体验"
    ],
    "updatedFromEvents": 305
  }
}
```

### 4.2 推荐 Top10 样本

```json
{
  "data_viewer": [
    {
      "id": 310,
      "topic": "data",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.4967,
      "tagMatch": 1.8561,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "AI模型",
        "后端架构"
      ]
    },
    {
      "id": 599,
      "topic": "data",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.4967,
      "tagMatch": 1.8561,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "AI模型",
        "后端架构"
      ]
    },
    {
      "id": 346,
      "topic": "data",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.4967,
      "tagMatch": 1.8561,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "AI模型",
        "后端架构"
      ]
    },
    {
      "id": 382,
      "topic": "data",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.4967,
      "tagMatch": 1.8561,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "AI模型",
        "后端架构"
      ]
    },
    {
      "id": 418,
      "topic": "data",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.4967,
      "tagMatch": 1.8561,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "AI模型",
        "后端架构"
      ]
    },
    {
      "id": 313,
      "topic": "ai",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 15.8926,
      "tagMatch": 1.5662,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "内容治理",
        "数据分析",
        "AI模型"
      ]
    },
    {
      "id": 349,
      "topic": "ai",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 15.8926,
      "tagMatch": 1.5662,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "内容治理",
        "数据分析",
        "AI模型"
      ]
    },
    {
      "id": 385,
      "topic": "ai",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 15.8926,
      "tagMatch": 1.5662,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "内容治理",
        "数据分析",
        "AI模型"
      ]
    },
    {
      "id": 421,
      "topic": "ai",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 15.8926,
      "tagMatch": 1.5662,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "内容治理",
        "数据分析",
        "AI模型"
      ]
    },
    {
      "id": 311,
      "topic": "data",
      "status": "PUBLISHED",
      "authorTier": "mid",
      "total": 15.7783,
      "tagMatch": 1.8561,
      "authorQuality": 0.46,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "AI模型",
        "后端架构"
      ]
    }
  ],
  "life_viewer": [
    {
      "id": 328,
      "topic": "travel",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 16.1678,
      "tagMatch": 1.5909,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "社区运营",
        "旅行记录",
        "生活方式"
      ]
    },
    {
      "id": 331,
      "topic": "food",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 16.1678,
      "tagMatch": 1.5909,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "社区运营",
        "旅行记录",
        "生活方式"
      ]
    },
    {
      "id": 364,
      "topic": "travel",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 16.1678,
      "tagMatch": 1.5909,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "社区运营",
        "旅行记录",
        "生活方式"
      ]
    },
    {
      "id": 367,
      "topic": "food",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 16.1678,
      "tagMatch": 1.5909,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "社区运营",
        "旅行记录",
        "生活方式"
      ]
    },
    {
      "id": 400,
      "topic": "travel",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 16.1678,
      "tagMatch": 1.5909,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "社区运营",
        "旅行记录",
        "生活方式"
      ]
    },
    {
      "id": 403,
      "topic": "food",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 16.1678,
      "tagMatch": 1.5909,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "社区运营",
        "旅行记录",
        "生活方式"
      ]
    },
    {
      "id": 325,
      "topic": "design",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 15.513,
      "tagMatch": 1.3647,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "前端体验",
        "产品设计",
        "社区运营"
      ]
    },
    {
      "id": 361,
      "topic": "design",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 15.513,
      "tagMatch": 1.3647,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "前端体验",
        "产品设计",
        "社区运营"
      ]
    },
    {
      "id": 397,
      "topic": "design",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 15.513,
      "tagMatch": 1.3647,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "前端体验",
        "产品设计",
        "社区运营"
      ]
    },
    {
      "id": 334,
      "topic": "film",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 15.2629,
      "tagMatch": 1.3647,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "产品设计",
        "社区运营",
        "影像评论"
      ]
    }
  ],
  "security_viewer": [
    {
      "id": 319,
      "topic": "security",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.5221,
      "tagMatch": 1.8625,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "内容治理",
        "后端架构",
        "安全审计"
      ]
    },
    {
      "id": 355,
      "topic": "security",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.5221,
      "tagMatch": 1.8625,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "内容治理",
        "后端架构",
        "安全审计"
      ]
    },
    {
      "id": 391,
      "topic": "security",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.5221,
      "tagMatch": 1.8625,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "内容治理",
        "后端架构",
        "安全审计"
      ]
    },
    {
      "id": 427,
      "topic": "security",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.5221,
      "tagMatch": 1.8625,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "内容治理",
        "后端架构",
        "安全审计"
      ]
    },
    {
      "id": 340,
      "topic": "finance",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.2432,
      "tagMatch": 1.7927,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "安全审计",
        "金融观察"
      ]
    },
    {
      "id": 376,
      "topic": "finance",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.2432,
      "tagMatch": 1.7927,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "安全审计",
        "金融观察"
      ]
    },
    {
      "id": 412,
      "topic": "finance",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.2432,
      "tagMatch": 1.7927,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "安全审计",
        "金融观察"
      ]
    },
    {
      "id": 316,
      "topic": "backend",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.24,
      "tagMatch": 1.7928,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "后端架构",
        "微服务"
      ]
    },
    {
      "id": 352,
      "topic": "backend",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.24,
      "tagMatch": 1.7928,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "后端架构",
        "微服务"
      ]
    },
    {
      "id": 388,
      "topic": "backend",
      "status": "PUBLISHED",
      "authorTier": "high",
      "total": 17.24,
      "tagMatch": 1.7928,
      "authorQuality": 0.82,
      "riskPenalty": 0,
      "seenPenalty": 0,
      "tags": [
        "数据分析",
        "后端架构",
        "微服务"
      ]
    }
  ]
}
```

## 5. 结论

本批次验证全部通过。结果表明，在当前数据规模下，用户画像能够被历史推荐事件拉动，推荐流会根据画像标签、作者质量、AI 评分、风险惩罚和已看记录改变排序，公开展示流能够过滤非公开状态内容。

## 6. 原始文件

- `raw/recommendation-display-results.json`：完整原始结果、画像摘要、推荐样本和每个验证项细节。
- `scripts/run-recommendation-display-validation.mjs`：数据生成与验证脚本。

