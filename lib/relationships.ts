import type {
  AIPlayer,
  AIPlayerDecision,
  FamilyDecisionRecord,
  FamilyLedgerState,
  FamilyResponsibility,
  RelationshipContract,
  WorldState,
} from "./types.ts";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stableRoll(seed: number, turn: number, salt: string): number {
  let value = (seed ^ Math.imul(turn + 17, 0x9e3779b9)) >>> 0;
  for (let index = 0; index < salt.length; index += 1) {
    value = Math.imul(value ^ salt.charCodeAt(index), 0x45d9f3b) >>> 0;
  }
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
}

export function createFamilyLedger(): FamilyLedgerState {
  return {
    stage: "independent",
    sharedCash: 0,
    trust: 55,
    responsibilities: [],
    decisions: [],
  };
}

function upsertResponsibility(
  ledger: FamilyLedgerState,
  responsibility: FamilyResponsibility,
): FamilyLedgerState {
  const existing = ledger.responsibilities.find((item) => item.id === responsibility.id);
  return {
    ...ledger,
    responsibilities: existing
      ? ledger.responsibilities.map((item) => item.id === responsibility.id ? { ...item, ...responsibility } : { ...item })
      : [...ledger.responsibilities.map((item) => ({ ...item })), responsibility],
  };
}

function appendFamilyDecision(
  ledger: FamilyLedgerState,
  record: FamilyDecisionRecord,
): FamilyLedgerState {
  return {
    ...ledger,
    decisions: [...ledger.decisions, record].slice(-24),
    trust: clamp(ledger.trust + record.trustDelta, 0, 100),
  };
}

export function recordFamilyAction(
  ledger: FamilyLedgerState,
  actionId: string,
  turn: number,
  success: boolean,
): FamilyLedgerState {
  let next: FamilyLedgerState = {
    ...ledger,
    responsibilities: ledger.responsibilities.map((item) => ({ ...item })),
    decisions: ledger.decisions.map((item) => ({ ...item })),
  };
  if (actionId === "family_budget") {
    next.stage = next.stage === "independent" ? "partnered" : next.stage;
    next.sharedCash += success ? 3_000 : 0;
    next = upsertResponsibility(next, {
      id: "shared-living",
      type: "shared_living",
      title: "共同生活与透明预算",
      owner: "shared",
      cashPerPeriod: 12_000,
      timePerPeriod: 2,
      priority: "必要",
      status: "active",
      startedTurn: turn,
    });
  }
  if (actionId === "insurance") {
    next = upsertResponsibility(next, {
      id: "family-protection",
      type: "protection",
      title: "家庭基础保障与续费复核",
      owner: "player",
      cashPerPeriod: 5_000,
      timePerPeriod: 1,
      priority: "重要",
      status: "active",
      startedTurn: turn,
    });
  }
  if (actionId === "care_parents") {
    next.stage = next.stage === "parenting" ? "multigenerational" : "caregiving";
    next = upsertResponsibility(next, {
      id: "elder-care",
      type: "eldercare",
      title: "长辈照护与医疗协调",
      owner: "shared",
      cashPerPeriod: 6_000,
      timePerPeriod: 3,
      priority: "必要",
      status: "active",
      startedTurn: turn,
    });
  }
  if (actionId === "build_family") {
    next.stage = next.stage === "independent" ? "partnered" : next.stage === "partnered" ? "parenting" : next.stage;
    next.sharedCash += success ? 6_000 : 0;
    if (next.stage === "parenting") {
      next = upsertResponsibility(next, {
        id: "child-care",
        type: "childcare",
        title: "育儿照护与教育准备",
        owner: "shared",
        cashPerPeriod: 4_800,
        timePerPeriod: 4,
        priority: "必要",
        status: "active",
        startedTurn: turn,
      });
    }
  }
  if (["family_budget", "insurance", "care_parents", "build_family"].includes(actionId)) {
    next = appendFamilyDecision(next, {
      id: `family-action-${turn}-${actionId}`,
      turn,
      title: actionId === "family_budget" ? "家庭财务会" : actionId === "insurance" ? "保障安排" : actionId === "care_parents" ? "长辈照护" : "家庭阶段选择",
      choice: actionId === "family_budget" ? "召开家庭财务会" : actionId === "insurance" ? "配置家庭保障" : actionId === "care_parents" ? "建立长辈照护方案" : "推进家庭阶段",
      outcome: success ? "承诺被写入长期家庭账本" : "承诺尚未稳定，仍保留本次冲突证据",
      trustDelta: success ? 3 : -2,
    });
  }
  return next;
}

