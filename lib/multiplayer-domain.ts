import { CAREERS, EVENTS, ROLES, SKILLS, ASSETS } from "./content.ts";
import { CAREER_STORY_EVENTS } from "./career-story.ts";
import { LIFE_STORY_EVENTS } from "./life-story.ts";
import { LIFE_ACTIONS } from "./engine.ts";
import {
  getActiveSkillCombinations,
  getCareerRequiredLevel,
  getSkillSynergyBonus,
  getUnmetSkillPrerequisites,
} from "./progression.ts";
import {
  createFamilyLedger,
  recordFamilyAction,
  recordFamilyEvent,
} from "./relationships.ts";
import type {
  MultiplayerContract,
  MultiplayerDomainState,
  MultiplayerOutcome,
  MultiplayerPlanItem,
  MultiplayerPublicDomain,
  MultiplayerReveal,
  MultiplayerSubmittedPlan,
  MultiplayerWorldEvent,
} from "./multiplayer.ts";
import type { EventChoice, EventDefinition, NumericEffects } from "./types.ts";

export interface MultiplayerFinancialInput {
  id: string;
  name: string;
  cash: number;
  monthlyIncome: number;
  monthlyExpense: number;
  trust: number;
  domain: MultiplayerDomainState;
  plan: MultiplayerSubmittedPlan;
}

export interface MultiplayerFinancialResult {
  id: string;
  name: string;
  cash: number;
  monthlyIncome: number;
  monthlyExpense: number;
  trust: number;
  netWorth: number;
  domain: MultiplayerDomainState;
  plan: MultiplayerSubmittedPlan;
  outcomes: MultiplayerOutcome[];
  settlementCashflow: number;
  familyCost: number;
  assetChange: number;
  debtInterest: number;
}

export interface MultiplayerTurnSettlement {
  players: MultiplayerFinancialResult[];
  reveals: MultiplayerReveal[];
  contracts: MultiplayerContract[];
}

export const MULTIPLAYER_EVENT_CATALOG: EventDefinition[] = [
  ...EVENTS,
  ...CAREER_STORY_EVENTS,
  ...LIFE_STORY_EVENTS,
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function multiplayerDeterministicRoll(value: string): number {
  return fnv1a(value) / 4_294_967_296;
}

function startingCareerId(roleId: string): string {
  return roleId === "product"
    ? "product_manager"
    : roleId === "teacher"
      ? "teacher"
      : roleId === "freelancer"
        ? "designer"
        : roleId === "merchant"
          ? "restaurant"
          : roleId === "analyst"
            ? "researcher"
            : "engineer";
}

export function createMultiplayerDomainState(seed: number, seat: number): MultiplayerDomainState {
  const role = ROLES[Math.abs(seed + seat * 17) % ROLES.length];
  const skills = Object.fromEntries(SKILLS.map((skill) => [skill.id, 0])) as Record<string, number>;
  for (const id of role.starterSkills) skills[id] = 1;
  return {
    version: 1,
    roleId: role.id,
    careerId: startingCareerId(role.id),
    skills,
    assets: [],
    familyLedger: createFamilyLedger(),
    health: role.health,
    energy: role.energy,
    happiness: role.happiness,
    stress: 100 - role.energy,
    credit: role.credit,
    relationship: 58,
    debt: role.debt,
    passiveIncome: 0,
    memories: ["进入联机人生"],
    eventHistory: [],
  };
}

export function getMultiplayerStartingFinance(domain: MultiplayerDomainState): {
  cash: number;
  monthlyIncome: number;
  monthlyExpense: number;
  trust: number;
} {
  const role = ROLES.find((candidate) => candidate.id === domain.roleId) ?? ROLES[0];
  return {
    cash: role.cash,
    monthlyIncome: role.monthlyIncome,
    monthlyExpense: role.fixedExpense,
    trust: 55,
  };
}

export function toMultiplayerPublicDomain(domain: MultiplayerDomainState): MultiplayerPublicDomain {
  const role = ROLES.find((candidate) => candidate.id === domain.roleId) ?? ROLES[0];
  const career = CAREERS.find((candidate) => candidate.id === domain.careerId) ?? CAREERS[0];
  return {
    roleId: role.id,
    roleName: role.name,
    careerId: career.id,
    careerName: career.name,
    health: domain.health,
    energy: domain.energy,
    happiness: domain.happiness,
    stress: domain.stress,
    credit: domain.credit,
    debt: domain.debt,
    passiveIncome: domain.passiveIncome,
    skills: SKILLS
      .filter((skill) => (domain.skills[skill.id] ?? 0) > 0)
      .map((skill) => ({ id: skill.id, name: skill.name, level: domain.skills[skill.id], category: skill.category }))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "zh-CN")),
    assets: domain.assets.map((asset) => ({ ...asset })),
    familyLedger: {
      ...domain.familyLedger,
      responsibilities: domain.familyLedger.responsibilities.map((item) => ({ ...item })),
      decisions: domain.familyLedger.decisions.map((item) => ({ ...item })),
    },
    activeSkillCombinations: getActiveSkillCombinations(domain.skills).map((combination) => combination.name),
    eventHistory: domain.eventHistory.map((item) => ({ ...item })),
  };
}

