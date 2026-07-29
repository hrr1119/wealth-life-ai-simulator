export type ModeId = "quick" | "standard";
export type ThemeId = "emerald" | "midnight" | "paper" | "terracotta";
export type YearPhase = "opening" | "planning" | "reveal" | "consequence" | "chapter";
export type ActionCategory =
  | "career"
  | "learning"
  | "income"
  | "investment"
  | "family"
  | "relationship"
  | "wellbeing"
  | "opportunity";
export type RiskLevel = "低" | "中" | "高" | "极高";
export type EventType =
  | "宏观"
  | "行业"
  | "职业"
  | "家庭"
  | "健康"
  | "关系"
  | "市场"
  | "机会"
  | "风险";

export interface ModeDefinition {
  id: ModeId;
  name: string;
  turns: number;
  opportunityTokens: number;
  description: string;
  duration: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  swatches: string[];
}

export interface RoleDefinition {
  id: string;
  name: string;
  category: string;
  story: string;
  monthlyIncome: number;
  fixedExpense: number;
  cash: number;
  debt: number;
  energy: number;
  health: number;
  happiness: number;
  credit: number;
  starterSkills: string[];
  riskBias: number;
}

export interface CareerDefinition {
  id: string;
  name: string;
  category: string;
  monthlyIncome: number;
  stability: number;
  stress: number;
  entryCost: number;
  requiredSkills: string[];
  tags: string[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  category: string;
  cost: number;
  timeCost: number;
  tags: string[];
  description: string;
}

export interface AssetDefinition {
  id: string;
  name: string;
  category: string;
  minimum: number;
  expectedAnnualReturn: number;
  cashYield: number;
  volatility: number;
  liquidity: number;
  risk: RiskLevel;
  tags: string[];
  description: string;
}

export interface HeldAsset {
  id: string;
  name: string;
  category: string;
  units: number;
  costBasis: number;
  value: number;
  cashYield: number;
  risk: RiskLevel;
}

export interface NumericEffects {
  cash?: number;
  monthlyIncome?: number;
  fixedExpense?: number;
  passiveIncome?: number;
  debt?: number;
  health?: number;
  energy?: number;
  happiness?: number;
  stress?: number;
  credit?: number;
  relationship?: number;
}

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  cost?: number;
  timeCost?: number;
  risk: RiskLevel;
  effects: NumericEffects;
  successEffects?: NumericEffects;
  failureEffects?: NumericEffects;
  baseProbability?: number;
  knowledgeTags: string[];
  memoryTags: string[];
}

export interface EventDefinition {
  id: string;
  type: EventType;
  title: string;
  narrative: string;
  minTurn?: number;
  maxTurn?: number;
  requiredTags?: string[];
  blockedTags?: string[];
  weight: number;
  choices: EventChoice[];
}

export interface OpportunityCard {
  id: string;
  title: string;
  approach: string;
  category: ActionCategory;
  description: string;
  duration: string;
  cashCost: number;
  timeCost: number;
  energyCost: number;
  baseProbability: number;
  risk: RiskLevel;
  skillTags: string[];
  environmentTags: string[];
  upside: string;
  downside: string;
  sourceIntent: string;
}

export interface AIPlayer {
  id: string;
  name: string;
  archetype: string;
  goal: string;
  personality: string;
  boundary: string;
  risk: number;
  cash: number;
  monthlyIncome: number;
  debt: number;
  trust: number;
  relationship: number;
  currentMove: string;
  memories: string[];
}

export interface WorldState {
  seed: number;
  city: string;
  era: string;
  cycle: "繁荣" | "平稳" | "放缓" | "衰退";
  interestRate: number;
  inflation: number;
  housingHeat: number;
  platformTrend: string;
  industryTrend: Record<string, number>;
}

export interface TalentState {
  multiplier: number;
  samples: number;
  revealed: boolean;
  level: "未知" | "初步显现" | "已确认" | "高度开发";
}

export interface ProbabilitySnapshot {
  id: string;
  label: string;
  base: number;
  skillModifier: number;
  resourceModifier: number;
  relationshipModifier: number;
  environmentModifier: number;
  talentModifier: number;
  finalProbability: number;
  roll: number;
  success: boolean;
  summary: string[];
}