export function recordFamilyEvent(
  ledger: FamilyLedgerState,
  turn: number,
  title: string,
  choice: string,
  success: boolean,
): FamilyLedgerState {
  return appendFamilyDecision(
    {
      ...ledger,
      decisions: ledger.decisions.map((item) => ({ ...item })),
      responsibilities: ledger.responsibilities.map((item) => ({ ...item })),
    },
    {
      id: `family-event-${turn}-${ledger.decisions.length + 1}`,
      turn,
      title,
      choice,
      outcome: success ? "家庭在现实结果中形成了新的协作证据" : "分歧和代价被保留为下一次谈判的前因",
      trustDelta: success ? 2 : -3,
    },
  );
}

export function getFamilyPressure(ledger: FamilyLedgerState): {
  activeCount: number;
  cashPerPeriod: number;
  timePerPeriod: number;
  pressureScore: number;
  warning: string;
} {
  const active = ledger.responsibilities.filter((item) => item.status === "active");
  const cashPerPeriod = active.reduce((sum, item) => sum + item.cashPerPeriod, 0);
  const timePerPeriod = active.reduce((sum, item) => sum + item.timePerPeriod, 0);
  const pressureScore = clamp(active.length * 10 + timePerPeriod * 4 + cashPerPeriod / 3_000 - ledger.trust * 0.25, 0, 100);
  const warning = pressureScore >= 65
    ? "责任负荷已经挤压现金与时间，需要重新分工或降低承诺。"
    : pressureScore >= 38
      ? "家庭责任可承受，但缺少缓冲时会迅速转为压力。"
      : "当前责任与信任仍有缓冲，可以讨论下一阶段。";
  return { activeCount: active.length, cashPerPeriod, timePerPeriod, pressureScore, warning };
}

interface AICandidate {
  id: string;
  title: string;
  risk: AIPlayerDecision["risk"];
  baseScore: number;
  cost: number;
  incomeDelta: number;
  debtDelta: number;
  reason: string;
}