function eventEligible(event: EventDefinition, turn: number, memories: Set<string>): boolean {
  if ((event.minTurn ?? 1) > turn || (event.maxTurn ?? Number.POSITIVE_INFINITY) < turn) return false;
  if (event.blockedTags?.some((tag) => memories.has(tag))) return false;
  if (event.requiredTags?.some((tag) => !memories.has(tag))) return false;
  if (event.requiredAnyTags?.length && !event.requiredAnyTags.some((tag) => memories.has(tag))) return false;
  return true;
}

export function selectMultiplayerWorldEvent(
  seed: number,
  turn: number,
  domains: MultiplayerDomainState[],
): MultiplayerWorldEvent {
  const memories = new Set(domains.flatMap((domain) => domain.memories));
  const candidates = MULTIPLAYER_EVENT_CATALOG.filter((event) => eventEligible(event, turn, memories));
  const pool = candidates.length ? candidates : EVENTS;
  const weighted = pool.flatMap((event) => Array.from({ length: Math.max(1, Math.round(event.weight * 2)) }, () => event));
  const event = weighted[Math.floor(multiplayerDeterministicRoll(`${seed}:shared-event:${turn}`) * weighted.length)] ?? EVENTS[0];
  const modifier = (multiplayerDeterministicRoll(`${seed}:event-modifier:${turn}`) - 0.5) * 0.12;
  return {
    eventId: event.id,
    type: event.type,
    title: event.title,
    description: event.narrative,
    modifier,
    tags: [...new Set([event.type, ...(event.triggerTags ?? []), ...(event.storyPackId ? [event.storyPackId] : [])])],
    choices: event.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      description: choice.description,
      risk: choice.risk,
      cost: choice.cost ?? 0,
      timeCost: choice.timeCost ?? 0,
    })),
  };
}

function skillPrerequisiteReason(domain: MultiplayerDomainState, skillId: string): string | undefined {
  const unmet = getUnmetSkillPrerequisites(domain.skills, skillId);
  if (!unmet.length) return undefined;
  return `需要先掌握 ${unmet.map((item) => `${SKILLS.find((skill) => skill.id === item.skillId)?.name ?? item.skillId} ${item.level}`).join("、")}`;
}

function actionLockedByCash(cash: number, cost: number, existing?: string): string | undefined {
  if (existing) return existing;
  return cash < cost ? "当前现金不足" : undefined;
}

