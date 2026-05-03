export type TagCategory = {
  code: string;
  name: string;
  description: string;
  tags: string[];
};

export const TAG_TAXONOMY: TagCategory[] = [
  { code: "society", name: "社会民生", description: "公共生活、社会观察与民生议题", tags: ["公共服务", "城市治理", "社区生活", "社会观察", "民生保障", "公共安全"] },
  { code: "politics", name: "时政公共", description: "政策、公共事务和治理话题", tags: ["政策解读", "国际关系", "地方治理", "公共议题", "行政服务", "法治建设"] },
  { code: "finance", name: "财经商业", description: "经济、产业、投资与消费", tags: ["宏观经济", "股票基金", "创业商业", "消费观察", "产业趋势", "个人理财"] },
  { code: "technology", name: "科技数码", description: "硬件、软件、互联网和前沿科技", tags: ["人工智能", "软件开发", "数码产品", "网络安全", "云计算", "开源社区"] },
  { code: "education", name: "教育学习", description: "学校教育、考试、学习方法", tags: ["升学考试", "学习方法", "校园生活", "职业教育", "在线课程", "学术写作"] },
  { code: "career", name: "职场就业", description: "求职、工作、团队和职业成长", tags: ["求职招聘", "职场沟通", "职业规划", "远程办公", "团队管理", "劳动权益"] },
  { code: "health", name: "健康医疗", description: "健康科普、医疗体验和生活方式", tags: ["疾病科普", "心理健康", "运动康复", "饮食营养", "就医体验", "睡眠管理"] },
  { code: "lifestyle", name: "生活日常", description: "日常记录、经验分享和生活方式", tags: ["日常记录", "家居收纳", "亲子家庭", "宠物生活", "节日仪式", "生活妙招"] },
  { code: "food", name: "美食餐饮", description: "餐饮、烹饪、探店和食品安全", tags: ["家常菜谱", "餐厅探店", "咖啡茶饮", "烘焙甜品", "地方美食", "食品安全"] },
  { code: "travel", name: "旅行出行", description: "旅游、交通、攻略和城市体验", tags: ["旅行攻略", "城市漫步", "交通出行", "酒店民宿", "自然风光", "文化遗产"] },
  { code: "culture", name: "文化艺术", description: "艺术、展览、传统文化和审美", tags: ["传统文化", "展览演出", "艺术评论", "摄影创作", "设计审美", "非遗民俗"] },
  { code: "entertainment", name: "娱乐明星", description: "影视综艺、艺人和娱乐产业", tags: ["影视资讯", "综艺节目", "明星动态", "音乐现场", "娱乐评论", "粉丝文化"] },
  { code: "sports", name: "体育运动", description: "赛事、训练和运动文化", tags: ["足球篮球", "跑步健身", "电竞赛事", "户外运动", "运动装备", "赛事评论"] },
  { code: "games", name: "游戏动漫", description: "游戏、动漫、二次元和虚拟内容", tags: ["电子游戏", "手游攻略", "动漫番剧", "同人创作", "虚拟主播", "游戏评测"] },
  { code: "science", name: "科学科普", description: "自然科学、科普和科学方法", tags: ["天文宇宙", "生命科学", "物理化学", "地理环境", "科学史", "科普辟谣"] },
  { code: "environment", name: "环境生态", description: "环保、气候、生物和可持续", tags: ["气候变化", "环保行动", "野生动物", "能源转型", "垃圾分类", "生态保护"] },
  { code: "law", name: "法律合规", description: "法律常识、案例与合规讨论", tags: ["民法常识", "刑法案例", "知识产权", "消费者权益", "合同纠纷", "网络法规"] },
  { code: "history", name: "历史人文", description: "历史事件、人物、文献和人文研究", tags: ["中国史", "世界史", "历史人物", "考古文物", "地方志", "历史争议"] },
  { code: "emotion", name: "情感关系", description: "亲密关系、友情、家庭和情绪表达", tags: ["恋爱关系", "婚姻家庭", "友情社交", "情绪表达", "自我成长", "沟通边界"] },
  { code: "opinion", name: "观点评论", description: "观点表达、评论和论证", tags: ["理性讨论", "个人观点", "深度评论", "争议话题", "事实核查", "价值判断"] },
  { code: "local", name: "本地城市", description: "城市资讯、本地服务与区域生活", tags: ["本地新闻", "城市活动", "租房买房", "交通提醒", "便民信息", "商圈消费"] },
  { code: "media", name: "媒体传播", description: "新闻、平台、内容生产和传播", tags: ["新闻报道", "媒体素养", "内容创作", "平台生态", "舆情观察", "传播策略"] },
  { code: "security", name: "安全风险", description: "安全事件、风险提示和防护知识", tags: ["诈骗防范", "账号安全", "隐私保护", "应急避险", "数据泄露", "风险预警"] },
  { code: "product", name: "产品体验", description: "产品、服务、体验和用户反馈", tags: ["产品评测", "用户体验", "功能建议", "服务投诉", "品牌观察", "购买决策"] },
  { code: "reading", name: "阅读写作", description: "书籍、写作、知识整理和表达", tags: ["读书笔记", "小说文学", "写作技巧", "知识管理", "出版编辑", "诗歌散文"] },
  { code: "music", name: "音乐音频", description: "音乐、播客、声音和乐器", tags: ["音乐推荐", "乐器学习", "播客节目", "音乐制作", "现场演出", "歌词赏析"] },
  { code: "film", name: "影视戏剧", description: "电影、剧集、戏剧与影像分析", tags: ["电影评论", "剧集讨论", "纪录片", "戏剧舞台", "演员表演", "影像技术"] },
  { code: "fashion", name: "时尚美妆", description: "穿搭、美妆、审美和个护", tags: ["穿搭分享", "护肤美妆", "发型个护", "潮流趋势", "香水香氛", "可持续时尚"] },
  { code: "auto", name: "汽车交通", description: "汽车、交通工具和出行产业", tags: ["新能源车", "汽车评测", "用车养车", "交通法规", "公共交通", "智能驾驶"] },
  { code: "realestate", name: "房产居住", description: "房产、租住、装修和城市居住", tags: ["租房经验", "买房置业", "装修设计", "物业服务", "居住安全", "社区配套"] },
  { code: "agriculture", name: "农业乡村", description: "农业生产、乡村生活和农产品", tags: ["乡村振兴", "农产品", "种植养殖", "农村生活", "农业科技", "粮食安全"] },
  { code: "military", name: "军事国防", description: "军事科普、国防和装备讨论", tags: ["军事科普", "国防教育", "装备技术", "国际安全", "军史知识", "救援行动"] },
  { code: "religion", name: "宗教哲学", description: "宗教文化、哲学思考和伦理讨论", tags: ["哲学思考", "伦理讨论", "宗教文化", "人生意义", "逻辑思辨", "思想史"] },
  { code: "charity", name: "公益慈善", description: "公益行动、志愿服务和社会支持", tags: ["志愿服务", "公益项目", "捐助救援", "弱势关怀", "无障碍", "社会组织"] },
  { code: "government", name: "政务服务", description: "办事流程、政策服务和公共平台", tags: ["办事指南", "社保医保", "证件办理", "税务服务", "公共热线", "政策申请"] },
  { code: "international", name: "国际视野", description: "海外生活、国际资讯和跨文化", tags: ["海外生活", "留学移民", "跨文化", "国际新闻", "全球市场", "语言学习"] },
  { code: "parenting", name: "亲子育儿", description: "育儿经验、家庭教育和儿童成长", tags: ["婴幼儿护理", "儿童教育", "家庭陪伴", "亲子活动", "青少年成长", "育儿争议"] },
  { code: "eldercare", name: "养老照护", description: "老年生活、照护服务和养老议题", tags: ["养老服务", "老年健康", "家庭照护", "适老化", "退休生活", "银发科技"] },
  { code: "women", name: "女性议题", description: "女性生活、权益、健康和成长", tags: ["女性健康", "职场女性", "性别平等", "亲密安全", "自我成长", "女性消费"] },
  { code: "youth", name: "青年成长", description: "青年文化、学习、就业和心理", tags: ["青年文化", "校园成长", "就业焦虑", "兴趣社群", "青年表达", "人生选择"] },
  { code: "accessibility", name: "无障碍包容", description: "残障权益、包容设计和辅助技术", tags: ["辅助技术", "无障碍设计", "残障权益", "包容教育", "字幕手语", "出行便利"] },
  { code: "language", name: "语言文字", description: "语言学习、翻译、文字和表达", tags: ["英语学习", "日语韩语", "翻译实践", "汉语文字", "方言文化", "表达训练"] },
  { code: "data", name: "数据分析", description: "数据、统计、可视化和方法论", tags: ["数据可视化", "统计方法", "数据新闻", "商业分析", "数据治理", "实验评估"] },
  { code: "ai", name: "人工智能", description: "AI 模型、应用、伦理和产业", tags: ["大语言模型", "AI应用", "提示词工程", "AI伦理", "模型评测", "智能体"] },
  { code: "programming", name: "编程开发", description: "软件工程、编程语言和开发实践", tags: ["前端开发", "后端开发", "数据库", "DevOps", "代码质量", "架构设计"] },
  { code: "hardware", name: "硬件电子", description: "电子硬件、芯片、设备和 DIY", tags: ["芯片半导体", "嵌入式", "硬件DIY", "智能设备", "机器人", "维修拆解"] },
  { code: "marketing", name: "营销运营", description: "增长、运营、品牌和市场传播", tags: ["品牌营销", "内容运营", "用户增长", "活动策划", "私域运营", "商业变现"] },
  { code: "design", name: "设计创意", description: "视觉、交互、品牌和创意实践", tags: ["平面设计", "交互设计", "品牌视觉", "插画创作", "设计工具", "创意思维"] },
  { code: "risk", name: "内容风险", description: "平台治理、违规风险和安全表达", tags: ["攻击辱骂", "歧视偏见", "低俗色情", "违法犯罪", "虚假信息", "垃圾广告"] },
  { code: "platform", name: "平台治理", description: "账号、社区规则、内容分发和治理", tags: ["社区规则", "账号治理", "举报处理", "内容审核", "推荐机制", "创作者权益"] },
];

export type FlatTag = {
  categoryCode: string;
  categoryName: string;
  name: string;
};

export const FLAT_TAGS: FlatTag[] = TAG_TAXONOMY.flatMap((category) =>
  category.tags.map((name) => ({
    categoryCode: category.code,
    categoryName: category.name,
    name,
  })),
);

export function compactTaxonomyForPrompt(): string {
  return JSON.stringify(
    TAG_TAXONOMY.map((category) => ({
      category: category.name,
      tags: category.tags,
    })),
  );
}

export function findTag(name: string): FlatTag | undefined {
  return FLAT_TAGS.find((tag) => tag.name === name);
}

export function tagCount(): { categories: number; tags: number } {
  return {
    categories: TAG_TAXONOMY.length,
    tags: FLAT_TAGS.length,
  };
}