export function decideAIPlayerTurn(
  player: AIPlayer,
  world: WorldState,
  turn: number,
  monthsInPeriod: number,
): AIPlayer {
  const text = `${player.archetype} ${player.goal} ${player.personality}`;
  const candidates: AICandidate[] = [
    {
      id: "reserve",
      title: "补充现金储备",
      risk: "低",
      baseScore: 28 + (player.cash < player.monthlyIncome * 4 ? 34 : 0) + (/安全|稳健|家庭/.test(text) ? 18 : 0) + (world.cycle === "衰退" ? 20 : 0),
      cost: 0,
      incomeDelta: 0,
      debtDelta: 0,
      reason: "现金缓冲与周期风险比扩张更紧迫",
    },
    {
      id: "pay_debt",
      title: "偿还高息负债",
      risk: "低",
      baseScore: 20 + (player.debt > player.cash * 0.35 ? 48 : 0) + world.interestRate * 180,
      cost: Math.min(player.debt, Math.max(2_000, player.cash * 0.1)),
      incomeDelta: 0,
      debtDelta: -Math.min(player.debt, Math.max(2_000, player.cash * 0.1)),
      reason: "负债与利率正在侵蚀未来选择权",
    },
    {
      id: "learn_automation",
      title: "学习并应用自动化工具",
      risk: "中",
      baseScore: 24 + (/技术|迁徙|学习/.test(text) ? 35 : 0) + (world.platformTrend.includes("AI") ? 24 : 0),
      cost: 4_000,
      incomeDelta: 240,
      debtDelta: 0,
      reason: "能力迁移能同时改善长期收入和行业适应性",
    },
    {
      id: "long_asset",
      title: "研究并配置长期资产",
      risk: "中",
      baseScore: 18 + (player.cash > 50_000 ? 25 : 0) + (world.cycle === "繁荣" ? 16 : 0) + (1 - player.risk) * 10,
      cost: 8_000,
      incomeDelta: 110,
      debtDelta: 0,
      reason: "现有现金允许把一部分选择权换成长期现金流",
    },
    {
      id: "side_business",
      title: "验证一项小型经营项目",
      risk: "高",
      baseScore: 18 + (/机会|经营|增长/.test(text) ? 40 : 0) + player.risk * 25 + (world.cycle === "繁荣" ? 14 : 0),
      cost: 7_000,
      incomeDelta: 420,
      debtDelta: 0,
      reason: "目标与风险偏好支持一次有边界的收入实验",
    },
    {
      id: "family_protection",
      title: "为家庭补充保障与照护",
      risk: "低",
      baseScore: 17 + (/家庭|守护|照护/.test(text) ? 52 : 0) + (world.cycle === "衰退" ? 10 : 0),
      cost: 3_000,
      incomeDelta: 0,
      debtDelta: 0,
      reason: "长期目标要求先降低家庭无法独立承受的风险",
    },
  ];
  const ranked = candidates
    .filter((candidate) => candidate.cost <= Math.max(0, player.cash - 5_000))
    .map((candidate) => ({
      ...candidate,
      score: candidate.baseScore + stableRoll(world.seed, turn, `${player.id}:${candidate.id}`) * 7,
    }))
    .sort((a, b) => b.score - a.score);
  const selected = ranked[0] ?? candidates[0];
  const periodSavings = Math.max(0, player.monthlyIncome * monthsInPeriod * 0.18);
  const riskSuccess = stableRoll(world.seed, turn, `${player.id}:outcome`) > player.risk * 0.22;
  const realizedIncomeDelta = riskSuccess ? selected.incomeDelta : Math.round(selected.incomeDelta * 0.15);
  const projectLoss = riskSuccess ? 0 : Math.round(selected.cost * 0.35);
  const decision: AIPlayerDecision = {
    turn,
    actionId: selected.id,
    title: selected.title,
    reason: `${selected.reason}；${riskSuccess ? "本期执行形成正向样本" : "执行结果偏离预期，策略会在下一期调整"}`,
    cashDelta: Math.round(periodSavings - selected.cost - projectLoss),
    incomeDelta: realizedIncomeDelta,
    debtDelta: selected.debtDelta,
    risk: selected.risk,
  };
  const stressDelta = selected.risk === "高" ? 5 : selected.id === "reserve" || selected.id === "family_protection" ? -3 : 1;
  return {
    ...player,
    cash: Math.max(5_000, player.cash + decision.cashDelta),
    monthlyIncome: Math.max(0, player.monthlyIncome + realizedIncomeDelta),
    debt: Math.max(0, player.debt + selected.debtDelta),
    energy: clamp(player.energy - (selected.risk === "高" ? 7 : 3) + 4, 0, 100),
    stress: clamp(player.stress + stressDelta, 0, 100),
    currentMove: selected.title,
    lastDecision: decision,
    decisionHistory: [...player.decisionHistory, decision].slice(-16),
    memories: [...player.memories, `第${turn}期：${selected.title}${riskSuccess ? "形成进展" : "出现偏差"}`].slice(-16),
  };
}

export function createRelationshipContract(
  turn: number,
  counterparty: Pick<AIPlayer, "id" | "name">,
  accepted: boolean,
): RelationshipContract {
  const status = accepted ? "active" : "rejected";
  return {
    id: `contract-${turn}-${counterparty.id}`,
    title: `${counterparty.name} · 联合项目协议`,
    counterpartyId: counterparty.id,
    counterpartyName: counterparty.name,
    type: "joint_project",
    status,
    playerDuty: "每期投入 2 点时间与 ¥2,000，完成约定交付",
    counterpartyDuty: "提供客户渠道、协作资源并按里程碑结算",
    contribution: 2_000,
    timeCost: 2,
    payout: 8_000,
    incomeDelta: 220,
    exitCost: 2_500,
    createdTurn: turn,
    nextDueTurn: turn + 1,
    lastFulfilledTurn: null,
    records: [
      { turn, action: "proposed", detail: "双方讨论了分工、投入、结算与退出边界。" },
      { turn, action: accepted ? "accepted" : "rejected", detail: accepted ? "协议生效，下一期开始履约。" : "对方依据目标与底线拒绝了提议。" },
    ],
  };
}