export function buildMultiplayerActionCatalog(
  domain: MultiplayerDomainState,
  cash: number,
  playerId: string,
  contracts: MultiplayerContract[],
  turn: number,
): MultiplayerPlanItem[] {
  const currentCareer = CAREERS.find((career) => career.id === domain.careerId) ?? CAREERS[0];
  const items: MultiplayerPlanItem[] = [
    {
      id: `career-work:${currentCareer.id}`,
      kind: "career_work",
      targetId: currentCareer.id,
      label: `履行主业 · ${currentCareer.name}`,
      description: "保留主动收入资格，并继续积累当前职业的交付证据。",
      category: "职业",
      timeCost: 4,
      cashCost: 0,
      tags: ["主业", ...currentCareer.tags],
      recommended: true,
      locked: false,
    },
  ];

  for (const career of CAREERS) {
    const requiredLevel = getCareerRequiredLevel(career);
    const coverage = career.requiredSkills.length
      ? career.requiredSkills.reduce((sum, id) => sum + clamp((domain.skills[id] ?? 0) / requiredLevel, 0, 1), 0) / career.requiredSkills.length
      : 0.5;
    const existing = career.id === domain.careerId ? "这已经是当前职业" : undefined;
    const lockReason = actionLockedByCash(cash, career.entryCost, existing);
    items.push({
      id: `career:${career.id}`,
      kind: "career",
      targetId: career.id,
      label: `转向 ${career.name}`,
      description: `准备度 ${Math.round(coverage * 100)}% · 需要 ${career.requiredSkills.map((id) => SKILLS.find((skill) => skill.id === id)?.name ?? id).join("、") || "综合证据"}`,
      category: "职业",
      timeCost: 4,
      cashCost: career.entryCost,
      tags: [...career.tags],
      recommended: !lockReason && coverage >= 0.65 && career.monthlyIncome > currentCareer.monthlyIncome,
      locked: Boolean(lockReason),
      lockReason,
    });
  }

  for (const skill of SKILLS) {
    const prerequisite = skillPrerequisiteReason(domain, skill.id);
    const lockReason = actionLockedByCash(cash, skill.cost, prerequisite);
    const level = domain.skills[skill.id] ?? 0;
    items.push({
      id: `skill:${skill.id}`,
      kind: "skill",
      targetId: skill.id,
      label: `${level > 0 ? "精进" : "学习"}${skill.name}`,
      description: `${skill.description} 当前等级 ${level.toFixed(1)}。`,
      category: "技能",
      timeCost: skill.timeCost,
      cashCost: skill.cost,
      tags: [...skill.tags],
      recommended: !lockReason && level < 2 && (currentCareer.requiredSkills.includes(skill.id) || level > 0),
      locked: Boolean(lockReason),
      lockReason,
    });
  }

  for (const asset of ASSETS) {
    const lockReason = actionLockedByCash(cash, asset.minimum);
    items.push({
      id: `asset-buy:${asset.id}`,
      kind: "asset_buy",
      targetId: asset.id,
      label: `配置 ${asset.name}`,
      description: `${asset.description} 流动性 ${Math.round(asset.liquidity * 100)} · 波动 ${Math.round(asset.volatility * 100)}%。`,
      category: "资产",
      timeCost: 1,
      cashCost: asset.minimum,
      tags: [...asset.tags],
      recommended: !lockReason && asset.risk !== "高" && domain.assets.length < 3,
      locked: Boolean(lockReason),
      lockReason,
    });
  }

  for (const holding of domain.assets) {
    for (const fraction of [0.25, 1] as const) {
      items.push({
        id: `asset-sell:${holding.assetId}:${fraction}`,
        kind: "asset_sell",
        targetId: holding.assetId,
        label: `${fraction === 1 ? "全部" : "卖出 25%"}变现 · ${holding.name}`,
        description: "成交价会扣除交易、流动性与市场压力折价。",
        category: "资产",
        timeCost: 1,
        cashCost: 0,
        tags: ["变现", holding.category],
        recommended: false,
        locked: false,
        saleFraction: fraction,
      });
    }
  }

  for (const action of LIFE_ACTIONS) {
    const lockReason = actionLockedByCash(cash, action.cashCost);
    items.push({
      id: `life:${action.id}`,
      kind: "life",
      targetId: action.id,
      label: action.name,
      description: action.description,
      category: action.category === "family" ? "家庭" : action.category === "relationship" ? "关系" : action.category === "investment" ? "财务" : "生活",
      timeCost: action.points,
      cashCost: action.cashCost,
      tags: [...action.knowledge],
      recommended: !lockReason && ["build_reserve", "family_budget", "rest"].includes(action.id),
      locked: Boolean(lockReason),
      lockReason,
    });
  }

  for (const contract of contracts.filter((item) => item.status === "active" && item.partyIds.includes(playerId))) {
    if (contract.nextDueTurn <= turn) {
      const fulfillLock = actionLockedByCash(cash, contract.contribution);
      items.push({
        id: `contract-fulfill:${contract.id}`,
        kind: "contract",
        targetId: contract.id,
        label: `履行 · ${contract.title}`,
        description: `${contract.terms}；双方都安排履约后才完成本期里程碑。`,
        category: "合同",
        timeCost: contract.timeCost,
        cashCost: contract.contribution,
        tags: ["合同", "履约", "信用"],
        recommended: !fulfillLock,
        locked: Boolean(fulfillLock),
        lockReason: fulfillLock,
        contractAction: "fulfill",
      });
    }
    const exitLock = actionLockedByCash(cash, contract.exitCost);
    items.push({
      id: `contract-exit:${contract.id}`,
      kind: "contract",
      targetId: contract.id,
      label: `按约退出 · ${contract.title}`,
      description: "支付书面退出成本并完成交接，不留下违约记录。",
      category: "合同",
      timeCost: 1,
      cashCost: contract.exitCost,
      tags: ["合同", "退出", "边界"],
      recommended: false,
      locked: Boolean(exitLock),
      lockReason: exitLock,
      contractAction: "exit",
    });
  }

  return items.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.category.localeCompare(b.category, "zh-CN") || a.label.localeCompare(b.label, "zh-CN"));
}

