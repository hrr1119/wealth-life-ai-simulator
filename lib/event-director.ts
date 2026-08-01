import { CAREER_STORY_EVENTS } from "./career-story.ts";
import { EVENTS } from "./content.ts";
import { LIFE_STORY_EVENTS } from "./life-story.ts";
import { getPortfolioDiagnostics } from "./progression.ts";
import type {
  EventDefinition,
  EventDirectorDecision,
  EventDirectorState,
  EventType,
  GameState,
  PendingEvent,
} from "./types.ts";

interface DirectedEvent {
  pending: PendingEvent | null;
  director: EventDirectorState;
}

const TYPE_SIGNAL_RULES: Array<{ pattern: RegExp; types: EventType[] }> = [
  { pattern: /职业|主业|人力资本|转型|技能|学习|技术|交付/, types: ["职业", "行业", "机会"] },
  { pattern: /投资|资产|金融|房产|负债|现金流/, types: ["市场", "风险", "机会"] },
  { pattern: /收入|副业|经营|客户|自由机会/, types: ["机会", "职业", "风险"] },
  { pattern: /关系|社交|AI角色|合同|谈判/, types: ["关系", "机会", "职业"] },
  { pattern: /家庭|照护|亲子/, types: ["家庭", "关系", "风险"] },
  { pattern: /健康|休息|恢复|保障/, types: ["健康", "风险"] },
];

