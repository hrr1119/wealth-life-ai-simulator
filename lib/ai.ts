import type {
  ActionCategory,
  OpportunityCard,
  RiskLevel,
} from "./types.ts";

export interface OpportunityAIContext {
  turn: number;
  maxTurns: number;
  city: string;
  cycle: string;
  roleName: string;
  cash: number;
  monthlyIncome: number;
  fixedExpense: number;
  energy: number;
  relationship: number;
  skills: string[];
  memories: string[];
}

export interface OpportunityGenerationResult {
  intent: string;
  normalizedGoal: string;
  cards: OpportunityCard[];
  ruleMapping: string[];
  source: "openai" | "local";
  model?: string;
}

interface AIResponseCard {
  strategy: "pilot" | "build" | "partner";
  title: string;
  approach: string;
  category: ActionCategory;
  description: string;
  duration: "4–8 周" | "3–6 个月" | "6–12 个月";
  costBand: "low" | "medium" | "high";
  timeBand: "light" | "focused" | "intensive";
  risk: RiskLevel;
  skillTags: string[];
  environmentTags: string[];
  upside: string;
  downside: string;
}

interface AIResponsePayload {
  normalizedGoal: string;
  cards: AIResponseCard[];
}

const CATEGORIES: ActionCategory[] = [
  "career",
  "learning",
  "income",
  "investment",
  "family",
  "relationship",
  "wellbeing",
  "opportunity",
];

const RISKS: RiskLevel[] = ["低", "中", "高", "极高"];

const OPPORTUNITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["normalizedGoal", "cards"],
  properties: {
    normalizedGoal: { type: "string", minLength: 8, maxLength: 120 },
    cards: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "strategy",
          "title",
          "approach",
          "category",
          "description",
          "duration",
          "costBand",
          "timeBand",
          "risk",
          "skillTags",
          "environmentTags",
          "upside",
          "downside",
        ],
        properties: {
          strategy: { type: "string", enum: ["pilot", "build", "partner"] },
          title: { type: "string", minLength: 4, maxLength: 36 },
          approach: { type: "string", minLength: 2, maxLength: 18 },
          category: { type: "string", enum: CATEGORIES },
          description: { type: "string", minLength: 20, maxLength: 220 },
          duration: { type: "string", enum: ["4–8 周", "3–6 个月", "6–12 个月"] },
          costBand: { type: "string", enum: ["low", "medium", "high"] },
          timeBand: { type: "string", enum: ["light", "focused", "intensive"] },
          risk: { type: "string", enum: RISKS },
          skillTags: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: { type: "string", minLength: 1, maxLength: 32 },
          },
          environmentTags: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1, maxLength: 32 },
          },
          upside: { type: "string", minLength: 12, maxLength: 140 },
          downside: { type: "string", minLength: 12, maxLength: 140 },
        },
      },
    },
  },
} as const;

const STRATEGY_RULES = {
  pilot: {
    baseProbability: 0.56,
    defaultRisk: "低" as RiskLevel,
    cashShare: { low: 0.035, medium: 0.07, high: 0.11 },
    time: { light: 1, focused: 2, intensive: 3 },
    energyMultiplier: 3,
  },
  build: {
    baseProbability: 0.5,
    defaultRisk: "中" as RiskLevel,
    cashShare: { low: 0.08, medium: 0.16, high: 0.25 },
    time: { light: 2, focused: 3, intensive: 4 },
    energyMultiplier: 4,
  },
  partner: {
    baseProbability: 0.46,
    defaultRisk: "高" as RiskLevel,
    cashShare: { low: 0.06, medium: 0.12, high: 0.2 },
    time: { light: 2, focused: 3, intensive: 4 },
    energyMultiplier: 4,
  },
} as const;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function cleanTags(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const tags = value
    .map((item) => cleanText(item, 32))
    .filter(Boolean)
    .slice(0, 5);
  return tags.length ? [...new Set(tags)] : fallback;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function extractOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  throw new Error("AI 响应没有返回结构化文本。");
}

function parsePayload(text: string): AIResponsePayload {
  const parsed = JSON.parse(text) as Partial<AIResponsePayload>;
  if (!parsed || !Array.isArray(parsed.cards) || parsed.cards.length !== 3) {
    throw new Error("AI 返回的机会卡数量不符合规则。");
  }
  const strategies = new Set(parsed.cards.map((card) => card.strategy));
  if (!strategies.has("pilot") || !strategies.has("build") || !strategies.has("partner")) {
    throw new Error("AI 返回的策略层级不完整。");
  }
  return parsed as AIResponsePayload;
}