function copyDomain(domain: MultiplayerDomainState): MultiplayerDomainState {
  return {
    ...domain,
    skills: { ...domain.skills },
    assets: domain.assets.map((asset) => ({ ...asset })),
    familyLedger: {
      ...domain.familyLedger,
      responsibilities: domain.familyLedger.responsibilities.map((item) => ({ ...item })),
      decisions: domain.familyLedger.decisions.map((item) => ({ ...item })),
    },
    memories: [...domain.memories],
    eventHistory: domain.eventHistory.map((item) => ({ ...item })),
  };
}

function applyEffects(
  result: MultiplayerFinancialResult,
  effects: NumericEffects,
): Omit<MultiplayerOutcome, "actionId" | "kind" | "targetId" | "label" | "success" | "probability" | "narrative" | "evidence"> {
  const before = {
    cash: result.cash,
    monthlyIncome: result.monthlyIncome,
    monthlyExpense: result.monthlyExpense,
    passiveIncome: result.domain.passiveIncome,
    debt: result.domain.debt,
    energy: result.domain.energy,
    stress: result.domain.stress,
    trust: result.trust,
  };
  result.cash += effects.cash ?? 0;
  result.monthlyIncome = Math.max(0, result.monthlyIncome + (effects.monthlyIncome ?? 0));
  result.monthlyExpense = Math.max(0, result.monthlyExpense + (effects.fixedExpense ?? 0));
  result.domain.passiveIncome = Math.max(0, result.domain.passiveIncome + (effects.passiveIncome ?? 0));
  result.domain.debt = Math.max(0, result.domain.debt + (effects.debt ?? 0));
  result.domain.health = clamp(result.domain.health + (effects.health ?? 0), 0, 100);
  result.domain.energy = clamp(result.domain.energy + (effects.energy ?? 0), 0, 100);
  result.domain.happiness = clamp(result.domain.happiness + (effects.happiness ?? 0), 0, 100);
  result.domain.stress = clamp(result.domain.stress + (effects.stress ?? 0), 0, 100);
  result.domain.credit = clamp(result.domain.credit + (effects.credit ?? 0), 0, 100);
  result.domain.relationship = clamp(result.domain.relationship + (effects.relationship ?? 0), 0, 100);
  if (effects.relationship) result.trust = clamp(result.trust + effects.relationship * 0.6, 0, 100);
  return {
    cashDelta: result.cash - before.cash,
    incomeDelta: result.monthlyIncome - before.monthlyIncome,
    expenseDelta: result.monthlyExpense - before.monthlyExpense,
    passiveIncomeDelta: result.domain.passiveIncome - before.passiveIncome,
    debtDelta: result.domain.debt - before.debt,
    energyDelta: result.domain.energy - before.energy,
    stressDelta: result.domain.stress - before.stress,
    trustDelta: result.trust - before.trust,
  };
}

function emptyDeltas(): ReturnType<typeof applyEffects> {
  return {
    cashDelta: 0,
    incomeDelta: 0,
    expenseDelta: 0,
    passiveIncomeDelta: 0,
    debtDelta: 0,
    energyDelta: 0,
    stressDelta: 0,
    trustDelta: 0,
  };
}

function pushOutcome(
  result: MultiplayerFinancialResult,
  action: Pick<MultiplayerPlanItem, "id" | "kind" | "targetId" | "label">,
  success: boolean,
  probability: number,
  deltas: ReturnType<typeof applyEffects>,
  narrative: string,
  evidence: string[],
): void {
  result.outcomes.push({
    actionId: action.id,
    kind: action.kind,
    targetId: action.targetId,
    label: action.label,
    success,
    probability,
    ...deltas,
    narrative,
    evidence,
  });
}

