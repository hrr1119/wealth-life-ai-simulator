import type { ActionCategory, OpportunityCard, RiskLevel } from "./types.ts";

interface IntentProfile {
  category: ActionCategory;
  normalizedGoal: string;
  skillTags: string[];
  environmentTags: string[];
  noun: string;
  verb: string;
}

const RULES: Array<{
  pattern: RegExp;
  category: ActionCategory;
  noun: string;
  verb: string;
  skills: string[];
  environment: string[];
}> = [
  {
    pattern: /俄语|英语|语言|翻译|跨境|外贸/,
    category: "learning",
    noun: "跨境能力",
    verb: "学习并验证",
    skills: ["russian", "communication", "trade"],
    environment: ["跨境"],
  },
  {
    pattern: /视频|博主|账号|自媒体|直播|摄影|写作|小说|内容/,
    category: "income",
    noun: "内容副业",
    verb: "制作并发布",
    skills: ["writing", "video", "communication"],
    environment: ["内容", "互联网"],
  },
  {
    pattern: /开店|餐饮|咖啡|宠物|电商|创业|公司|生意|工作室/,
    category: "income",
    noun: "小型经营项目",
    verb: "验证并经营",
    skills: ["operations", "sales", "accounting"],
    environment: ["经营"],
  },
  {
    pattern: /股票|基金|投资|理财|房产|买房|债券|黄金/,
    category: "investment",
    noun: "投资计划",
    verb: "研究并小额验证",
    skills: ["finance", "research", "risk"],
    environment: ["金融"],
  },
  {
    pattern: /转行|跳槽|工作|职业|程序员|设计师|老师|律师|医生/,
    category: "career",
    noun: "职业转型",
    verb: "建立作品与入场样本",
    skills: ["research", "communication", "delivery"],
    environment: ["互联网"],
  },
  {
    pattern: /课程|学习|技能|考证|编程|AI|人工智能|数据/,
    category: "learning",
    noun: "技能升级",
    verb: "学习并实践",
    skills: ["ai_literacy", "data", "delivery"],
    environment: ["互联网"],
  },
  {
    pattern: /结婚|家庭|孩子|父母|伴侣|恋爱|共同财务/,
    category: "family",
    noun: "家庭计划",
    verb: "沟通并建立规则",
    skills: ["communication", "parenting", "finance"],
    environment: ["公共"],
  },
  {
    pattern: /人脉|合作|合伙|朋友|客户|社交|谈判/,
    category: "relationship",
    noun: "合作网络",
    verb: "建立并验证信任",
    skills: ["negotiation", "communication", "law"],
    environment: ["经营"],
  },
  {
    pattern: /健康|健身|休息|焦虑|压力|旅行/,
    category: "wellbeing",
    noun: "身心恢复计划",
    verb: "建立可持续节奏",
    skills: ["fitness", "mindfulness"],
    environment: ["公共"],
  },
];

function cleanIntent(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 240);
}

function analyzeIntent(input: string): IntentProfile {
  const cleaned = cleanIntent(input);
  const matched = RULES.find((rule) => rule.pattern.test(cleaned));
  if (matched) {
    return {
      category: matched.category,
      normalizedGoal: `在不破坏当前现金流的前提下，${matched.verb}${matched.noun}`,
      skillTags: matched.skills,
      environmentTags: matched.environment,
      noun: matched.noun,
      verb: matched.verb,
    };
  }
  return {
    category: "opportunity",
    normalizedGoal: "把一个新想法拆成可验证、可承担、可复盘的现实行动",
    skillTags: ["research", "communication", "delivery"],
    environmentTags: ["互联网"],
    noun: "个人实验",
    verb: "拆解并验证",
  };
}

function makeCard(
  profile: IntentProfile,
  sourceIntent: string,
  suffix: string,
  approach: string,
  description: string,
  cashCost: number,
  timeCost: number,
  energyCost: number,
  baseProbability: number,
  risk: RiskLevel,
  upside: string,
  downside: string,
): OpportunityCard {
  return {
    id: `opp-${suffix}-${Math.abs(hashString(sourceIntent)).toString(36)}`,
    title: `${approach} · ${profile.noun}`,
    approach,
    category: profile.category,
    description,
    duration: timeCost <= 2 ? "4–8 周" : timeCost <= 4 ? "3–6 个月" : "6–12 个月",
    cashCost,
    timeCost,
    energyCost,
    baseProbability,
    risk,
    skillTags: profile.skillTags,
    environmentTags: profile.environmentTags,
    upside,
    downside,
    sourceIntent,
  };
}

export function generateOpportunityCards(input: string): {
  intent: string;
  normalizedGoal: string;
  cards: OpportunityCard[];
  ruleMapping: string[];
} {
  const sourceIntent = cleanIntent(input);
  if (sourceIntent.length < 4) {
    throw new Error("请至少用一句完整的话描述你的想法。");
  }
  const profile = analyzeIntent(sourceIntent);
  const cards = [
    makeCard(
      profile,
      sourceIntent,
      "pilot",
      "低成本试水",
      `保留当前主业与必要支出，用一个最小项目测试“${sourceIntent}”是否存在真实需求。先获得样本，再决定是否追加投入。`,
      3_000,
      2,
      8,
      0.48,
      "低",
      "你获得第一批真实反馈，并形成一条小规模收入或职业样本。",
      "样本没有证明需求，但失败成本可控，避免了更大的不可逆投入。",
    ),
    makeCard(
      profile,
      sourceIntent,
      "build",
      "系统化建设",
      `为“${profile.noun}”制定 3–6 个月计划，投入工具、课程或作品集，并设置阶段复盘点。回报更高，机会成本也更明确。`,
      12_000,
      4,
      16,
      0.58,
      "中",
      "能力、作品与客户验证形成组合，月收入结构开始变化。",
      "投入没有及时转化为结果，现金与精力被占用，需要决定继续、调整或停止。",
    ),
    makeCard(
      profile,
      sourceIntent,
      "partner",
      "寻找合作伙伴",
      `寻找拥有互补能力或渠道的人共同推进“${profile.noun}”。先确认分工、出资、知识产权、分成和退出机制。`,
      8_000,
      3,
      12,
      0.52,
      "高",
      "互补资源提高了执行速度，也打开新的关系与后续事件。",
      "合作边界或节奏出现分歧，除了项目损失，还会影响信用与关系。",
    ),
  ];
  return {
    intent: sourceIntent,
    normalizedGoal: profile.normalizedGoal,
    cards,
    ruleMapping: [
      `行动类别：${profile.category}`,
      `相关技能：${profile.skillTags.join("、")}`,
      `环境原子：${profile.environmentTags.join("、")}`,
      "裁决边界：AI只生成候选卡，现金、技能、环境与随机结果由规则引擎计算",
    ],
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}
