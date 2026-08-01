import { ASSETS, SKILLS } from "./content.ts";
import type { AssetDefinition, CareerDefinition, GameState, HeldAsset } from "./types.ts";

export interface SkillPrerequisite {
  skillId: string;
  level: number;
}

export interface SkillCombination {
  id: string;
  name: string;
  description: string;
  skillIds: string[];
  minimumLevel: number;
  probabilityBonus: number;
  tags: string[];
}

export interface CareerReadinessSkill {
  id: string;
  name: string;
  current: number;
  required: number;
  ready: boolean;
}

export interface CareerReadiness {
  score: number;
  label: "准备不足" | "可以试探" | "证据成形" | "高度匹配";
  skillCoverage: number;
  transferableCoverage: number;
  runwayCoverage: number;
  marketCoverage: number;
  requiredLevel: number;
  skills: CareerReadinessSkill[];
  blockers: string[];
  strengths: string[];
}

export interface PortfolioAllocation {
  category: string;
  value: number;
  share: number;
}

export interface PortfolioDiagnostics {
  totalValue: number;
  totalCost: number;
  unrealizedGain: number;
  weightedLiquidity: number;
  weightedVolatility: number;
  highRiskShare: number;
  largestPositionShare: number;
  diversificationScore: number;
  allocations: PortfolioAllocation[];
  warnings: string[];
}

export interface AssetSaleQuote {
  assetId: string;
  fraction: number;
  grossValue: number;
  haircutRate: number;
  netProceeds: number;
  costBasisReleased: number;
  realizedGain: number;
  timeCost: number;
  liquidity: number;
}

export const SKILL_PREREQUISITES: Record<string, SkillPrerequisite[]> = {
  math: [{ skillId: "data", level: 0.75 }],
  management: [
    { skillId: "communication", level: 1 },
    { skillId: "operations", level: 1 },
  ],
  leadership: [
    { skillId: "communication", level: 1.5 },
    { skillId: "management", level: 1.5 },
  ],
  valuation: [
    { skillId: "finance", level: 1 },
    { skillId: "research", level: 1 },
  ],
  portfolio: [
    { skillId: "finance", level: 1.5 },
    { skillId: "risk", level: 1 },
  ],
  automation: [
    { skillId: "office", level: 1 },
    { skillId: "coding", level: 0.75 },
  ],
  compliance: [
    { skillId: "law", level: 1 },
    { skillId: "accounting", level: 1 },
  ],
  tax: [{ skillId: "accounting", level: 1 }],
  trade: [
    { skillId: "english", level: 1 },
    { skillId: "logistics", level: 0.75 },
  ],
  seo: [
    { skillId: "writing", level: 1 },
    { skillId: "marketing", level: 0.75 },
  ],
  community_ops: [
    { skillId: "communication", level: 1 },
    { skillId: "service", level: 0.75 },
  ],
};