function resolveAction(
  result: MultiplayerFinancialResult,
  action: MultiplayerPlanItem,
  seed: number,
  turn: number,
  event: MultiplayerWorldEvent,
): void {
  if (action.kind === "contract") {
    pushOutcome(result, action, true, 1, emptyDeltas(), "合同义务已经进入本期计划，最终结果取决于双方是否都履行约定。", ["书面合同", action.contractAction === "exit" ? "退出边界" : "共同履约"]);
    return;
  }

  if (action.kind === "asset_buy") {
    const asset = ASSETS.find((candidate) => candidate.id === action.targetId);
    if (!asset) return;
    const deltas = applyEffects(result, { cash: -asset.minimum });
    const existing = result.domain.assets.find((holding) => holding.assetId === asset.id);
    if (existing) {
      existing.units += 1;
      existing.costBasis += asset.minimum;
      existing.value += asset.minimum;
    } else {
      result.domain.assets.push({ assetId: asset.id, name: asset.name, category: asset.category, units: 1, costBasis: asset.minimum, value: asset.minimum, purchasedTurn: turn });
    }
    pushOutcome(result, action, true, 1, deltas, `${asset.name}进入真实持仓，后续价值、现金收益和变现折价都会持续结算。`, [asset.category, `风险:${asset.risk}`, `流动性:${Math.round(asset.liquidity * 100)}`]);
    return;
  }

  if (action.kind === "asset_sell") {
    const asset = ASSETS.find((candidate) => candidate.id === action.targetId);
    const holding = result.domain.assets.find((candidate) => candidate.assetId === action.targetId);
    if (!asset || !holding) return;
    const fraction = action.saleFraction ?? 1;
    const gross = holding.value * fraction;
    const cyclePressure = event.modifier < -0.03 ? 0.025 : event.modifier > 0.03 ? -0.005 : 0.01;
    const riskPremium = asset.risk === "高" ? 0.025 : asset.risk === "中" ? 0.012 : 0.004;
    const haircut = clamp(0.008 + (1 - asset.liquidity) * 0.09 + riskPremium + cyclePressure, 0.008, 0.24);
    const net = Math.round(gross * (1 - haircut));
    const deltas = applyEffects(result, { cash: net });
    holding.value = Math.max(0, holding.value - gross);
    holding.costBasis = Math.max(0, holding.costBasis * (1 - fraction));
    holding.units = Math.max(0, holding.units * (1 - fraction));
    result.domain.assets = result.domain.assets.filter((candidate) => candidate.value >= 1);
    pushOutcome(result, action, true, 1, deltas, `账面价值 ${Math.round(gross).toLocaleString("zh-CN")} 元按 ${Math.round(haircut * 1000) / 10}% 折价成交。`, ["资产变现", `折价:${Math.round(haircut * 1000) / 10}%`]);
    return;
  }

  if (action.kind === "career_work") {
    const probability = clamp(0.84 + getSkillSynergyBonus(result.domain.skills, ["delivery", "communication"]) + event.modifier, 0.2, 0.97);
    const success = multiplayerDeterministicRoll(`${seed}:${turn}:${result.id}:${action.id}`) <= probability;
    const deltas = applyEffects(result, success ? { cash: 1_500, credit: 1, energy: -6, stress: 2 } : { energy: -8, stress: 6, credit: -1 });
    pushOutcome(result, action, success, probability, deltas, success ? "本期主业形成可验证交付，职业信用与收入资格被保留。" : "主业交付偏离预期，压力与职业信用成本被真实记账。", ["主业交付", result.domain.careerId]);
    return;
  }

  if (action.kind === "career") {
    const career = CAREERS.find((candidate) => candidate.id === action.targetId);
    if (!career) return;
    const requiredLevel = getCareerRequiredLevel(career);
    const coverage = career.requiredSkills.length
      ? career.requiredSkills.reduce((sum, id) => sum + clamp((result.domain.skills[id] ?? 0) / requiredLevel, 0, 1), 0) / career.requiredSkills.length
      : 0.5;
    const probability = clamp(0.24 + coverage * 0.48 + getSkillSynergyBonus(result.domain.skills, career.requiredSkills) + event.modifier, 0.08, 0.92);
    const success = multiplayerDeterministicRoll(`${seed}:${turn}:${result.id}:${action.id}`) <= probability;
    const effects: NumericEffects = { cash: -career.entryCost, energy: -8, stress: success ? 4 : 9 };
    if (success) effects.monthlyIncome = career.monthlyIncome - result.monthlyIncome;
    const deltas = applyEffects(result, effects);
    if (success) result.domain.careerId = career.id;
    pushOutcome(result, action, success, probability, deltas, success ? `职业路线切换为${career.name}，新的主动收入从本期起生效。` : `转型准备度没有通过当前窗口，投入与失败证据仍被保留。`, ["职业准备度", ...career.requiredSkills]);
    return;
  }

  if (action.kind === "skill") {
    const skill = SKILLS.find((candidate) => candidate.id === action.targetId);
    if (!skill) return;
    const probability = clamp(0.76 + getSkillSynergyBonus(result.domain.skills, [skill.id, ...skill.tags]) + event.modifier * 0.5, 0.35, 0.96);
    const success = multiplayerDeterministicRoll(`${seed}:${turn}:${result.id}:${action.id}`) <= probability;
    const deltas = applyEffects(result, { cash: -skill.cost, energy: -skill.timeCost * 2, stress: success ? 1 : 3 });
    result.domain.skills[skill.id] = clamp((result.domain.skills[skill.id] ?? 0) + (success ? 1 : 0.25), 0, 5);
    pushOutcome(result, action, success, probability, deltas, success ? `${skill.name}形成了一个完整熟练度样本。` : `${skill.name}只形成了局部经验，仍需后续练习才能稳定迁移。`, ["技能成长", skill.category, ...skill.tags]);
    return;
  }

  const life = LIFE_ACTIONS.find((candidate) => candidate.id === action.targetId);
  if (!life) return;
  const probability = clamp(life.base + getSkillSynergyBonus(result.domain.skills, [...life.skillTags]) + event.modifier, 0.08, 0.97);
  const success = multiplayerDeterministicRoll(`${seed}:${turn}:${result.id}:${action.id}`) <= probability;
  let deltas = applyEffects(result, { cash: -life.cashCost, energy: -life.points * 2 });
  const consequence = applyEffects(result, success ? life.success : life.failure);
  deltas = Object.fromEntries(Object.keys(deltas).map((key) => [key, deltas[key as keyof typeof deltas] + consequence[key as keyof typeof consequence]])) as typeof deltas;
  if (["family_budget", "insurance"].includes(life.id)) {
    result.domain.familyLedger = recordFamilyAction(result.domain.familyLedger, life.id, turn, success);
  }
  result.domain.memories.push(...life.memory, ...life.knowledge);
  pushOutcome(result, action, success, probability, deltas, success ? `${life.name}形成了可持续使用的结果，并进入长期状态。` : `${life.name}没有达到主要目标，但成本与经验仍然保留。`, [...life.knowledge]);
}