export interface HistoryEntry {
  id: string;
  turn: number;
  type: "action" | "event" | "settlement" | "system";
  title: string;
  description: string;
  cashDelta?: number;
  tags: string[];
  timestamp: number;
}

export interface PendingEvent {
  event: EventDefinition;
  source: "turn" | "chain";
}

export type PlannedActionKind =
  | "core"
  | "skill"
  | "career"
  | "asset"
  | "life"
  | "opportunity"
  | "social";

export interface PlannedAction {
  id: string;
  kind: PlannedActionKind;
  targetId: string;
  label: string;
  category: string;
  timeCost: number;
  cashCost: number;
  payload?: OpportunityCard;
  targetPlayerId?: string;
}

export interface AnnualBriefing {
  year: number;
  chapter: string;
  headline: string;
  cityNews: string;
  message: {
    sender: string;
    role: string;
    body: string;
  };
  aiSummary: string;
  routeUpdate: string;
  riskNote: string;
}

export interface YearReveal {
  id: string;
  eyebrow: string;
  title: string;
  narrative: string;
  outcome: string;
  success: boolean;
  cashDelta: number;
  statChanges: Array<{ label: string; value: number }>;
  auditId?: string;
  probability?: number;
  tags: string[];
}

export interface ConsequenceScene {
  speaker: string;
  role: string;
  title: string;
  narrative: string;
  reaction: string;
  unlocked: string[];
  delayed: string[];
}

export interface ChapterSummary {
  index: number;
  title: string;
  years: string;
  headline: string;
  highlights: string[];
  unlockedRoutes: string[];
  resilience: number;
}

export interface DelayedConsequence {
  id: string;
  dueTurn: number;
  title: string;
  description: string;
  effects: NumericEffects;
  status: "pending" | "resolved";
  sourceTag: string;
}

export interface QuestState {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  status: "active" | "complete";
  rewardRoute: string;
}

export interface GameState {
  version: 2;
  phase: "playing" | "review";
  yearPhase: YearPhase;
  mode: ModeId;
  theme: ThemeId;
  roleId: string;
  turn: number;
  maxTurns: number;
  actionPoints: number;
  opportunityTokens: number;
  world: WorldState;
  cash: number;
  monthlyIncome: number;
  passiveIncome: number;
  fixedExpense: number;
  variableExpense: number;
  debt: number;
  health: number;
  energy: number;
  happiness: number;
  stress: number;
  credit: number;
  relationship: number;
  currentCareerId: string;
  careerHistory: string[];
  skills: Record<string, number>;
  assets: HeldAsset[];
  talents: Record<string, TalentState>;
  memory: Record<string, number>;
  revealedKnowledge: string[];
  annualBriefing: AnnualBriefing;
  plan: PlannedAction[];
  reveals: YearReveal[];
  revealIndex: number;
  consequenceScene: ConsequenceScene | null;
  chapterSummary: ChapterSummary | null;
  delayedConsequences: DelayedConsequence[];
  unlockedRoutes: string[];
  quests: QuestState[];
  chainProgress: Record<string, number>;
  pendingEvent: PendingEvent | null;
  lastCard: {
    eyebrow: string;
    title: string;
    narrative: string;
    tags: string[];
    outcome?: string;
  };
  audits: ProbabilitySnapshot[];
  history: HistoryEntry[];
  aiPlayers: AIPlayer[];
  rngStep: number;
  savedAt: number;
}

export interface NewGameConfig {
  mode: ModeId;
  theme: ThemeId;
  roleId: string;
  seed?: number;
}

export interface ActionResult {
  state: GameState;
  success: boolean;
  message: string;
}

export interface ReviewInsight {
  title: string;
  body: string;
  tone: "positive" | "watch" | "neutral";
}

export interface ReviewReport {
  netWorth: number;
  emergencyMonths: number;
  debtRatio: number;
  incomeDiversity: number;
  resilienceScore: number;
  learningScore: number;
  style: string;
  styleDescription: string;
  insights: ReviewInsight[];
  turningPoints: HistoryEntry[];
  knowledge: string[];
  luckVsPreparation: {
    luck: number;
    preparation: number;
    decisions: number;
  };
}