function toRuleCard(
  raw: AIResponseCard,
  intent: string,
  context: OpportunityAIContext,
): OpportunityCard {
  const strategy = STRATEGY_RULES[raw.strategy];
  const risk = RISKS.includes(raw.risk) ? raw.risk : strategy.defaultRisk;
  const category = CATEGORIES.includes(raw.category) ? raw.category : "opportunity";
  const cashFloor = raw.strategy === "pilot" ? 1_000 : raw.strategy === "build" ? 3_000 : 2_000;
  const cashCeiling = Math.max(cashFloor, Math.min(context.cash * 0.35, 45_000));
  const cashCost = Math.round(
    Math.min(
      cashCeiling,
      Math.max(cashFloor, context.cash * strategy.cashShare[raw.costBand]),
    ) / 500,
  ) * 500;
  const timeCost = strategy.time[raw.timeBand];
  const riskPenalty = { 低: 0.02, 中: 0, 高: -0.05, 极高: -0.1 }[risk];
  const energyFactor = Math.max(-0.04, Math.min(0.04, (context.energy - 60) / 1_000));
  const baseProbability = Math.max(
    0.16,
    Math.min(0.78, strategy.baseProbability + riskPenalty + energyFactor),
  );
  return {
    id: `opp-ai-${raw.strategy}-${Math.abs(hashString(`${intent}-${raw.title}`)).toString(36)}`,
    title: cleanText(raw.title, 36) || `${cleanText(raw.approach, 18)} · 现实行动`,
    approach: cleanText(raw.approach, 18) || "结构化尝试",
    category,
    description: cleanText(raw.description, 220),
    duration: raw.duration,
    cashCost,
    timeCost,
    energyCost: Math.min(24, timeCost * strategy.energyMultiplier),
    baseProbability,
    risk,
    skillTags: cleanTags(raw.skillTags, ["research", "communication"]),
    environmentTags: cleanTags(raw.environmentTags, ["互联网"]),
    upside: cleanText(raw.upside, 140),
    downside: cleanText(raw.downside, 140),
    sourceIntent: intent,
  };
}

function buildPrompt(intent: string, context: OpportunityAIContext): string {
  return [
    "你是《财富人生》的机会理解器，不是裁判。",
    "把玩家的开放式行动拆成三种现实策略：低成本试水、系统化建设、寻找合作伙伴。",
    "你只能描述行动、技能、环境、潜在上行与失败代价。",
    "不要决定成功或失败，不要给出成功概率，不要直接加钱，不要绕过现金、时间或精力限制。",
    `玩家想法：${intent}`,
    `当前人生：${context.roleName}，第 ${context.turn}/${context.maxTurns} 阶段，城市 ${context.city}，周期 ${context.cycle}`,
    `资源：现金 ${Math.round(context.cash)}，月收入 ${Math.round(context.monthlyIncome)}，固定支出 ${Math.round(context.fixedExpense)}，精力 ${Math.round(context.energy)}，关系 ${Math.round(context.relationship)}`,
    `已知技能：${context.skills.slice(0, 12).join("、") || "暂无明确技能证据"}`,
    `关键记忆：${context.memories.slice(-10).join("、") || "开局"}`,
    "三张卡必须明显不同，并与玩家经历、当前资源和城市环境直接相关。",
  ].join("\n");
}

export async function generateOpportunityCardsWithAI(
  intentInput: string,
  context: OpportunityAIContext,
  options: {
    apiKey: string;
    model?: string;
    fetcher?: typeof fetch;
  },
): Promise<OpportunityGenerationResult> {
  const intent = cleanText(intentInput, 240);
  if (intent.length < 4) throw new Error("请至少用一句完整的话描述你的想法。");
  if (!options.apiKey) throw new Error("真实 AI 尚未配置服务端密钥。");
  const model = options.model || "gpt-5-mini";
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "输出必须符合 JSON Schema。叙事可以有情绪，但所有数值裁决都留给游戏规则引擎。",
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildPrompt(intent, context) }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "wealth_life_opportunity_cards",
          strict: true,
          schema: OPPORTUNITY_SCHEMA,
        },
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`真实 AI 请求失败（${response.status}）：${body.slice(0, 180)}`);
  }
  const rawResponse = (await response.json()) as Record<string, unknown>;
  const payload = parsePayload(extractOutputText(rawResponse));
  const cards = payload.cards.map((card) => toRuleCard(card, intent, context));
  return {
    intent,
    normalizedGoal: cleanText(payload.normalizedGoal, 120),
    cards,
    source: "openai",
    model,
    ruleMapping: [
      `生成来源：真实 AI（${model}）`,
      "AI职责：理解意图、结合经历生成结构化候选卡",
      "规则职责：映射现金、时间、精力与基础概率",
      "裁决边界：最终成功率、随机落点和资产变化只由规则引擎计算",
    ],
  };
}