function resolveEventChoice(
  result: MultiplayerFinancialResult,
  event: MultiplayerWorldEvent,
  seed: number,
  turn: number,
): void {
  const definition = MULTIPLAYER_EVENT_CATALOG.find((candidate) => candidate.id === event.eventId) ?? EVENTS[0];
  const choice = definition.choices.find((candidate) => candidate.id === result.plan.eventChoiceId) ?? definition.choices[0];
  const resource = choice.cost && choice.cost > 0 ? clamp(result.cash / choice.cost / 2, 0, 1) : result.domain.energy / 100;
  const probability = clamp((choice.baseProbability ?? 1) + event.modifier + (resource - 0.5) * 0.12, 0.08, 0.96);
  const success = multiplayerDeterministicRoll(`${seed}:${turn}:${result.id}:event:${choice.id}`) <= probability;
  let deltas = applyEffects(result, choice.effects);
  const consequence = applyEffects(result, success ? choice.successEffects ?? {} : choice.failureEffects ?? {});
  deltas = Object.fromEntries(Object.keys(deltas).map((key) => [key, deltas[key as keyof typeof deltas] + consequence[key as keyof typeof consequence]])) as typeof deltas;
  if (definition.type === "家庭") {
    result.domain.familyLedger = recordFamilyEvent(result.domain.familyLedger, turn, definition.title, choice.label, success);
  }
  result.domain.memories = [...result.domain.memories, ...choice.memoryTags, ...choice.knowledgeTags, `事件:${definition.type}`].slice(-80);
  const narrative = success
    ? `${choice.label}在当前世界中实现了主要目标，投入与机会成本仍然保留。`
    : `${choice.label}没有按预期发展，准备、环境与随机扰动共同造成偏差。`;
  result.domain.eventHistory = [...result.domain.eventHistory, { turn, eventId: definition.id, title: definition.title, choiceId: choice.id, choiceLabel: choice.label, success, narrative }].slice(-24);
  result.outcomes.push({ actionId: `event:${choice.id}`, kind: "event", targetId: definition.id, label: `${definition.title} · ${choice.label}`, success, probability, ...deltas, narrative, evidence: [definition.type, ...choice.knowledgeTags] });
}

function findContractOutcome(result: MultiplayerFinancialResult, contractId: string): MultiplayerOutcome | undefined {
  return result.outcomes.find((outcome) => outcome.kind === "contract" && outcome.targetId === contractId);
}