export const SKILL_COMBINATIONS: SkillCombination[] = [
  { id: "evidence-investor", name: "证据型投资者", description: "用研究和风险边界约束金融判断。", skillIds: ["finance", "research", "risk"], minimumLevel: 1.5, probabilityBonus: 0.025, tags: ["投资", "尽调"] },
  { id: "product-builder", name: "产品建造者", description: "把需求、技术与表达组合成可运行产品。", skillIds: ["product", "coding", "design"], minimumLevel: 1.25, probabilityBonus: 0.025, tags: ["互联网", "产品"] },
  { id: "independent-operator", name: "独立经营者", description: "从获客、议价到交付形成完整商业闭环。", skillIds: ["sales", "negotiation", "delivery"], minimumLevel: 1.5, probabilityBonus: 0.025, tags: ["客户", "经营"] },
  { id: "content-engine", name: "内容增长引擎", description: "让创作、传播和转化不再彼此分离。", skillIds: ["writing", "video", "marketing"], minimumLevel: 1.25, probabilityBonus: 0.02, tags: ["内容", "平台"] },
  { id: "business-controller", name: "经营控制塔", description: "同时看见流程、利润、现金和组织责任。", skillIds: ["operations", "accounting", "management"], minimumLevel: 1.5, probabilityBonus: 0.025, tags: ["经营", "管理"] },
  { id: "crossborder-stack", name: "跨境履约栈", description: "语言、贸易与物流共同降低跨境摩擦。", skillIds: ["russian", "trade", "logistics"], minimumLevel: 1.25, probabilityBonus: 0.025, tags: ["跨境", "交付"] },
  { id: "trusted-advisor", name: "可信顾问", description: "把金融、合同与沟通转化为可承担的建议。", skillIds: ["finance", "law", "communication"], minimumLevel: 1.5, probabilityBonus: 0.02, tags: ["专业", "信用"] },
  { id: "automation-leverage", name: "自动化杠杆", description: "用代码、数据与自动化降低重复成本。", skillIds: ["coding", "data", "automation"], minimumLevel: 1.5, probabilityBonus: 0.025, tags: ["技术", "效率"] },
  { id: "family-resilience", name: "家庭韧性", description: "让沟通、心理与照护形成稳定支持系统。", skillIds: ["communication", "psychology", "parenting"], minimumLevel: 1.25, probabilityBonus: 0.02, tags: ["家庭", "关系"] },
  { id: "sustainable-energy", name: "可持续精力", description: "体能与压力调节共同保护长期判断。", skillIds: ["fitness", "mindfulness"], minimumLevel: 1.5, probabilityBonus: 0.015, tags: ["健康", "恢复"] },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function skillName(id: string): string {
  return SKILLS.find((skill) => skill.id === id)?.name ?? id;
}

export function getMasteryBand(level: number): "未接触" | "入门" | "可实践" | "熟练" | "精通" | "专家" {
  if (level <= 0) return "未接触";
  if (level < 1) return "入门";
  if (level < 2) return "可实践";
  if (level < 3) return "熟练";
  if (level < 4) return "精通";
  return "专家";
}

export function getSkillPrerequisites(skillId: string): SkillPrerequisite[] {
  return (SKILL_PREREQUISITES[skillId] ?? []).map((item) => ({ ...item }));
}

export function getUnmetSkillPrerequisites(skills: Record<string, number>, skillId: string): SkillPrerequisite[] {
  return getSkillPrerequisites(skillId).filter((item) => (skills[item.skillId] ?? 0) < item.level);
}

export function getActiveSkillCombinations(
  skills: Record<string, number>,
  relevantSkillIds: string[] = [],
): SkillCombination[] {
  return SKILL_COMBINATIONS.filter(
    (combination) =>
      (!relevantSkillIds.length || combination.skillIds.some((id) => relevantSkillIds.includes(id))) &&
      combination.skillIds.every((id) => (skills[id] ?? 0) >= combination.minimumLevel),
  ).map((combination) => ({ ...combination, skillIds: [...combination.skillIds], tags: [...combination.tags] }));
}

export function getSkillSynergyBonus(skills: Record<string, number>, relevantSkillIds: string[]): number {
  return clamp(
    getActiveSkillCombinations(skills, relevantSkillIds).reduce((sum, combination) => sum + combination.probabilityBonus, 0),
    0,
    0.06,
  );
}

export function getCareerRequiredLevel(career: CareerDefinition): number {
  if (career.monthlyIncome >= 24_000 || career.entryCost >= 50_000) return 2.2;
  if (career.monthlyIncome >= 18_000 || career.entryCost >= 18_000) return 1.6;
  if (career.monthlyIncome >= 13_000) return 1.2;
  return 0.8;
}

export function getCareerReadiness(state: GameState, career: CareerDefinition): CareerReadiness {
  const requiredLevel = getCareerRequiredLevel(career);
  const skills = career.requiredSkills.map((id) => {
    const current = state.skills[id] ?? 0;
    return { id, name: skillName(id), current, required: requiredLevel, ready: current >= requiredLevel };
  });
  const skillCoverage = skills.length
    ? skills.reduce((sum, item) => sum + clamp(item.current / item.required, 0, 1), 0) / skills.length
    : 0.5;
  const careerTags = new Set(career.tags);
  const transferable = SKILLS.filter((skill) =>
    skill.tags.some((tag) => careerTags.has(tag)) && (state.skills[skill.id] ?? 0) >= 1,
  );
  const transferableCoverage = clamp(transferable.length / 3, 0, 1);
  const runwayCoverage = clamp(state.cash / Math.max(1, career.entryCost * 1.5), 0, 1);
  const marketKey = Object.keys(state.world.industryTrend).find((tag) => career.tags.includes(tag));
  const marketTrend = marketKey ? state.world.industryTrend[marketKey] : 1;
  const marketCoverage = clamp((marketTrend - 0.55) / 0.9, 0, 1);
  const evidenceCount = career.tags.reduce((sum, tag) => sum + Math.min(1, state.memory[tag] ?? 0), 0);
  const evidenceCoverage = clamp(evidenceCount / Math.max(1, career.tags.length), 0, 1);
  const energyCoverage = clamp((state.energy - 25) / 65, 0, 1);
  const score = clamp(
    skillCoverage * 0.46 +
      transferableCoverage * 0.11 +
      runwayCoverage * 0.15 +
      marketCoverage * 0.11 +
      evidenceCoverage * 0.08 +
      energyCoverage * 0.09,
    0,
    1,
  );
  const blockers = [
    ...skills.filter((item) => item.current < item.required * 0.5).map((item) => `${item.name}至少需要 ${Math.max(0.5, item.required * 0.5).toFixed(1)}`),
    ...(state.cash < career.entryCost ? [`转型现金缺口 ${Math.round(career.entryCost - state.cash)}`] : []),
    ...(state.energy < 35 ? ["当前精力不足以承担转型"] : []),
  ];
  const strengths = [
    ...skills.filter((item) => item.ready).map((item) => `${item.name}达到目标熟练度`),
    ...(transferable.length ? [`${transferable.length} 项可迁移技能形成旁证`] : []),
    ...(runwayCoverage >= 1 ? ["转型现金缓冲充足"] : []),
    ...(marketCoverage >= 0.6 ? ["行业环境提供顺风"] : []),
  ];
  const label = score >= 0.82 ? "高度匹配" : score >= 0.64 ? "证据成形" : score >= 0.44 ? "可以试探" : "准备不足";
  return { score, label, skillCoverage, transferableCoverage, runwayCoverage, marketCoverage, requiredLevel, skills, blockers, strengths };
}

function assetDefinition(asset: HeldAsset): AssetDefinition | undefined {
  return ASSETS.find((item) => item.id === asset.id);
}

export function getPortfolioDiagnostics(state: Pick<GameState, "assets">): PortfolioDiagnostics {
  const totalValue = state.assets.reduce((sum, asset) => sum + asset.value, 0);
  const totalCost = state.assets.reduce((sum, asset) => sum + asset.costBasis, 0);
  const allocationsMap = new Map<string, number>();
  let weightedLiquidity = 0;
  let weightedVolatility = 0;
  let highRiskValue = 0;
  let largestPositionShare = 0;
  let squaredShares = 0;
  for (const held of state.assets) {
    const definition = assetDefinition(held);
    const share = totalValue > 0 ? held.value / totalValue : 0;
    const liquidity = definition?.liquidity ?? 0.5;
    const volatility = definition?.volatility ?? 0.2;
    weightedLiquidity += share * liquidity;
    weightedVolatility += share * volatility;
    if (held.risk === "高" || held.risk === "极高") highRiskValue += held.value;
    largestPositionShare = Math.max(largestPositionShare, share);
    squaredShares += share * share;
    allocationsMap.set(held.category, (allocationsMap.get(held.category) ?? 0) + held.value);
  }
  const highRiskShare = totalValue > 0 ? highRiskValue / totalValue : 0;
  const diversificationScore = totalValue > 0 ? clamp(1 - squaredShares, 0, 1) : 0;
  const allocations = [...allocationsMap.entries()]
    .map(([category, value]) => ({ category, value, share: totalValue > 0 ? value / totalValue : 0 }))
    .sort((a, b) => b.value - a.value);
  const warnings = [
    ...(largestPositionShare > 0.55 ? [`单一持仓占比 ${Math.round(largestPositionShare * 100)}%，结果可能被一个判断主导`] : []),
    ...(highRiskShare > 0.5 ? [`高风险资产占比 ${Math.round(highRiskShare * 100)}%，回撤可能穿透现金计划`] : []),
    ...(totalValue > 0 && weightedLiquidity < 0.4 ? ["组合流动性偏低，急售时可能产生明显折价"] : []),
    ...(state.assets.length === 1 ? ["当前只有一项持仓，尚未形成分散"] : []),
  ];
  return {
    totalValue,
    totalCost,
    unrealizedGain: totalValue - totalCost,
    weightedLiquidity,
    weightedVolatility,
    highRiskShare,
    largestPositionShare,
    diversificationScore,
    allocations,
    warnings,
  };
}

export function getAssetSaleQuote(state: Pick<GameState, "assets" | "world">, assetId: string, fraction = 1): AssetSaleQuote | null {
  const held = state.assets.find((asset) => asset.id === assetId);
  if (!held) return null;
  const definition = assetDefinition(held);
  if (!definition) return null;
  const normalizedFraction = clamp(fraction, 0.01, 1);
  const grossValue = held.value * normalizedFraction;
  const cyclePenalty = state.world.cycle === "衰退" ? 0.08 : state.world.cycle === "放缓" ? 0.035 : 0;
  const transactionRate = definition.category === "房产" ? 0.04 : definition.category === "企业股权" ? 0.028 : 0.006;
  const haircutRate = clamp(transactionRate + (1 - definition.liquidity) * (0.035 + cyclePenalty), 0.004, 0.24);
  const netProceeds = grossValue * (1 - haircutRate);
  const costBasisReleased = held.costBasis * normalizedFraction;
  return {
    assetId,
    fraction: normalizedFraction,
    grossValue,
    haircutRate,
    netProceeds,
    costBasisReleased,
    realizedGain: netProceeds - costBasisReleased,
    timeCost: definition.liquidity < 0.4 ? 3 : definition.liquidity < 0.75 ? 2 : 1,
    liquidity: definition.liquidity,
  };
}