function lifeYear(state: Pick<GameState, "turn" | "timeScale">): number {
  return state.timeScale === "quarter" ? Math.ceil(state.turn / 4) : state.turn;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function currentActionSignals(state: GameState): string[] {
  const entries = state.history.filter(
    (entry) =>
      entry.turn === state.turn &&
      entry.type === "action" &&
      entry.title !== "履行主业",
  );
  return unique(entries.flatMap((entry) => [entry.title, ...entry.tags]));
}

function currentStateSignals(state: GameState): string[] {
  const result = [state.world.cycle, state.world.platformTrend];
  const portfolio = getPortfolioDiagnostics(state);
  if (state.cash < (state.fixedExpense + state.variableExpense) * 3) result.push("现金缓冲不足");
  if (state.stress >= 68) result.push("高压力");
  if (state.health <= 55) result.push("健康预警");
  if (state.assets.length) result.push("持有资产");
  if (portfolio.largestPositionShare > 0.55) result.push("投资集中度过高");
  if (portfolio.weightedLiquidity > 0 && portfolio.weightedLiquidity < 0.4) result.push("资产流动性不足");
  if (portfolio.highRiskShare > 0.5) result.push("高风险资产暴露");
  if (state.debt > state.cash) result.push("负债压力");
  if (state.aiPlayers.some((player) => player.trust >= 68)) result.push("可信关系");
  if (state.deep?.family.partnered) result.push("共同家庭");
  if (state.deep?.business.active) result.push("企业经营");
  return unique(result);
}

function signalTypes(signals: string[]): Set<EventType> {
  const types = new Set<EventType>();
  for (const signal of signals) {
    for (const rule of TYPE_SIGNAL_RULES) {
      if (rule.pattern.test(signal)) rule.types.forEach((type) => types.add(type));
    }
  }
  return types;
}

function eligible(state: GameState, event: EventDefinition, actionSignals: string[]): boolean {
  const year = lifeYear(state);
  if ((event.minTurn ?? 1) > year) return false;
  if (event.maxTurn && event.maxTurn < year) return false;
  if (event.requiredTags?.some((tag) => !state.memory[tag])) return false;
  if (
    event.requiredAnyTags?.length &&
    !event.requiredAnyTags.some((tag) => Boolean(state.memory[tag]) || actionSignals.includes(tag))
  ) return false;
  if (event.blockedTags?.some((tag) => state.memory[tag])) return false;
  return true;
}

function stableJitter(seed: number, turn: number, eventId: string): number {
  let value = (seed ^ Math.imul(turn + 1, 0x9e3779b9)) >>> 0;
  for (let index = 0; index < eventId.length; index += 1) {
    value = Math.imul(value ^ eventId.charCodeAt(index), 0x45d9f3b) >>> 0;
  }
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
}

function scoreEvent(
  state: GameState,
  event: EventDefinition,
  actionSignals: string[],
  stateSignals: string[],
  preferredTypes: Set<EventType>,
): number {
  let score = event.weight * 10;
  const allSignals = [...actionSignals, ...stateSignals];
  const triggerHits = (event.triggerTags ?? []).filter((tag) =>
    allSignals.some((signal) => signal.includes(tag) || tag.includes(signal)),
  ).length;
  score += triggerHits * 12;
  if (preferredTypes.has(event.type)) score += 11;
  if (event.storyPackId && (event.storyStage ?? 1) > 1) score += 18;
  if (event.type === "健康" && (state.stress >= 68 || state.health <= 55)) score += 18;
  if (
    (event.type === "职业" || event.type === "行业" || event.type === "风险") &&
    (state.world.cycle === "放缓" || state.world.cycle === "衰退")
  ) score += 10;
  if ((event.type === "市场" || event.type === "风险") && state.assets.length) score += 8;
  if ((event.type === "家庭" || event.type === "关系") && state.deep?.family.partnered) score += 8;
  if (state.eventDirector.recentEventIds.includes(event.id)) score -= 32;
  score += stableJitter(state.world.seed, state.turn, event.id) * 3;
  return score;
}

function reasonsFor(
  state: GameState,
  event: EventDefinition,
  actionSignals: string[],
  stateSignals: string[],
): string[] {
  const reasons: string[] = [];
  const storyPackNames: Record<string, string> = {
    "career-growth": "职业成长",
    "career-shock": "职业冲击",
    "career-transition": "职业转型",
    "career-independent": "独立经营",
    "life-business": "创业经营与公司治理",
    "life-family": "家庭、住房与照护",
    "life-investment": "投资周期与流动性",
    "life-contract": "关系、合同与合规",
    "life-consumer": "消费陷阱与债务重置",
    "life-platform": "自由职业与平台经营",
  };
  const hit = (event.triggerTags ?? []).find((tag) =>
    [...actionSignals, ...stateSignals].some((signal) => signal.includes(tag) || tag.includes(signal)),
  );
  if (hit) reasons.push(`本回合行动命中「${hit}」`);
  if (event.requiredAnyTags?.some((tag) => state.memory[tag])) reasons.push("延续此前选择形成的故事支线");
  if (event.storyPackId) reasons.push(`进入「${storyPackNames[event.storyPackId] ?? event.storyPackId}」故事包第 ${event.storyStage ?? 1} 阶段`);
  if (state.world.cycle === "放缓" || state.world.cycle === "衰退") reasons.push(`${state.world.cycle}周期提高了职业与风险事件权重`);
  if (!reasons.length) reasons.push("由当前人物状态、事件新鲜度与世界环境共同选出");
  return reasons.slice(0, 3);
}

export function createEventDirectorState(): EventDirectorState {
  return {
    recentEventIds: [],
    activeStoryPacks: {},
    lastDecision: null,
  };
}

export function directPersonalEvent(state: GameState, roll: number): DirectedEvent {
  const actionSignals = currentActionSignals(state);
  const stateSignals = currentStateSignals(state);
  const preferredTypes = signalTypes(actionSignals);
  const allEvents = [...CAREER_STORY_EVENTS, ...LIFE_STORY_EVENTS, ...EVENTS];
  const scores: Record<string, number> = {};
  const ranked = allEvents
    .filter((event) => eligible(state, event, actionSignals))
    .map((event) => {
      const score = scoreEvent(state, event, actionSignals, stateSignals, preferredTypes);
      scores[event.id] = Number(score.toFixed(3));
      return { event, score };
    })
    .sort((a, b) => b.score - a.score || a.event.id.localeCompare(b.event.id));

  const shortlist = ranked.slice(0, Math.min(8, ranked.length));
  const selectionPool = shortlist.slice(0, Math.min(3, shortlist.length));
  const selected = selectionPool.length
    ? selectionPool[Math.min(selectionPool.length - 1, Math.floor(roll * selectionPool.length))].event
    : null;
  const decision: EventDirectorDecision = {
    turn: state.turn,
    actionSignals,
    stateSignals,
    candidateIds: shortlist.map((item) => item.event.id),
    selectedEventId: selected?.id ?? null,
    reasons: selected ? reasonsFor(state, selected, actionSignals, stateSignals) : ["当前没有满足触发条件的个人事件"],
    scores,
  };
  const recentEventIds = selected
    ? [...state.eventDirector.recentEventIds.filter((id) => id !== selected.id), selected.id].slice(-8)
    : [...state.eventDirector.recentEventIds];
  const activeStoryPacks = { ...state.eventDirector.activeStoryPacks };
  if (selected?.storyPackId) {
    activeStoryPacks[selected.storyPackId] = Math.max(
      activeStoryPacks[selected.storyPackId] ?? 0,
      selected.storyStage ?? 1,
    );
  }
  return {
    pending: selected
      ? { event: selected, source: selected.storyPackId ? "chain" : "turn" }
      : null,
    director: { recentEventIds, activeStoryPacks, lastDecision: decision },
  };
}