function applyContractDelta(
  result: MultiplayerFinancialResult,
  contract: MultiplayerContract,
  cashDelta: number,
  incomeDelta: number,
  trustDelta: number,
  success: boolean,
  narrative: string,
): void {
  result.cash += cashDelta;
  result.monthlyIncome = Math.max(0, result.monthlyIncome + incomeDelta);
  result.trust = clamp(result.trust + trustDelta, 0, 100);
  result.domain.credit = clamp(result.domain.credit + (success ? 2 : -6), 0, 100);
  result.domain.relationship = clamp(result.domain.relationship + trustDelta * 0.7, 0, 100);
  result.domain.stress = clamp(result.domain.stress + (success ? 1 : 6), 0, 100);
  const existing = findContractOutcome(result, contract.id);
  const patch = {
    success,
    cashDelta,
    incomeDelta,
    trustDelta,
    stressDelta: success ? 1 : 6,
    narrative,
    evidence: ["关系合同", success ? "共同履约" : "违约后果"],
  };
  if (existing) Object.assign(existing, patch);
  else result.outcomes.push({ actionId: `contract-system:${contract.id}`, kind: "contract", targetId: contract.id, label: contract.title, probability: 1, expenseDelta: 0, passiveIncomeDelta: 0, debtDelta: 0, energyDelta: 0, ...patch });
}

function settleContracts(
  contracts: MultiplayerContract[],
  results: MultiplayerFinancialResult[],
  turn: number,
): MultiplayerContract[] {
  return contracts.map((original) => {
    const contract: MultiplayerContract = { ...original, partyIds: [...original.partyIds] as [string, string], partyNames: [...original.partyNames] as [string, string], records: original.records.map((record) => ({ ...record })) };
    if (contract.status !== "active") return contract;
    const parties = contract.partyIds.map((id) => results.find((result) => result.id === id)).filter(Boolean) as MultiplayerFinancialResult[];
    const exiters = parties.filter((result) => result.plan.actions.some((action) => action.kind === "contract" && action.targetId === contract.id && action.contractAction === "exit"));
    if (exiters.length) {
      contract.status = "terminated";
      for (const result of exiters) applyContractDelta(result, contract, -contract.exitCost, 0, -1, true, `按书面退出条款支付 ${contract.exitCost.toLocaleString("zh-CN")} 元并完成交接，合同终止但没有违约。`);
      contract.records.push({ turn, action: "terminated", detail: `${exiters.map((item) => item.name).join("、")}按约退出并完成结算。` });
      return contract;
    }
    if (contract.nextDueTurn > turn) return contract;
    const fulfillers = parties.filter((result) => result.plan.actions.some((action) => action.kind === "contract" && action.targetId === contract.id && action.contractAction === "fulfill"));
    if (fulfillers.length === parties.length && parties.length === contract.partyIds.length) {
      const first = contract.milestone === 0;
      for (const result of parties) applyContractDelta(result, contract, -contract.contribution + contract.payout, first ? contract.incomeDelta : 0, 4, true, `双方完成本期投入与交付，回收 ${contract.payout.toLocaleString("zh-CN")} 元并积累共同履约证据。`);
      contract.milestone += 1;
      contract.nextDueTurn = turn + 1;
      contract.records.push({ turn, action: "fulfilled", detail: `第 ${contract.milestone} 个共同里程碑完成。` });
      if (contract.milestone >= 3) {
        contract.status = "completed";
        contract.records.push({ turn, action: "completed", detail: "三个里程碑全部完成，合同正式结项。" });
      }
      return contract;
    }
    contract.status = "breached";
    const fulfillerIds = new Set(fulfillers.map((item) => item.id));
    for (const result of parties) {
      const prepared = fulfillerIds.has(result.id);
      applyContractDelta(result, contract, 0, 0, prepared ? -2 : -9, false, prepared ? "你安排了履约，但另一方缺席导致共同里程碑失败；合同进入违约状态。" : "你没有在到期前安排履约或退出，合同、信用与关系同时受损。" );
    }
    contract.records.push({ turn, action: "breached", detail: `到期时仅 ${fulfillers.map((item) => item.name).join("、") || "无人"} 安排履约，合同进入违约状态。` });
    return contract;
  });
}

function settleAssetsAndCashflow(
  result: MultiplayerFinancialResult,
  event: MultiplayerWorldEvent,
  seed: number,
  turn: number,
): void {
  let assetChange = 0;
  let assetCashYield = 0;
  for (const holding of result.domain.assets) {
    const asset = ASSETS.find((candidate) => candidate.id === holding.assetId);
    if (!asset) continue;
    const shock = (multiplayerDeterministicRoll(`${seed}:${turn}:${result.id}:asset:${asset.id}`) - 0.5) * asset.volatility * 2;
    const rate = asset.expectedAnnualReturn + shock + event.modifier * 0.25;
    const previous = holding.value;
    holding.value = Math.max(0, Math.round(holding.value * (1 + rate)));
    assetChange += holding.value - previous;
    assetCashYield += Math.max(0, holding.value * asset.cashYield);
  }
  result.domain.passiveIncome = result.domain.assets.reduce((sum, holding) => {
    const asset = ASSETS.find((candidate) => candidate.id === holding.assetId);
    return sum + (asset ? holding.value * asset.cashYield / 12 : 0);
  }, 0);
  result.assetChange = Math.round(assetChange);
  result.debtInterest = Math.round(result.domain.debt * 0.07);
  result.familyCost = Math.round(result.domain.familyLedger.responsibilities.filter((item) => item.status === "active").reduce((sum, item) => sum + item.cashPerPeriod, 0));
  result.settlementCashflow = Math.round((result.monthlyIncome + result.domain.passiveIncome - result.monthlyExpense) * 12 + assetCashYield - result.familyCost - result.debtInterest);
  result.cash += result.settlementCashflow;
  if (result.cash < 0) {
    const shortfall = Math.abs(result.cash);
    result.domain.debt += Math.round(shortfall * 1.08);
    result.cash = 0;
    result.domain.credit = clamp(result.domain.credit - 5, 0, 100);
    result.domain.stress = clamp(result.domain.stress + 6, 0, 100);
  }
  result.netWorth = Math.round(result.cash + result.domain.assets.reduce((sum, asset) => sum + asset.value, 0) - result.domain.debt);
  result.outcomes.push({
    actionId: `settlement:${turn}`,
    kind: "settlement",
    targetId: String(turn),
    label: `第 ${turn} 回合统一结算`,
    success: result.settlementCashflow >= 0,
    probability: 1,
    cashDelta: result.settlementCashflow,
    incomeDelta: 0,
    expenseDelta: 0,
    passiveIncomeDelta: 0,
    debtDelta: 0,
    energyDelta: 0,
    stressDelta: 0,
    trustDelta: 0,
    narrative: `主动与被动现金流、家庭责任、债务利息和 ${result.domain.assets.length} 项资产已统一入账。`,
    evidence: ["统一结算", `家庭成本:${result.familyCost}`, `资产变化:${result.assetChange}`],
  });
}

export function settleMultiplayerTurn(
  inputs: MultiplayerFinancialInput[],
  contracts: MultiplayerContract[],
  event: MultiplayerWorldEvent,
  seed: number,
  turn: number,
): MultiplayerTurnSettlement {
  const results: MultiplayerFinancialResult[] = inputs.map((input) => ({
    ...input,
    domain: copyDomain(input.domain),
    plan: { actions: input.plan.actions.map((action) => ({ ...action, tags: [...action.tags] })), eventChoiceId: input.plan.eventChoiceId },
    netWorth: 0,
    outcomes: [],
    settlementCashflow: 0,
    familyCost: 0,
    assetChange: 0,
    debtInterest: 0,
  }));
  for (const result of results) {
    for (const action of result.plan.actions) resolveAction(result, action, seed, turn, event);
    resolveEventChoice(result, event, seed, turn);
  }
  const nextContracts = settleContracts(contracts, results, turn);
  for (const result of results) settleAssetsAndCashflow(result, event, seed, turn);
  const reveals: MultiplayerReveal[] = results.map((result) => ({
    playerId: result.id,
    playerName: result.name,
    outcomes: result.outcomes.map((outcome) => ({ ...outcome, evidence: [...outcome.evidence] })),
    totalCashDelta: result.outcomes.reduce((sum, outcome) => sum + outcome.cashDelta, 0),
    settlementCashflow: result.settlementCashflow,
    familyCost: result.familyCost,
    assetChange: result.assetChange,
    debtInterest: result.debtInterest,
  }));
  return { players: results, reveals, contracts: nextContracts };
}

export function findMultiplayerEventChoice(
  event: MultiplayerWorldEvent,
  choiceId: string,
): EventChoice | null {
  const definition = MULTIPLAYER_EVENT_CATALOG.find((candidate) => candidate.id === event.eventId);
  return definition?.choices.find((choice) => choice.id === choiceId) ?? null;
}
