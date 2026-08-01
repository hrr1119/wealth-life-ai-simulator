import {
  ASSETS,
  BOARD_STAGES,
  CAREERS,
  EVENTS,
  KNOWLEDGE_MODELS,
  MODES,
  ROLES,
  SKILLS,
  createAIPlayers,
} from "./content.ts";
import type {
  ActionResult,
  AnnualBriefing,
  ChapterSummary,
  ConsequenceScene,
  DeepActionId,
  DeepLifeState,
  DelayedConsequence,
  EventDefinition,
  GameState,
  HistoryEntry,
  MacroEventCard,
  NewGameConfig,
  NumericEffects,
  OpportunityCard,
  PlannedAction,
  ProbabilitySnapshot,
  QuestState,
  ReviewReport,
  TalentState,
  YearReveal,
} from "./types.ts";

const TALENT_KEYS = ["表达", "分析", "技术", "销售", "管理", "创意", "手艺", "研究"];

export const DEEP_ACTIONS: Array<{
  id: DeepActionId;
  category: string;
  name: string;
  description: string;
  cashCost: number;
  points: number;
  requires?: (state: GameState) => boolean;
  requiresLabel?: string;
}> = [
  {
    id: "tax_review",
    category: "税务",
    name: "整理税务与可扣除凭证",
    description: "核对预缴、家庭与经营扣除，减少年末税务波动。",
    cashCost: 1_200,
    points: 1,
  },
  {
    id: "protect_family",
    category: "保障",
    name: "升级家庭风险保障",
    description: "增加医疗、寿险与失能覆盖，以持续保费换取灾难风险的承受力。",
    cashCost: 2_000,
    points: 1,
  },
  {
    id: "raise_pension",
    category: "养老",
    name: "提高养老金缴费",
    description: "提高个人缴费比例，并尽量拿满雇主匹配。",
    cashCost: 0,
    points: 1,
  },
  {
    id: "buy_home",
    category: "住房",
    name: "购置长期居所",
    description: "支付首付并建立长期房贷；利率、房价与家庭计划会共同影响结果。",
    cashCost: 80_000,
    points: 3,
    requires: (state) => state.deep?.housing.tenure === "rent",
    requiresLabel: "仅租房状态可用",
  },
  {
    id: "refinance_home",
    category: "住房",
    name: "评估房贷再融资",
    description: "支付手续成本，争取把存量房贷利率向当前市场利率靠拢。",
    cashCost: 4_000,
    points: 2,
    requires: (state) => state.deep?.housing.tenure === "owner",
    requiresLabel: "购房后可用",
  },
  {
    id: "build_family",
    category: "家庭",
    name: "建立共同财务",
    description: "与伴侣明确账户、照护、住房和长期目标；可能迎来下一代。",
    cashCost: 12_000,
    points: 3,
  },
  {
    id: "care_parents",
    category: "照护",
    name: "安排父母长期照护",
    description: "用现金和时间建立医疗、陪伴与紧急联络方案。",
    cashCost: 6_000,
    points: 2,
  },
  {
    id: "start_business",
    category: "企业",
    name: "创办一家小型企业",
    description: "从小额资本、清晰股权和可验证订单开始，而不是把创业当作一次加薪。",
    cashCost: 30_000,
    points: 4,
    requires: (state) => !state.deep?.business.active,
    requiresLabel: "未创业时可用",
  },
  {
    id: "hire_team",
    category: "企业",
    name: "招聘并建立职责",
    description: "增加交付能力与固定成本，同时提高企业对治理的要求。",
    cashCost: 10_000,
    points: 3,
    requires: (state) => Boolean(state.deep?.business.active),
    requiresLabel: "创业后可用",
  },
  {
    id: "operate_business",
    category: "企业",
    name: "经营、补库存与拓客",
    description: "在库存、交付、客户和现金之间做一次完整季度经营。",
    cashCost: 5_000,
    points: 3,
    requires: (state) => Boolean(state.deep?.business.active),
    requiresLabel: "创业后可用",
  },
  {
    id: "estate_plan",
    category: "传承",
    name: "建立遗嘱与资产传承方案",
    description: "明确受益人、企业股权、照护责任和紧急授权。",
    cashCost: 8_000,
    points: 2,
  },
];

export const LIFE_ACTIONS = [
  {
    id: "side_project",
    category: "income",
    name: "验证一项副业",
    description: "用小额成本获得真实客户反馈，不急着辞职。",
    cashCost: 4_000,
    points: 3,
    base: 0.54,
    skillTags: ["sales", "delivery"],
    success: { cash: 9_000, monthlyIncome: 700, happiness: 2 },
    failure: { cash: -1_000, stress: 3 },
    knowledge: ["低成本试错", "收入多元"],
    memory: ["副业尝试"],
  },
  {
    id: "negotiate_raise",
    category: "career",
    name: "准备加薪谈判",
    description: "整理成果、行业数据与替代方案，再进入谈判。",
    cashCost: 1_000,
    points: 2,
    base: 0.48,
    skillTags: ["negotiation", "communication"],
    success: { monthlyIncome: 1_200, credit: 2 },
    failure: { stress: 2 },
    knowledge: ["人力资本", "机会成本"],
    memory: ["主动谈判"],
  },
  {
    id: "build_reserve",
    category: "wellbeing",
    name: "补足安全垫",
    description: "本回合减少可选消费，为突发事件保留选择权。",
    cashCost: 0,
    points: 2,
    base: 1,
    skillTags: [],
    success: { cash: 5_000, happiness: -1, stress: -2 },
    failure: {},
    knowledge: ["应急金", "机会成本"],
    memory: ["保留流动性"],
  },
  {
    id: "rest",
    category: "wellbeing",
    name: "主动休整",
    description: "降低短期产出，恢复判断、健康与长期精力。",
    cashCost: 2_000,
    points: 3,
    base: 1,
    skillTags: ["fitness", "mindfulness"],
    success: { health: 5, energy: 14, stress: -10, happiness: 4 },
    failure: {},
    knowledge: ["健康资本", "精力预算"],
    memory: ["主动休整"],
  },
  {
    id: "family_budget",
    category: "family",
    name: "召开家庭财务会",
    description: "把目标、支出、债务和个人边界放到桌面上。",
    cashCost: 500,
    points: 2,
    base: 0.68,
    skillTags: ["communication", "parenting"],
    success: { relationship: 7, stress: -3, fixedExpense: -200 },
    failure: { relationship: -2, stress: 3 },
    knowledge: ["家庭责任", "共同财务"],
    memory: ["透明沟通"],
  },
  {
    id: "network",
    category: "relationship",
    name: "维护关键关系",
    description: "不以索取为目标，提供一次具体而可靠的帮助。",
    cashCost: 1_500,
    points: 2,
    base: 0.66,
    skillTags: ["communication", "service"],
    success: { relationship: 6, credit: 2, happiness: 2 },
    failure: { energy: -2 },
    knowledge: ["关系复利", "信用"],
    memory: ["帮助他人"],
  },
  {
    id: "insurance",
    category: "family",
    name: "配置基础保障",
    description: "覆盖低概率、家庭难以独立承受的风险。",
    cashCost: 5_000,
    points: 2,
    base: 1,
    skillTags: ["risk"],
    success: { fixedExpense: 120, stress: -4 },
    failure: {},
    knowledge: ["保障", "应急金"],
    memory: ["拥有保障"],
  },
  {
    id: "debt_repay",
    category: "investment",
    name: "偿还高息负债",
    description: "获得确定性的利息节省，但会降低当期流动性。",
    cashCost: 10_000,
    points: 1,
    base: 1,
    skillTags: ["finance"],
    success: { debt: -12_000, stress: -3, credit: 2 },
    failure: {},
    knowledge: ["负债管理", "利率"],
    memory: ["主动降债"],
  },
] as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function seededRandom(seed: number, step = 0): number {
  let value = (seed ^ (step * 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4_294_967_296;
}

export function getLifeYear(state: Pick<GameState, "turn" | "timeScale">): number {
  return state.timeScale === "quarter" ? Math.ceil(state.turn / 4) : state.turn;
}

export function getQuarter(state: Pick<GameState, "turn" | "timeScale">): number | null {
  return state.timeScale === "quarter" ? ((state.turn - 1) % 4) + 1 : null;
}

export function getPeriodLabel(state: Pick<GameState, "turn" | "timeScale">): string {
  const quarter = getQuarter(state);
  return quarter ? `第 ${getLifeYear(state)} 年 · Q${quarter}` : `第 ${state.turn} 年`;
}

function createDeepLifeState(role: (typeof ROLES)[number]): DeepLifeState {
  return {
    tax: {
      withholdingRate: 0.08,
      yearTaxPaid: 0,
      deductions: 0,
      lastAnnualReconciliation: 0,
    },
    insurance: {
      healthCoverage: 120_000,
      lifeCoverage: 0,
      disabilityCoverage: 0,
      annualPremium: 2_400,
    },
    pension: {
      balance: Math.round(role.monthlyIncome * 2.5),
      contributionRate: 0.05,
      employerMatch: 0.03,
      retirementAge: 65,
    },
    housing: {
      tenure: "rent",
      propertyValue: 0,
      mortgageBalance: 0,
      mortgageRate: 0,
      termQuarters: 0,
    },
    family: {
      partnered: false,
      sharedCash: 0,
      children: [],
      parentCareLevel: 0,
      familyTrust: 55,
    },
    business: {
      active: false,
      name: "未命名事业",
      cash: 0,
      employees: 0,
      inventory: 0,
      monthlyRevenue: 0,
      monthlyCost: 0,
      equity: 1,
      governance: 0,
    },
    legacy: {
      willReady: false,
      estatePlan: 0,
      heirs: 0,
      generationScore: 0,
    },
  };
}

function copyState(state: GameState): GameState {
  return {
    ...state,
    world: { ...state.world, industryTrend: { ...state.world.industryTrend } },
    skills: { ...state.skills },
    assets: state.assets.map((asset) => ({ ...asset })),
    talents: Object.fromEntries(
      Object.entries(state.talents).map(([key, value]) => [key, { ...value }]),
    ),
    memory: { ...state.memory },
    revealedKnowledge: [...state.revealedKnowledge],
    annualBriefing: {
      ...state.annualBriefing,
      message: { ...state.annualBriefing.message },
    },
    plan: state.plan.map((item) => ({
      ...item,
      payload: item.payload ? { ...item.payload } : undefined,
    })),
    reveals: state.reveals.map((item) => ({
      ...item,
      statChanges: item.statChanges.map((change) => ({ ...change })),
      tags: [...item.tags],
    })),
    consequenceScene: state.consequenceScene
      ? {
          ...state.consequenceScene,
          unlocked: [...state.consequenceScene.unlocked],
          delayed: [...state.consequenceScene.delayed],
        }
      : null,
    chapterSummary: state.chapterSummary
      ? {
          ...state.chapterSummary,
          highlights: [...state.chapterSummary.highlights],
          unlockedRoutes: [...state.chapterSummary.unlockedRoutes],
        }
      : null,
    delayedConsequences: state.delayedConsequences.map((item) => ({
      ...item,
      effects: { ...item.effects },
    })),
    unlockedRoutes: [...state.unlockedRoutes],
    quests: state.quests.map((quest) => ({ ...quest })),
    chainProgress: { ...state.chainProgress },
    audits: [...state.audits],
    history: [...state.history],
    aiPlayers: state.aiPlayers.map((player) => ({ ...player, memories: [...player.memories] })),
    careerHistory: [...state.careerHistory],
    deep: state.deep
      ? {
          tax: { ...state.deep.tax },
          insurance: { ...state.deep.insurance },
          pension: { ...state.deep.pension },
          housing: { ...state.deep.housing },
          family: {
            ...state.deep.family,
            children: state.deep.family.children.map((child) => ({ ...child })),
          },
          business: { ...state.deep.business },
          legacy: { ...state.deep.legacy },
        }
      : null,
    pendingEvent: state.pendingEvent
      ? { ...state.pendingEvent, event: state.pendingEvent.event }
      : null,
    queuedPersonalEvent: state.queuedPersonalEvent
      ? { ...state.queuedPersonalEvent, event: state.queuedPersonalEvent.event }
      : null,
    macroEvent: state.macroEvent
      ? {
          ...state.macroEvent,
          affected: [...state.macroEvent.affected],
          choices: state.macroEvent.choices.map((choice) => ({
            ...choice,
            effects: { ...choice.effects },
            successEffects: { ...choice.successEffects },
            failureEffects: { ...choice.failureEffects },
            knowledgeTags: [...choice.knowledgeTags],
            memoryTags: [...choice.memoryTags],
          })),
        }
      : null,
    lastCard: { ...state.lastCard, tags: [...state.lastCard.tags] },
  };
}

function nextRoll(state: GameState): [number, GameState] {
  const next = copyState(state);
  const value = seededRandom(next.world.seed, next.rngStep);
  next.rngStep += 1;
  return [value, next];
}

function createTalents(seed: number): Record<string, TalentState> {
  return Object.fromEntries(
    TALENT_KEYS.map((key, index) => {
      const multiplier = 0.78 + seededRandom(seed, index + 101) * 0.56;
      return [
        key,
        {
          multiplier,
          samples: 0,
          revealed: false,
          level: "未知",
        } satisfies TalentState,
      ];
    }),
  );
}

function createWorld(seed: number) {
  const cities = ["云川市", "临港城", "北岭市", "河原城", "星澜市"];
  const cycles = ["繁荣", "平稳", "放缓", "衰退"] as const;
  const platforms = ["长内容复兴", "短视频红利", "私域增长", "AI工具扩散", "本地服务回暖"];
  return {
    seed,
    city: cities[Math.floor(seededRandom(seed, 1) * cities.length)],
    era: "新技术扩散期",
    cycle: cycles[Math.floor(seededRandom(seed, 2) * cycles.length)],
    interestRate: 0.028 + seededRandom(seed, 3) * 0.035,
    inflation: 0.012 + seededRandom(seed, 4) * 0.045,
    housingHeat: 0.25 + seededRandom(seed, 5) * 0.65,
    platformTrend: platforms[Math.floor(seededRandom(seed, 6) * platforms.length)],
    industryTrend: {
      互联网: 0.7 + seededRandom(seed, 7) * 0.7,
      制造: 0.7 + seededRandom(seed, 8) * 0.7,
      金融: 0.7 + seededRandom(seed, 9) * 0.7,
      内容: 0.7 + seededRandom(seed, 10) * 0.7,
      公共: 0.7 + seededRandom(seed, 11) * 0.7,
      跨境: 0.7 + seededRandom(seed, 12) * 0.7,
    },
  };
}

const CHAPTER_NAMES = ["起步期", "探索期", "扩张期", "承压期", "转型期", "收获期"];

function getChapterName(turn: number): string {
  return CHAPTER_NAMES[Math.min(CHAPTER_NAMES.length - 1, Math.floor((turn - 1) / 3))];
}

function getStateChapterName(state: Pick<GameState, "turn" | "timeScale">): string {
  return getChapterName(getLifeYear(state));
}

function createCorePlan(state: Pick<GameState, "turn" | "currentCareerId">): PlannedAction {
  const career = CAREERS.find((item) => item.id === state.currentCareerId);
  return {
    id: `plan-${state.turn}-core`,
    kind: "core",
    targetId: "primary_work",
    label: career ? `履行主业 · ${career.name}` : "履行主业",
    category: "主业",
    timeCost: 4,
    cashCost: 0,
  };
}

function createDefaultQuests(): QuestState[] {
  return [
    {
      id: "reserve",
      title: "六个月选择权",
      description: "把应急金覆盖提高到 6 个月。",
      progress: 0,
      target: 6,
      status: "active",
      rewardRoute: "逆周期行动",
    },
    {
      id: "learning",
      title: "能力留下证据",
      description: "完成 3 次学习或技能相关行动。",
      progress: 0,
      target: 3,
      status: "active",
      rewardRoute: "跨界职业",
    },
    {
      id: "alliance",
      title: "建立可信同盟",
      description: "让一位同桌角色的信任达到 70。",
      progress: 0,
      target: 70,
      status: "active",
      rewardRoute: "联合项目",
    },
  ];
}

function createAnnualBriefing(state: GameState): AnnualBriefing {
  const chapter = getStateChapterName(state);
  const lifeYear = getLifeYear(state);
  const quarter = getQuarter(state);
  const period = getPeriodLabel(state);
  const cycleCopy = {
    繁荣: "资本与招聘同时升温，但高估值正在放大判断代价。",
    平稳: "城市仍在增长，只是每个机会都更依赖真实能力与交付。",
    放缓: "订单和岗位开始分化，现金缓冲正在变成谈判筹码。",
    衰退: "收缩已经传到街区与办公室，但降本、照护和再训练需求逆势出现。",
  }[state.world.cycle];
  const player = state.aiPlayers[(state.turn - 1) % Math.max(1, state.aiPlayers.length)];
  const due = state.delayedConsequences?.find(
    (item) => item.status === "pending" && item.dueTurn <= state.turn + 1,
  );
  const newestRoute = state.unlockedRoutes?.at(-1);
  return {
    year: lifeYear,
    chapter,
    headline: `${state.world.city} · ${period}：${state.world.cycle}里的新秩序`,
    cityNews: `${cycleCopy}${state.world.platformTrend}正在重排本地机会，当前利率为 ${(state.world.interestRate * 100).toFixed(1)}%。`,
    message: {
      sender: player?.name ?? "城市观察员",
      role: player?.archetype ?? "同桌角色",
      body: player
        ? `“我今年准备${player.currentMove}。如果我们的目标冲突，我会优先守住：${player.boundary}。”`
        : "“先把有限时间放到最重要的承诺上。”",
    },
    aiSummary: state.aiPlayers
      .map((item) => `${item.name}${item.currentMove}`)
      .join("；"),
    routeUpdate: newestRoute
      ? `你过去的选择已解锁「${newestRoute}」，它会改变后续事件与合作入口。`
      : `棋盘上的「${BOARD_STAGES[Math.min(BOARD_STAGES.length - 1, state.turn - 1)].label}」正在成为今年的主场景。`,
    riskNote: due
      ? `延迟后果临近：${due.title}将在${due.dueTurn === state.turn ? "本期" : "下一期"}兑现。`
      : quarter === 4
        ? "年末季度：税务汇算、养老金增长、子女成长与长期资产会同步更新。"
      : state.world.cycle === "衰退" || state.world.cycle === "放缓"
        ? "风险区域：主业稳定性与现金流缓冲会共同影响下一次职业事件。"
        : "风险区域：繁荣期的过度扩张会在未来一到三年留下固定成本。",
  };
}

function normalizeAIPlayers(players: GameState["aiPlayers"] | undefined, seed: number) {
  const fallback = createAIPlayers(seed);
  return (players?.length ? players : fallback).map((player, index) => {
    const base = fallback[index % fallback.length];
    return {
      ...base,
      ...player,
      personality: player.personality ?? base.personality,
      boundary: player.boundary ?? base.boundary,
      monthlyIncome: player.monthlyIncome ?? base.monthlyIncome,
      debt: player.debt ?? base.debt,
      trust: player.trust ?? player.relationship ?? base.trust,
      memories: [...(player.memories ?? ["第一次同桌"])],
    };
  });
}

export function upgradeGameState(input: GameState | Record<string, unknown>): GameState | null {
  const legacy = input as unknown as GameState;
  if (!legacy?.world || !legacy.roleId) return null;
  const inferredTurnPhase =
    legacy.turnPhase ??
    (legacy.yearPhase === "planning"
      ? "action"
      : legacy.yearPhase === "chapter"
        ? "learning"
        : legacy.yearPhase === "reveal" || legacy.yearPhase === "consequence"
          ? "macro"
          : "world");
  const upgraded = {
    ...legacy,
    version: 4,
    timeScale: legacy.timeScale ?? "year",
    actionBudget: legacy.actionBudget ?? 8,
    age: legacy.age ?? 24 + Math.max(0, getLifeYear({
      turn: legacy.turn,
      timeScale: legacy.timeScale ?? "year",
    }) - 1),
    deep: legacy.deep ?? null,
    yearPhase: legacy.yearPhase ?? "opening",
    turnPhase: inferredTurnPhase,
    plan: [...(legacy.plan ?? [])],
    reveals: [...(legacy.reveals ?? [])],
    revealIndex: legacy.revealIndex ?? 0,
    consequenceScene: legacy.consequenceScene ?? null,
    chapterSummary: legacy.chapterSummary ?? null,
    delayedConsequences: [...(legacy.delayedConsequences ?? [])],
    unlockedRoutes: [...(legacy.unlockedRoutes ?? [])],
    quests: (legacy.quests?.length ? legacy.quests : createDefaultQuests()).map((quest) => ({ ...quest })),
    chainProgress: { ...(legacy.chainProgress ?? {}) },
    queuedPersonalEvent: legacy.queuedPersonalEvent ?? null,
    macroEvent: legacy.macroEvent ?? null,
    aiPlayers: normalizeAIPlayers(legacy.aiPlayers, legacy.world.seed),
  } as GameState;
  upgraded.annualBriefing = legacy.annualBriefing ?? createAnnualBriefing(upgraded);
  return upgraded;
}

export function createGame(config: NewGameConfig): GameState {
  const seed = Math.abs(config.seed ?? Math.floor(Date.now() % 2_147_483_647));
  const mode = MODES.find((item) => item.id === config.mode) ?? MODES[0];
  const role = ROLES.find((item) => item.id === config.roleId) ?? ROLES[0];
  const skills: Record<string, number> = {};
  for (const skill of role.starterSkills) skills[skill] = 1;

  const game: GameState = {
    version: 4,
    phase: "playing",
    yearPhase: "opening",
    turnPhase: "world",
    mode: mode.id,
    timeScale: mode.timeScale,
    actionBudget: mode.actionBudget,
    age: mode.startingAge,
    deep: mode.id === "deep" ? createDeepLifeState(role) : null,
    theme: config.theme,
    roleId: role.id,
    turn: 1,
    maxTurns: mode.turns,
    actionPoints: mode.actionBudget,
    opportunityTokens: mode.opportunityTokens,
    world: createWorld(seed),
    cash: role.cash,
    monthlyIncome: role.monthlyIncome,
    passiveIncome: 0,
    fixedExpense: role.fixedExpense,
    variableExpense: 800,
    debt: role.debt,
    health: role.health,
    energy: role.energy,
    happiness: role.happiness,
    stress: 100 - role.energy,
    credit: role.credit,
    relationship: 58,
    currentCareerId: role.id === "product" ? "product_manager" : role.id === "teacher" ? "teacher" : role.id === "freelancer" ? "designer" : role.id === "merchant" ? "restaurant" : role.id === "analyst" ? "researcher" : "engineer",
    careerHistory: [],
    skills,
    assets: [],
    talents: createTalents(seed),
    memory: { 开局: 1 },
    revealedKnowledge: ["现金流"],
    annualBriefing: {} as AnnualBriefing,
    plan: [],
    reveals: [],
    revealIndex: 0,
    consequenceScene: null,
    chapterSummary: null,
    delayedConsequences: [],
    unlockedRoutes: [],
    quests: createDefaultQuests(),
    chainProgress: {},
    pendingEvent: null,
    queuedPersonalEvent: null,
    macroEvent: null,
    lastCard: {
      eyebrow: "世界生成完成",
      title: `${role.name}，欢迎来到${createWorld(seed).city}`,
      narrative: `这是一局由种子 #${String(seed).slice(-6)} 驱动的独立人生。当前经济处于${createWorld(seed).cycle}阶段，${createWorld(seed).platformTrend}正在改变机会分布。没有固定答案，只有可解释的取舍。`,
      tags: ["独立世界", "隐藏画像", mode.name],
    },
    audits: [],
    history: [
      {
        id: "h-1",
        turn: 1,
        type: "system",
        title: "人生实验开始",
        description: `${role.name}在${createWorld(seed).city}开始了新的财务人生。${mode.id === "deep" ? "这是一段按季度推进的 60 年长期人生。" : ""}`,
        tags: ["开局"],
        timestamp: Date.now(),
      },
    ],
    aiPlayers: createAIPlayers(seed),
    rngStep: 200,
    savedAt: Date.now(),
  };
  game.annualBriefing = createAnnualBriefing(game);
  return game;
}

export function getNetWorth(state: GameState): number {
  const marketAssets = state.assets.reduce((sum, asset) => sum + asset.value, 0);
  const deepAssets = state.deep
    ? state.deep.pension.balance +
      Math.max(0, state.deep.housing.propertyValue - state.deep.housing.mortgageBalance) +
      state.deep.family.sharedCash +
      Math.max(
        0,
        state.deep.business.cash +
          state.deep.business.inventory +
          state.deep.business.monthlyRevenue * 3 -
          state.deep.business.monthlyCost * 3,
      ) *
        state.deep.business.equity
    : 0;
  return state.cash + marketAssets + deepAssets - state.debt;
}

export function getEmergencyMonths(state: GameState): number {
  const monthlyNeed = Math.max(1, state.fixedExpense + state.variableExpense);
  return Math.max(0, state.cash / monthlyNeed);
}

export function getFinancialFreedomProgress(state: GameState): number {
  return clamp(state.passiveIncome / Math.max(1, state.fixedExpense + state.variableExpense), 0, 2);
}

function addHistory(
  state: GameState,
  entry: Omit<HistoryEntry, "id" | "timestamp" | "turn"> & { turn?: number },
): GameState {
  const next = copyState(state);
  next.history.push({
    ...entry,
    id: `h-${next.turn}-${next.history.length + 1}`,
    turn: entry.turn ?? next.turn,
    timestamp: Date.now(),
  });
  return next;
}

function addKnowledge(state: GameState, tags: string[]): GameState {
  const next = copyState(state);
  for (const tag of tags) {
    const normalized = KNOWLEDGE_MODELS[tag] ? tag : normalizeKnowledgeTag(tag);
    if (normalized && !next.revealedKnowledge.includes(normalized)) {
      next.revealedKnowledge.push(normalized);
    }
  }
  return next;
}

function normalizeKnowledgeTag(tag: string): string | null {
  const map: Record<string, string> = {
    保障: "应急金",
    预算: "现金流",
    共同财务: "家庭责任",
    精力预算: "健康资本",
    职业韧性: "人力资本",
    职业转型: "时代适配",
    基本面: "尽调",
    集中风险: "资产配置",
    分散: "资产配置",
    期限错配: "现金流",
    经营杠杆: "负债管理",
    过劳: "健康资本",
    平台风险: "时代适配",
    房产: "资产配置",
    信用: "信用",
    合伙治理: "合同",
    边界: "关系复利",
    关系: "关系复利",
    教育投入: "人力资本",
    保险: "应急金",
    周期: "时代适配",
    竞争: "时代适配",
    毛利: "现金流",
    税务: "合规",
    不可逆风险: "合规",
    能力圈: "尽调",
    收入多元: "收入多元",
    内容复利: "复利",
    关系复利: "关系复利",
    生活方式膨胀: "生活方式膨胀",
    损失厌恶: "行为偏差",
  };
  return map[tag] ?? null;
}

function addMemory(state: GameState, tags: string[]): GameState {
  const next = copyState(state);
  for (const tag of tags) next.memory[tag] = (next.memory[tag] ?? 0) + 1;
  return next;
}

function applyEffects(state: GameState, effects: NumericEffects): GameState {
  const next = copyState(state);
  next.cash += effects.cash ?? 0;
  next.monthlyIncome = Math.max(0, next.monthlyIncome + (effects.monthlyIncome ?? 0));
  next.fixedExpense = Math.max(500, next.fixedExpense + (effects.fixedExpense ?? 0));
  next.passiveIncome = Math.max(0, next.passiveIncome + (effects.passiveIncome ?? 0));
  next.debt = Math.max(0, next.debt + (effects.debt ?? 0));
  next.health = clamp(next.health + (effects.health ?? 0), 0, 100);
  next.energy = clamp(next.energy + (effects.energy ?? 0), 0, 100);
  next.happiness = clamp(next.happiness + (effects.happiness ?? 0), 0, 100);
  next.stress = clamp(next.stress + (effects.stress ?? 0), 0, 100);
  next.credit = clamp(next.credit + (effects.credit ?? 0), 0, 100);
  next.relationship = clamp(next.relationship + (effects.relationship ?? 0), 0, 100);
  if (next.cash < 0) {
    next.debt += Math.abs(next.cash) * 1.08;
    next.cash = 0;
    next.memory["现金缺口"] = (next.memory["现金缺口"] ?? 0) + 1;
  }
  next.savedAt = Date.now();
  return next;
}

function talentKeyForSkills(skillIds: string[]): string {
  const joined = skillIds.join(" ");
  if (/design|video|photo|voice|writing/.test(joined)) return "创意";
  if (/sales|negotiation|service/.test(joined)) return "销售";
  if (/coding|engineering|automation|repair/.test(joined)) return "技术";
  if (/data|math|finance|valuation|accounting/.test(joined)) return "分析";
  if (/management|leadership|operations/.test(joined)) return "管理";
  if (/research|law|compliance/.test(joined)) return "研究";
  if (/cooking|repair/.test(joined)) return "手艺";
  return "表达";
}

function sampleTalent(state: GameState, skillIds: string[]): GameState {
  if (skillIds.length === 0) return state;
  const next = copyState(state);
  const key = talentKeyForSkills(skillIds);
  const talent = next.talents[key];
  talent.samples += 1;
  if (talent.samples >= 2) talent.revealed = true;
  if (talent.samples >= 5) talent.level = "已确认";
  else if (talent.samples >= 2) talent.level = "初步显现";
  if (talent.samples >= 8 && talent.multiplier >= 1.12) talent.level = "高度开发";
  return next;
}

function probabilitySnapshot(
  state: GameState,
  label: string,
  base: number,
  skillIds: string[],
  resourceAdequacy: number,
  environmentTag?: string,
): [ProbabilitySnapshot, GameState] {
  const skillAverage =
    skillIds.length === 0
      ? 0
      : skillIds.reduce((sum, id) => sum + (state.skills[id] ?? 0), 0) / skillIds.length;
  const skillModifier = clamp((skillAverage - 1) * 0.055, -0.08, 0.18);
  const resourceModifier = clamp((resourceAdequacy - 0.5) * 0.18, -0.12, 0.09);
  const relationshipModifier = clamp((state.relationship - 50) / 600, -0.07, 0.08);
  const talentKey = talentKeyForSkills(skillIds);
  const talent = state.talents[talentKey];
  const talentModifier = clamp((talent.multiplier - 1) * 0.18, -0.05, 0.07);
  const industry = environmentTag ? state.world.industryTrend[environmentTag] ?? 1 : 1;
  const cycleFactor = { 繁荣: 0.045, 平稳: 0.01, 放缓: -0.035, 衰退: -0.075 }[state.world.cycle];
  const environmentModifier = clamp((industry - 1) * 0.12 + cycleFactor, -0.14, 0.11);
  const finalProbability = clamp(
    base +
      skillModifier +
      resourceModifier +
      relationshipModifier +
      talentModifier +
      environmentModifier,
    0.06,
    0.94,
  );
  const [roll, rolledState] = nextRoll(state);
  const success = roll <= finalProbability;
  const summary = [
    skillModifier >= 0.03 ? "相关技能形成正向修正" : "相关技能样本仍不足",
    resourceModifier >= 0 ? "资源准备较充分" : "时间或资金准备偏紧",
    environmentModifier >= 0 ? "当前环境提供顺风" : "宏观与行业环境形成逆风",
    relationshipModifier >= 0.03 ? "信用与关系网络提供帮助" : "关系修正有限",
    success ? "随机结果落在成功区间" : "随机结果落在失败区间",
  ];
  return [
    {
      id: `audit-${state.turn}-${state.audits.length + 1}`,
      label,
      base,
      skillModifier,
      resourceModifier,
      relationshipModifier,
      environmentModifier,
      talentModifier,
      finalProbability,
      roll,
      success,
      summary,
    },
    rolledState,
  ];
}

function finalizeActionCard(
  state: GameState,
  snapshot: ProbabilitySnapshot | null,
  eyebrow: string,
  title: string,
  narrative: string,
  tags: string[],
  outcome: string,
): GameState {
  const next = copyState(state);
  if (snapshot) next.audits.push(snapshot);
  next.lastCard = { eyebrow, title, narrative, tags, outcome };
  next.savedAt = Date.now();
  return next;
}

export function learnSkill(state: GameState, skillId: string): ActionResult {
  const skill = SKILLS.find((item) => item.id === skillId);
  if (!skill) return { state, success: false, message: "未找到这项技能。" };
  if (state.pendingEvent) return { state, success: false, message: "请先处理当前事件。" };
  if (state.actionPoints < skill.timeCost) return { state, success: false, message: "本回合时间预算不足。" };
  if (state.cash < skill.cost) return { state, success: false, message: "现金不足，不能在此时承担学习成本。" };

  const level = state.skills[skillId] ?? 0;
  const base = clamp(0.76 - level * 0.09, 0.45, 0.82);
  const [snapshot, rolled] = probabilitySnapshot(
    state,
    `学习：${skill.name}`,
    base,
    [skillId],
    state.energy / 100,
    skill.tags.includes("互联网") ? "互联网" : undefined,
  );
  let next = applyEffects(rolled, {
    cash: -skill.cost,
    energy: -skill.timeCost * 3,
    stress: skill.timeCost,
    happiness: snapshot.success ? 2 : -1,
  });
  next.actionPoints -= skill.timeCost;
  next.skills[skillId] = clamp(level + (snapshot.success ? 1 : 0.35), 0, 5);
  next = sampleTalent(next, [skillId]);
  next = addKnowledge(next, ["人力资本", "机会成本"]);
  next = addMemory(next, ["持续学习", `${skill.category}学习`]);
  const outcome = snapshot.success
    ? `掌握度提升到 ${next.skills[skillId].toFixed(1)}，获得了可用于职业与机会判断的新样本。`
    : "这次学习没有立刻形成熟练度，但投入成为下一次尝试的经验样本。";
  next = finalizeActionCard(
    next,
    snapshot,
    "学习行动 · 已裁决",
    snapshot.success ? `${skill.name}开始形成能力` : `${skill.name}还需要更多练习`,
    `${skill.description} 系统没有把投入自动等同于成功，而是综合精力、天赋样本、环境与随机结果进行裁决。`,
    [...skill.tags, "人力资本"],
    outcome,
  );
  next = addHistory(next, {
    type: "action",
    title: `学习 ${skill.name}`,
    description: outcome,
    cashDelta: -skill.cost,
    tags: ["学习", ...skill.tags],
  });
  return { state: next, success: true, message: outcome };
}

export function switchCareer(state: GameState, careerId: string): ActionResult {
  const career = CAREERS.find((item) => item.id === careerId);
  if (!career) return { state, success: false, message: "未找到这条职业路线。" };
  if (state.pendingEvent) return { state, success: false, message: "请先处理当前事件。" };
  const points = 4;
  if (state.actionPoints < points) return { state, success: false, message: "本回合时间预算不足。" };
  if (state.cash < career.entryCost) return { state, success: false, message: "现金不足以覆盖转型期成本。" };
  const matched = career.requiredSkills.filter((id) => (state.skills[id] ?? 0) >= 1).length;
  const preparedness = career.requiredSkills.length ? matched / career.requiredSkills.length : 0.5;
  const [snapshot, rolled] = probabilitySnapshot(
    state,
    `职业转型：${career.name}`,
    0.38 + career.stability * 0.18,
    career.requiredSkills,
    preparedness * 0.6 + state.energy / 250,
    career.tags[0],
  );
  let next = applyEffects(rolled, {
    cash: -career.entryCost,
    energy: -12,
    stress: 6,
    monthlyIncome: snapshot.success ? career.monthlyIncome - state.monthlyIncome : 0,
    happiness: snapshot.success ? 4 : -2,
  });
  next.actionPoints -= points;
  if (snapshot.success) {
    next.careerHistory.push(next.currentCareerId);
    next.currentCareerId = career.id;
  }
  next = sampleTalent(next, career.requiredSkills);
  next = addKnowledge(next, ["人力资本", "时代适配", "机会成本"]);
  next = addMemory(next, [snapshot.success ? "成功转型" : "转型受挫", ...career.tags]);
  const outcome = snapshot.success
    ? `你进入了${career.name}，月主动收入调整为 ${formatMoney(next.monthlyIncome)}。`
    : `这次没有拿到${career.name}的入场资格，但履历与技能样本被保留。`;
  next = finalizeActionCard(
    next,
    snapshot,
    "职业分岔 · 已裁决",
    snapshot.success ? `新的身份：${career.name}` : `${career.name}暂未向你开放`,
    `职业不是一张永久身份卡。前置技能、准备程度、行业景气、信用关系与隐藏适配共同影响这次转型。`,
    [career.category, ...career.tags],
    outcome,
  );
  next = addHistory(next, {
    type: "action",
    title: `尝试转向${career.name}`,
    description: outcome,
    cashDelta: -career.entryCost,
    tags: ["职业", ...career.tags],
  });
  return { state: next, success: true, message: outcome };
}

export function buyAsset(state: GameState, assetId: string, amount?: number): ActionResult {
  const asset = ASSETS.find((item) => item.id === assetId);
  if (!asset) return { state, success: false, message: "未找到这项资产。" };
  if (state.pendingEvent) return { state, success: false, message: "请先处理当前事件。" };
  const points = asset.category === "房产" || asset.category === "企业股权" ? 3 : 1;
  const investAmount = Math.max(asset.minimum, amount ?? asset.minimum);
  if (state.actionPoints < points) return { state, success: false, message: "本回合时间预算不足。" };
  if (state.cash < investAmount) return { state, success: false, message: "可用现金不足，系统不会自动用消费贷补齐投资。" };

  let next = applyEffects(state, { cash: -investAmount, energy: -points * 2 });
  next.actionPoints -= points;
  const held = next.assets.find((item) => item.id === asset.id);
  if (held) {
    held.units += 1;
    held.costBasis += investAmount;
    held.value += investAmount;
  } else {
    next.assets.push({
      id: asset.id,
      name: asset.name,
      category: asset.category,
      units: 1,
      costBasis: investAmount,
      value: investAmount,
      cashYield: asset.cashYield,
      risk: asset.risk,
    });
  }
  next.passiveIncome = next.assets.reduce(
    (sum, item) => sum + (item.value * item.cashYield) / 12,
    0,
  );
  next = addKnowledge(next, ["资产配置", "波动", "流动性"]);
  next = addMemory(next, [`投资:${asset.category}`, asset.risk === "高" || asset.risk === "极高" ? "高风险暴露" : "纪律投资"]);
  const outcome = `投入 ${formatMoney(investAmount)}。价格将在年度结算时随基本回报、宏观周期与随机波动变化。`;
  next = finalizeActionCard(
    next,
    null,
    "资产配置 · 已建仓",
    `你持有了${asset.name}`,
    `${asset.description} 系统同时记录收益来源、波动、流动性和集中风险，而不是只展示一个预期收益率。`,
    [asset.category, asset.risk + "风险", ...asset.tags],
    outcome,
  );
  next = addHistory(next, {
    type: "action",
    title: `买入${asset.name}`,
    description: outcome,
    cashDelta: -investAmount,
    tags: ["投资", asset.category, ...asset.tags],
  });
  return { state: next, success: true, message: outcome };
}

export function takeLifeAction(state: GameState, actionId: string): ActionResult {
  const action = LIFE_ACTIONS.find((item) => item.id === actionId);
  if (!action) return { state, success: false, message: "未找到这项行动。" };
  if (state.pendingEvent) return { state, success: false, message: "请先处理当前事件。" };
  if (state.actionPoints < action.points) return { state, success: false, message: "本回合时间预算不足。" };
  if (state.cash < action.cashCost) return { state, success: false, message: "当前现金不足以执行这项行动。" };
  if (action.id === "debt_repay" && state.debt <= 0) {
    return { state, success: false, message: "你目前没有需要偿还的负债。" };
  }
  const [snapshot, rolled] = probabilitySnapshot(
    state,
    action.name,
    action.base,
    [...action.skillTags],
    state.energy / 100,
  );
  let next = applyEffects(rolled, {
    cash: -action.cashCost,
    energy: -action.points * 2,
    ...(snapshot.success ? action.success : action.failure),
  });
  next.actionPoints -= action.points;
  next = sampleTalent(next, [...action.skillTags]);
  next = addKnowledge(next, [...action.knowledge]);
  next = addMemory(next, [...action.memory, `行动:${action.category}`]);
  const outcome = snapshot.success
    ? "行动达成了主要目标，相关状态与人生记忆已经更新。"
    : "行动没有得到预期结果，但成本、经验与后续影响仍然真实存在。";
  next = finalizeActionCard(
    next,
    snapshot,
    "人生行动 · 已裁决",
    snapshot.success ? `${action.name}取得进展` : `${action.name}出现偏差`,
    action.description,
    [action.category, ...action.knowledge],
    outcome,
  );
  next = addHistory(next, {
    type: "action",
    title: action.name,
    description: outcome,
    cashDelta:
      -action.cashCost +
      (() => {
        const effects = snapshot.success ? action.success : action.failure;
        return "cash" in effects && typeof effects.cash === "number" ? effects.cash : 0;
      })(),
    tags: ["行动", action.category, ...action.knowledge],
  });
  return { state: next, success: true, message: outcome };
}

export function resolveOpportunity(state: GameState, card: OpportunityCard): ActionResult {
  if (state.pendingEvent) return { state, success: false, message: "请先处理当前事件。" };
  if (state.opportunityTokens <= 0) return { state, success: false, message: "本局自由机会次数已经用完。" };
  if (state.actionPoints < card.timeCost) return { state, success: false, message: "本回合时间预算不足。" };
  if (state.cash < card.cashCost) return { state, success: false, message: "当前现金不足以承担这张机会卡。" };

  const [snapshot, rolled] = probabilitySnapshot(
    state,
    `自由机会：${card.title}`,
    card.baseProbability,
    card.skillTags,
    state.energy / 100,
    card.environmentTags[0],
  );
  const incomeBoost = snapshot.success
    ? Math.round(card.cashCost * (0.35 + card.baseProbability * 0.5))
    : 0;
  let next = applyEffects(rolled, {
    cash: -card.cashCost + (snapshot.success ? Math.round(card.cashCost * 0.25) : 0),
    monthlyIncome: snapshot.success ? Math.max(300, incomeBoost / 10) : 0,
    energy: -card.energyCost,
    stress: snapshot.success ? 2 : 5,
    happiness: snapshot.success ? 5 : -1,
    credit: snapshot.success ? 2 : 0,
  });
  next.opportunityTokens -= 1;
  next.actionPoints -= card.timeCost;
  next = sampleTalent(next, card.skillTags);
  next = addKnowledge(next, ["低成本试错", "机会成本", card.risk === "高" || card.risk === "极高" ? "尽调" : "人力资本"]);
  next = addMemory(next, ["使用自由机会", `开放想法:${card.category}`, ...card.environmentTags]);
  const outcome = snapshot.success
    ? `${card.upside} 这不是AI直接发放的奖励，而是规则引擎在资源、能力、环境和随机扰动下的结果。`
    : `${card.downside} 失败被保留为人生样本，可能影响后续事件与天赋揭示。`;
  next = finalizeActionCard(
    next,
    snapshot,
    "自由机会 · 规则已裁决",
    snapshot.success ? `${card.title}打开了一条新路线` : `${card.title}完成了一次试错`,
    card.description,
    [card.category, card.risk + "风险", ...card.skillTags],
    outcome,
  );
  next = addHistory(next, {
    type: "action",
    title: `自由机会：${card.title}`,
    description: outcome,
    cashDelta: -card.cashCost + (snapshot.success ? Math.round(card.cashCost * 0.25) : 0),
    tags: ["自由机会", card.category, ...card.skillTags],
  });
  return { state: next, success: true, message: outcome };
}

export const AI_INTERACTIONS = [
  {
    id: "request_help",
    label: "请求一次具体帮助",
    description: "说明目标、已有准备与希望对方提供的具体资源，对方会按信任与边界决定。",
    timeCost: 2,
    cashCost: 0,
  },
  {
    id: "offer_help",
    label: "先提供可靠帮助",
    description: "不立即索取回报，用一次真实交付建立长期互惠记忆。",
    timeCost: 2,
    cashCost: 1_500,
  },
  {
    id: "joint_project",
    label: "提议联合项目",
    description: "共同出资、明确分工和退出机制，收益与冲突都会进入长期记忆。",
    timeCost: 3,
    cashCost: 6_000,
  },
  {
    id: "negotiate",
    label: "重谈合作条件",
    description: "把利益、底线和替代方案摆到桌面，避免模糊承诺继续累积。",
    timeCost: 1,
    cashCost: 500,
  },
] as const;

function getPlannedTime(state: GameState): number {
  return state.plan.reduce((sum, item) => sum + item.timeCost, 0);
}

function getPlannedCash(state: GameState): number {
  return state.plan.reduce((sum, item) => sum + item.cashCost, 0);
}

function schedulePlanItem(state: GameState, item: Omit<PlannedAction, "id">): ActionResult {
  if (state.pendingEvent) {
    return { state, success: false, message: "先处理年度开场事件，再安排计划。" };
  }
  if (state.yearPhase !== "planning") {
    return { state, success: false, message: "当前不是年度计划阶段。" };
  }
  if (state.plan.some((planned) => planned.kind === item.kind && planned.targetId === item.targetId && planned.targetPlayerId === item.targetPlayerId)) {
    return { state, success: false, message: "这项安排已经在年度计划中。" };
  }
  if (getPlannedTime(state) + item.timeCost > state.actionBudget) {
    return { state, success: false, message: `${state.timeScale === "quarter" ? "季度" : "年度"}时间预算不足，请先移除一项安排。` };
  }
  if (getPlannedCash(state) + item.cashCost > state.cash) {
    return { state, success: false, message: "计划中的现金支出已经超过当前可用现金。" };
  }
  const next = copyState(state);
  next.plan.push({
    ...item,
    id: `plan-${next.turn}-${next.plan.length + 1}-${item.kind}-${item.targetId}`,
  });
  next.savedAt = Date.now();
  return { state: next, success: true, message: `已把「${item.label}」放入${getPeriodLabel(state)}计划。` };
}

export function beginYearPlanning(state: GameState): ActionResult {
  if (state.pendingEvent) {
    return { state, success: false, message: "先回应年度开场事件。" };
  }
  if (state.yearPhase !== "opening") {
    return { state, success: false, message: `本${state.timeScale === "quarter" ? "季度" : "年度"}已经进入计划或结算流程。` };
  }
  const next = copyState(state);
  next.yearPhase = "planning";
  next.plan = [createCorePlan(next)];
  next.reveals = [];
  next.revealIndex = 0;
  next.consequenceScene = null;
  next.lastCard = {
    eyebrow: `${getStateChapterName(next)} · ${next.timeScale === "quarter" ? "季度" : "年度"}计划`,
    title: "先把时间放到真正重要的承诺上",
    narrative: `主业已经占用 4 点基础时间。剩余 ${next.actionBudget - 4} 点可以投入学习、关系、家庭、投资${next.deep ? "、企业、税务、养老" : ""}或一次自由机会；所有安排会在确认后一起揭晓。`,
    tags: ["同时规划", "时间预算", "机会成本"],
  };
  return { state: next, success: true, message: `${next.timeScale === "quarter" ? "季度" : "年度"}计划桌已展开。` };
}

export function removePlannedAction(state: GameState, planId: string): ActionResult {
  if (state.yearPhase !== "planning") {
    return { state, success: false, message: "只有计划阶段可以调整安排。" };
  }
  const item = state.plan.find((planned) => planned.id === planId);
  if (!item || item.kind === "core") {
    return { state, success: false, message: "主业时间是本年度的基础承诺，不能直接移除。" };
  }
  const next = copyState(state);
  next.plan = next.plan.filter((planned) => planned.id !== planId);
  return { state: next, success: true, message: `已移除「${item.label}」。` };
}

export function scheduleSkill(state: GameState, skillId: string): ActionResult {
  const skill = SKILLS.find((item) => item.id === skillId);
  if (!skill) return { state, success: false, message: "未找到这项技能。" };
  return schedulePlanItem(state, {
    kind: "skill",
    targetId: skill.id,
    label: `学习 · ${skill.name}`,
    category: "学习",
    timeCost: skill.timeCost,
    cashCost: skill.cost,
  });
}

export function scheduleCareer(state: GameState, careerId: string): ActionResult {
  const career = CAREERS.find((item) => item.id === careerId);
  if (!career) return { state, success: false, message: "未找到这条职业路线。" };
  if (state.currentCareerId === career.id) {
    return { state, success: false, message: "这已经是你的当前职业。" };
  }
  return schedulePlanItem(state, {
    kind: "career",
    targetId: career.id,
    label: `职业转型 · ${career.name}`,
    category: "职业",
    timeCost: 4,
    cashCost: career.entryCost,
  });
}

export function scheduleAsset(state: GameState, assetId: string): ActionResult {
  const asset = ASSETS.find((item) => item.id === assetId);
  if (!asset) return { state, success: false, message: "未找到这项资产。" };
  return schedulePlanItem(state, {
    kind: "asset",
    targetId: asset.id,
    label: `配置资产 · ${asset.name}`,
    category: "投资",
    timeCost: asset.category === "房产" || asset.category === "企业股权" ? 3 : 1,
    cashCost: asset.minimum,
  });
}

export function scheduleLifeAction(state: GameState, actionId: string): ActionResult {
  const action = LIFE_ACTIONS.find((item) => item.id === actionId);
  if (!action) return { state, success: false, message: "未找到这项行动。" };
  return schedulePlanItem(state, {
    kind: "life",
    targetId: action.id,
    label: action.name,
    category: action.category,
    timeCost: action.points,
    cashCost: action.cashCost,
  });
}

export function scheduleDeepAction(state: GameState, actionId: DeepActionId): ActionResult {
  if (!state.deep) {
    return { state, success: false, message: "长期人生系统只在深度人生中开放。" };
  }
  const action = DEEP_ACTIONS.find((item) => item.id === actionId);
  if (!action) return { state, success: false, message: "未找到这项长期行动。" };
  if (action.requires && !action.requires(state)) {
    return { state, success: false, message: action.requiresLabel ?? "当前条件不满足。" };
  }
  return schedulePlanItem(state, {
    kind: "deep",
    targetId: action.id,
    label: action.name,
    category: action.category,
    timeCost: action.points,
    cashCost: action.cashCost,
  });
}

export function scheduleOpportunity(state: GameState, card: OpportunityCard): ActionResult {
  const plannedOpportunities = state.plan.filter((item) => item.kind === "opportunity").length;
  if (plannedOpportunities >= state.opportunityTokens) {
    return { state, success: false, message: "本局剩余自由机会不足。" };
  }
  return schedulePlanItem(state, {
    kind: "opportunity",
    targetId: card.id,
    label: `自由机会 · ${card.title}`,
    category: "机会",
    timeCost: card.timeCost,
    cashCost: card.cashCost,
    payload: card,
  });
}

export function scheduleAIInteraction(
  state: GameState,
  playerId: string,
  interactionId: string,
): ActionResult {
  const player = state.aiPlayers.find((item) => item.id === playerId);
  const interaction = AI_INTERACTIONS.find((item) => item.id === interactionId);
  if (!player || !interaction) {
    return { state, success: false, message: "未找到这位角色或互动方式。" };
  }
  return schedulePlanItem(state, {
    kind: "social",
    targetId: interaction.id,
    targetPlayerId: player.id,
    label: `${interaction.label} · ${player.name}`,
    category: "关系",
    timeCost: interaction.timeCost,
    cashCost: interaction.cashCost,
  });
}

function resolveCorePlan(state: GameState): ActionResult {
  let next = applyEffects(state, { energy: -6, stress: 2 });
  next.actionPoints = Math.max(0, next.actionPoints - 4);
  next = addMemory(next, ["履行主业", "稳定交付"]);
  const outcome = "你完成了本年度的基础工作承诺，主动收入资格与职业信用被保留。";
  next = finalizeActionCard(
    next,
    null,
    "年度计划 · 主业",
    "先守住正在承担的责任",
    "主业占用四点时间，也提供现金流、社会连接与职业样本。它不是背景数字，而是你主动保留的一条路线。",
    ["主业", "现金流", "信用"],
    outcome,
  );
  next = addHistory(next, {
    type: "action",
    title: "履行主业",
    description: outcome,
    tags: ["主业", "信用"],
  });
  return { state: next, success: true, message: outcome };
}

function resolveSocialPlan(state: GameState, item: PlannedAction): ActionResult {
  const playerIndex = state.aiPlayers.findIndex((player) => player.id === item.targetPlayerId);
  const interaction = AI_INTERACTIONS.find((candidate) => candidate.id === item.targetId);
  if (playerIndex < 0 || !interaction) {
    return { state, success: false, message: "互动对象已经离开当前关系网络。" };
  }
  const player = state.aiPlayers[playerIndex];
  const base =
    interaction.id === "offer_help"
      ? 0.9
      : interaction.id === "joint_project"
        ? 0.42 + player.trust / 400
        : 0.5 + player.trust / 350;
  const [snapshot, rolled] = probabilitySnapshot(
    state,
    `${player.name}：${interaction.label}`,
    base,
    ["communication", "negotiation"],
    state.energy / 100,
  );
  let next = applyEffects(rolled, {
    cash: -interaction.cashCost,
    energy: -interaction.timeCost * 2,
    relationship: snapshot.success ? 3 : -1,
    monthlyIncome:
      snapshot.success && (interaction.id === "request_help" || interaction.id === "joint_project")
        ? interaction.id === "joint_project"
          ? 650
          : 250
        : 0,
    credit: snapshot.success ? 1 : 0,
  });
  next.actionPoints -= interaction.timeCost;
  const target = next.aiPlayers[playerIndex];
  const trustDelta =
    interaction.id === "offer_help"
      ? 9
      : interaction.id === "negotiate"
        ? snapshot.success
          ? 5
          : -2
        : snapshot.success
          ? 6
          : -4;
  target.trust = clamp(target.trust + trustDelta, 0, 100);
  target.relationship = clamp(target.relationship + trustDelta, 0, 100);
  target.memories.push(
    snapshot.success
      ? `第${state.turn}年：${interaction.label}达成`
      : `第${state.turn}年：${interaction.label}未达成`,
  );
  target.currentMove = snapshot.success
    ? `与你继续推进「${interaction.label}」`
    : `重新评估与你的合作边界`;
  next = addKnowledge(next, ["关系复利", "合同", "信用"]);
  next = addMemory(next, [
    snapshot.success ? "建立可信互动" : "关系谈判受挫",
    `同桌:${target.id}`,
  ]);
  const outcome = snapshot.success
    ? `${player.name}接受了你的提议。信任变化 ${trustDelta >= 0 ? "+" : ""}${trustDelta}，这段互动会影响未来介绍、借款与联合项目。`
    : `${player.name}拒绝了这次提议，并明确了底线：“${player.boundary}”`;
  next = finalizeActionCard(
    next,
    snapshot,
    "人物互动 · 已回应",
    `${player.name}回应了你的提议`,
    `${player.personality}。角色不是固定增益按钮，会依据目标、信任、资源与边界作出独立判断。`,
    ["关系", player.archetype, interaction.label],
    outcome,
  );
  next = addHistory(next, {
    type: "action",
    title: `${interaction.label} · ${player.name}`,
    description: outcome,
    cashDelta: -interaction.cashCost,
    tags: ["关系", "AI角色", interaction.id],
  });
  return { state: next, success: true, message: outcome };
}

function resolveDeepPlan(state: GameState, item: PlannedAction): ActionResult {
  const action = DEEP_ACTIONS.find((candidate) => candidate.id === item.targetId);
  if (!state.deep || !action) {
    return { state, success: false, message: "长期人生行动缺少可执行状态。" };
  }
  if (action.requires && !action.requires(state)) {
    return { state, success: false, message: action.requiresLabel ?? "执行时条件已经变化。" };
  }
  let next = copyState(state);
  const deep = next.deep!;
  next.cash -= action.cashCost;
  next.actionPoints = Math.max(0, next.actionPoints - action.points);
  let outcome = "";
  switch (action.id) {
    case "tax_review": {
      deep.tax.deductions += 12_000;
      deep.tax.withholdingRate = clamp(deep.tax.withholdingRate - 0.004, 0.04, 0.22);
      outcome = "你完成了凭证与预缴核对。可扣除额度增加，年末汇算的不确定性下降。";
      break;
    }
    case "protect_family": {
      deep.insurance.healthCoverage += 180_000;
      deep.insurance.lifeCoverage += Math.max(150_000, next.monthlyIncome * 24);
      deep.insurance.disabilityCoverage += 100_000;
      deep.insurance.annualPremium += 1_800;
      outcome = "医疗、寿险与失能覆盖同步提高；保障不会创造收益，但能阻断灾难性现金流。";
      break;
    }
    case "raise_pension": {
      deep.pension.contributionRate = clamp(deep.pension.contributionRate + 0.02, 0.05, 0.18);
      deep.pension.employerMatch = clamp(deep.pension.employerMatch + 0.005, 0.03, 0.06);
      outcome = `养老金缴费比例提高到 ${Math.round(deep.pension.contributionRate * 100)}%，长期复利会在每个季度结算。`;
      break;
    }
    case "buy_home": {
      const propertyValue = 400_000 * (0.8 + next.world.housingHeat * 0.4);
      deep.housing.tenure = "owner";
      deep.housing.propertyValue = Math.round(propertyValue);
      deep.housing.mortgageBalance = Math.max(0, Math.round(propertyValue - action.cashCost));
      deep.housing.mortgageRate = next.world.interestRate + 0.012;
      deep.housing.termQuarters = 120;
      next.fixedExpense = Math.max(1_200, next.fixedExpense - 900);
      outcome = `你支付首付并持有价值 ${formatMoney(propertyValue)} 的居所，房贷将在未来 120 个季度持续摊还。`;
      break;
    }
    case "refinance_home": {
      const before = deep.housing.mortgageRate;
      deep.housing.mortgageRate = Math.min(before, next.world.interestRate + 0.008);
      outcome = `房贷利率从 ${(before * 100).toFixed(1)}% 调整为 ${(deep.housing.mortgageRate * 100).toFixed(1)}%，节省会在余下期限逐季体现。`;
      break;
    }
    case "build_family": {
      if (!deep.family.partnered) {
        deep.family.partnered = true;
        deep.family.sharedCash += 18_000;
        deep.family.familyTrust = clamp(deep.family.familyTrust + 12, 0, 100);
        next.relationship = clamp(next.relationship + 8, 0, 100);
        outcome = "你们建立了共同账户、支出边界与长期目标；共同现金开始参与家庭选择。";
      } else if (deep.family.children.length < 3) {
        deep.family.children.push({
          id: `child-${next.turn}-${deep.family.children.length + 1}`,
          age: 0,
          educationFund: 0,
        });
        deep.legacy.heirs = deep.family.children.length;
        next.fixedExpense += 900;
        outcome = "家庭迎来新的成员。照护支出、教育金与时间压力会长期进入季度结算。";
      } else {
        deep.family.familyTrust = clamp(deep.family.familyTrust + 8, 0, 100);
        deep.family.sharedCash += 6_000;
        outcome = "家庭重新校准了共同目标，信任与共同现金缓冲得到加强。";
      }
      break;
    }
    case "care_parents": {
      deep.family.parentCareLevel = clamp(deep.family.parentCareLevel + 1, 0, 5);
      deep.family.familyTrust = clamp(deep.family.familyTrust + 6, 0, 100);
      next.stress = clamp(next.stress - 3, 0, 100);
      outcome = "医疗资料、紧急联系人和照护预算被写成可执行方案，长期家庭风险下降。";
      break;
    }
    case "start_business": {
      deep.business.active = true;
      deep.business.name = `${next.world.city}生活实验室`;
      deep.business.cash = action.cashCost;
      deep.business.employees = 1;
      deep.business.inventory = 8_000;
      deep.business.monthlyRevenue = 12_000;
      deep.business.monthlyCost = 9_000;
      deep.business.governance = 35;
      outcome = `${deep.business.name}开始运营。企业现金、库存、员工、收入、成本和治理将与个人账户分开结算。`;
      break;
    }
    case "hire_team": {
      deep.business.cash += action.cashCost;
      deep.business.employees += 1;
      deep.business.monthlyRevenue += 7_500;
      deep.business.monthlyCost += 5_200;
      deep.business.governance = clamp(deep.business.governance + 8, 0, 100);
      outcome = `团队增至 ${deep.business.employees} 人，收入能力和固定成本同时上升。`;
      break;
    }
    case "operate_business": {
      deep.business.cash += action.cashCost;
      deep.business.inventory += 6_000;
      deep.business.monthlyRevenue = Math.round(deep.business.monthlyRevenue * 1.08 + 2_000);
      deep.business.governance = clamp(deep.business.governance + 4, 0, 100);
      outcome = "库存、客户与交付流程完成一次经营迭代，下一季度的收入上限提高。";
      break;
    }
    case "estate_plan": {
      deep.legacy.willReady = true;
      deep.legacy.estatePlan = clamp(deep.legacy.estatePlan + 25, 0, 100);
      deep.legacy.generationScore = clamp(deep.legacy.generationScore + 8, 0, 100);
      outcome = "遗嘱、受益人、企业股权与紧急授权形成书面方案，代际传承不再依赖口头承诺。";
      break;
    }
  }
  next = addKnowledge(next, ["现金流", "复利", "风险承受力"]);
  next = addMemory(next, [`长期系统:${action.id}`, action.name]);
  next = finalizeActionCard(
    next,
    null,
    `深度人生 · ${action.category}`,
    action.name,
    action.description,
    ["深度人生", action.category, getPeriodLabel(next)],
    outcome,
  );
  next = addHistory(next, {
    type: "action",
    title: action.name,
    description: outcome,
    cashDelta: -action.cashCost,
    tags: ["深度人生", action.category],
  });
  return { state: next, success: true, message: outcome };
}

function statChanges(before: GameState, after: GameState): YearReveal["statChanges"] {
  return [
    ["现金", after.cash - before.cash],
    ["月收入", after.monthlyIncome - before.monthlyIncome],
    ["健康", after.health - before.health],
    ["精力", after.energy - before.energy],
    ["幸福", after.happiness - before.happiness],
    ["关系", after.relationship - before.relationship],
  ]
    .filter(([, value]) => Math.abs(value as number) >= 0.01)
    .map(([label, value]) => ({ label: label as string, value: value as number }));
}

function createReveal(
  before: GameState,
  after: GameState,
  item: PlannedAction,
  index: number,
  actionAccepted: boolean,
): YearReveal {
  const audit = after.audits.length > before.audits.length ? after.audits.at(-1) : undefined;
  const history = after.history.at(-1);
  return {
    id: `reveal-${after.turn}-${index + 1}`,
    eyebrow: after.lastCard.eyebrow,
    title: after.lastCard.title || item.label,
    narrative: after.lastCard.narrative,
    outcome: actionAccepted
      ? after.lastCard.outcome ?? history?.description ?? "这项安排已经完成。"
      : `计划执行时发现资源条件不再满足，「${item.label}」被迫取消。`,
    success: actionAccepted && (audit?.success ?? true),
    cashDelta: after.cash - before.cash,
    statChanges: statChanges(before, after),
    auditId: audit?.id,
    probability: audit?.finalProbability,
    tags: [...after.lastCard.tags],
  };
}

function updateQuestProgress(state: GameState): GameState {
  const next = copyState(state);
  const maxTrust = Math.max(0, ...next.aiPlayers.map((player) => player.trust));
  const learningCount =
    (next.memory["持续学习"] ?? 0) +
    (next.memory["开放想法:learning"] ?? 0);
  next.quests = next.quests.map((quest) => {
    const progress =
      quest.id === "reserve"
        ? getEmergencyMonths(next)
        : quest.id === "learning"
          ? learningCount
          : maxTrust;
    const complete = progress >= quest.target;
    if (complete && quest.status !== "complete" && !next.unlockedRoutes.includes(quest.rewardRoute)) {
      next.unlockedRoutes.push(quest.rewardRoute);
    }
    return { ...quest, progress, status: complete ? "complete" : quest.status };
  });
  return next;
}

function attachDelayedConsequences(
  state: GameState,
  plan: PlannedAction[],
  reveals: YearReveal[],
): GameState {
  const next = copyState(state);
  plan.forEach((item, index) => {
    const reveal = reveals[index];
    if (!reveal) return;
    if (item.kind === "career" || item.kind === "opportunity" || item.kind === "social") {
      const delayed: DelayedConsequence = {
        id: `delay-${next.turn}-${item.id}`,
        dueTurn: next.turn + (item.kind === "career" ? 1 : 2),
        title:
          item.kind === "career"
            ? "新路线的适应成本"
            : item.kind === "social"
              ? "合作承诺的回声"
              : "试验样本的二次结果",
        description: reveal.success
          ? `「${item.label}」的早期结果将继续接受交付、关系和环境检验。`
          : `「${item.label}」留下的成本和经验将在未来重新出现。`,
        effects: reveal.success
          ? item.kind === "social"
            ? { relationship: 3, credit: 1 }
            : { happiness: 2, credit: 1 }
          : { stress: 3, cash: -Math.min(4_000, Math.round(item.cashCost * 0.15)) },
        status: "pending",
        sourceTag: item.category,
      };
      next.delayedConsequences.push(delayed);
    }
  });
  return next;
}

function createConsequenceScene(state: GameState): ConsequenceScene {
  const strongest = [...state.reveals].sort(
    (a, b) =>
      Math.abs(b.cashDelta) +
      b.statChanges.reduce((sum, item) => sum + Math.abs(item.value) * 200, 0) -
      (Math.abs(a.cashDelta) +
        a.statChanges.reduce((sum, item) => sum + Math.abs(item.value) * 200, 0)),
  )[0];
  const player = [...state.aiPlayers].sort((a, b) => b.trust - a.trust)[0];
  const newlyUnlocked = state.quests
    .filter((quest) => quest.status === "complete" && state.unlockedRoutes.includes(quest.rewardRoute))
    .map((quest) => quest.rewardRoute);
  const delayed = state.delayedConsequences
    .filter((item) => item.status === "pending" && item.dueTurn > state.turn)
    .slice(-2)
    .map((item) => `${getPeriodLabel({ turn: item.dueTurn, timeScale: state.timeScale })}：${item.title}`);
  return {
    speaker: player?.name ?? "城市观察员",
    role: player?.archetype ?? "旁观者",
    title: strongest?.success ? "这一年留下了可以继续使用的东西" : "这一年没有白过，但代价必须被记住",
    narrative: strongest
      ? `「${strongest.title}」成为今年最明显的转折。${strongest.outcome}`
      : "你守住了基础承诺，没有额外下注。选择权被保留，但成长速度也因此放缓。",
    reaction: player
      ? `“我记住了你今年的做法。${player.trust >= 65 ? "下次有合适的机会，我愿意先来问你。" : "我们还需要更多真实合作，才能谈更大的承诺。"}”`
      : "城市没有给出标准答案，但你的资源边界已经发生变化。",
    unlocked: [...new Set(newlyUnlocked)].slice(-3),
    delayed,
  };
}

function executePlannedAction(state: GameState, item: PlannedAction): ActionResult {
  if (item.kind === "core") return resolveCorePlan(state);
  if (item.kind === "skill") return learnSkill(state, item.targetId);
  if (item.kind === "career") return switchCareer(state, item.targetId);
  if (item.kind === "asset") return buyAsset(state, item.targetId);
  if (item.kind === "life") return takeLifeAction(state, item.targetId);
  if (item.kind === "opportunity" && item.payload) return resolveOpportunity(state, item.payload);
  if (item.kind === "social") return resolveSocialPlan(state, item);
  if (item.kind === "deep") return resolveDeepPlan(state, item);
  return { state, success: false, message: "这项计划缺少可执行的规则映射。" };
}

export function commitYearPlan(state: GameState): ActionResult {
  if (state.yearPhase !== "planning") {
    return { state, success: false, message: "只有计划阶段可以确认年度安排。" };
  }
  if (!state.plan.some((item) => item.kind !== "core")) {
    return { state, success: false, message: "至少安排一项主业之外的行动，或者主动选择休整。" };
  }
  const plan = state.plan.map((item) => ({
    ...item,
    payload: item.payload ? { ...item.payload } : undefined,
  }));
  let working = copyState(state);
  working.plan = [];
  working.actionPoints = working.actionBudget;
  const reveals: YearReveal[] = [];
  plan.forEach((item, index) => {
    const before = copyState(working);
    const result = executePlannedAction(working, item);
    working = result.state;
    reveals.push(createReveal(before, working, item, index, result.success));
  });
  working = updateQuestProgress(working);
  working = attachDelayedConsequences(working, plan, reveals);
  working.reveals = reveals;
  working.revealIndex = 0;
  working.yearPhase = "reveal";
  working.consequenceScene = null;
  if (reveals[0]) {
    working.lastCard = {
      eyebrow: reveals[0].eyebrow,
      title: reveals[0].title,
      narrative: reveals[0].narrative,
      outcome: reveals[0].outcome,
      tags: [...reveals[0].tags],
    };
  }
  working.savedAt = Date.now();
  return {
    state: working,
    success: true,
    message: `${getPeriodLabel(working)}计划已锁定，正在依次揭晓 ${reveals.length} 项结果。`,
  };
}

function enterConsequencePhase(state: GameState): GameState {
  const next = copyState(state);
  next.yearPhase = "consequence";
  next.consequenceScene = createConsequenceScene(next);
  next.lastCard = {
    eyebrow: `${getStateChapterName(next)} · ${next.timeScale === "quarter" ? "季度" : "年度"}后果`,
    title: next.consequenceScene.title,
    narrative: next.consequenceScene.narrative,
    outcome: next.consequenceScene.reaction,
    tags: ["人物回应", "延迟后果", ...next.consequenceScene.unlocked],
  };
  return next;
}

export function revealNextResult(state: GameState): ActionResult {
  if (state.yearPhase !== "reveal") {
    return { state, success: false, message: "当前没有等待揭晓的结果。" };
  }
  if (state.revealIndex >= state.reveals.length - 1) {
    return { state: enterConsequencePhase(state), success: true, message: "所有结果已揭晓，进入年度后果场景。" };
  }
  const next = copyState(state);
  next.revealIndex += 1;
  const reveal = next.reveals[next.revealIndex];
  next.lastCard = {
    eyebrow: reveal.eyebrow,
    title: reveal.title,
    narrative: reveal.narrative,
    outcome: reveal.outcome,
    tags: [...reveal.tags],
  };
  return { state: next, success: true, message: `正在揭晓 ${next.revealIndex + 1}/${next.reveals.length}` };
}

export function skipYearReveals(state: GameState): ActionResult {
  if (state.yearPhase !== "reveal") {
    return { state, success: false, message: "当前没有可跳过的揭晓过程。" };
  }
  return { state: enterConsequencePhase(state), success: true, message: "已快速汇总全部结果。" };
}

export function continueAfterChapter(state: GameState): ActionResult {
  if (state.yearPhase !== "chapter") {
    return { state, success: false, message: "当前没有等待确认的章节总结。" };
  }
  const next = copyState(state);
  next.yearPhase = "opening";
  next.chapterSummary = null;
  next.annualBriefing = createAnnualBriefing(next);
  next.lastCard = {
    eyebrow: `${getStateChapterName(next)} · ${next.timeScale === "quarter" ? "季度" : "年度"}开场`,
    title: next.annualBriefing.headline,
    narrative: next.annualBriefing.cityNews,
    outcome: next.annualBriefing.riskNote,
    tags: [next.annualBriefing.chapter, next.world.cycle, "城市新闻"],
  };
  return { state: next, success: true, message: `进入${getPeriodLabel(next)}。` };
}

function createCareerShockChainEvent(turn: number): EventDefinition | null {
  if (turn === 3) {
    return {
      id: "chain_layoff_1",
      type: "行业",
      title: "走廊里的收缩信号",
      narrative: "预算审批变慢、外包暂停、几位资深同事开始更新履历。名单还没有出现，但你拥有一整年准备窗口。",
      weight: 99,
      choices: [
        {
          id: "prepare_skill",
          label: "提前补技能并整理成果",
          description: "花钱和时间建立外部可验证的能力证据。",
          cost: 4_000,
          timeCost: 2,
          risk: "低",
          effects: { cash: -4_000, energy: -4 },
          successEffects: { credit: 2 },
          baseProbability: 0.82,
          knowledgeTags: ["职业韧性", "人力资本"],
          memoryTags: ["裁员链:技能准备", "公司收缩信号"],
        },
        {
          id: "prepare_reserve",
          label: "先把应急金补厚",
          description: "不猜名单，把选择权放在流动性上。",
          risk: "低",
          effects: { happiness: -1, stress: -2 },
          successEffects: { cash: 6_000 },
          baseProbability: 0.9,
          knowledgeTags: ["应急金", "机会成本"],
          memoryTags: ["裁员链:现金准备", "公司收缩信号"],
        },
      ],
    };
  }
  if (turn === 4) {
    return {
      id: "chain_layoff_2",
      type: "职业",
      title: "裁员名单出现",
      narrative: "你的团队被要求缩减岗位。过去一年的技能、现金和关系准备，不再是抽象数值。",
      weight: 99,
      choices: [
        {
          id: "internal_transfer",
          label: "争取内部转岗",
          description: "用成果、技能证据和内部信用争取留下。",
          cost: 2_000,
          timeCost: 2,
          risk: "中",
          effects: { cash: -2_000, stress: 4 },
          successEffects: { monthlyIncome: 500, credit: 3 },
          failureEffects: { monthlyIncome: -1_200, happiness: -3 },
          baseProbability: 0.42,
          knowledgeTags: ["职业韧性", "信用"],
          memoryTags: ["裁员链:内部转岗"],
        },
        {
          id: "take_package",
          label: "接受补偿，主动寻找外部机会",
          description: "获得缓冲，但空窗期会检验应急金与关系网络。",
          risk: "中",
          effects: { cash: 22_000, stress: 5 },
          successEffects: { happiness: 2 },
          failureEffects: { monthlyIncome: -1_500 },
          baseProbability: 0.55,
          knowledgeTags: ["应急金", "职业转型"],
          memoryTags: ["裁员链:接受补偿"],
        },
        {
          id: "joint_venture",
          label: "与可信关系联合试业",
          description: "把过往合作信用转换成小规模联合项目。",
          cost: 8_000,
          timeCost: 3,
          risk: "高",
          effects: { cash: -8_000, stress: 6 },
          successEffects: { monthlyIncome: 900, relationship: 4 },
          failureEffects: { relationship: -3 },
          baseProbability: 0.36,
          knowledgeTags: ["低成本试错", "合伙治理"],
          memoryTags: ["裁员链:联合试业"],
        },
      ],
    };
  }
  if (turn === 5) {
    return {
      id: "chain_layoff_3",
      type: "机会",
      title: "两年前准备的答案",
      narrative: "行业仍未完全恢复。招聘方、合作伙伴和家庭开始用你过去两年的真实准备来决定是否支持下一步。",
      weight: 99,
      choices: [
        {
          id: "use_preparation",
          label: "拿出过去两年的准备",
          description: "让技能证据、现金缓冲与关系信用共同参与裁决。",
          risk: "中",
          effects: { stress: -2 },
          successEffects: { monthlyIncome: 1_600, credit: 4, happiness: 4 },
          failureEffects: { cash: -4_000, happiness: -2 },
          baseProbability: 0.38,
          knowledgeTags: ["职业韧性", "复利", "关系复利"],
          memoryTags: ["裁员链:准备兑现"],
        },
        {
          id: "reset_path",
          label: "缩小目标，重新建立样本",
          description: "接受短期降级，用更低风险的路径重建现金流。",
          risk: "低",
          effects: { monthlyIncome: -500, stress: -4 },
          successEffects: { credit: 2, happiness: 2 },
          baseProbability: 0.78,
          knowledgeTags: ["低成本试错", "现金流"],
          memoryTags: ["裁员链:重新起步"],
        },
      ],
    };
  }
  return null;
}

function eventEligible(state: GameState, event: (typeof EVENTS)[number]): boolean {
  const lifeYear = getLifeYear(state);
  if ((event.minTurn ?? 1) > lifeYear) return false;
  if (event.maxTurn && event.maxTurn < lifeYear) return false;
  if (event.requiredTags?.some((tag) => !state.memory[tag])) return false;
  if (event.blockedTags?.some((tag) => state.memory[tag])) return false;
  return true;
}

function chooseEvent(state: GameState): [GameState["pendingEvent"], GameState] {
  const lifeYear = getLifeYear(state);
  const chainWindow = state.timeScale === "year" || getQuarter(state) === 1;
  const chainEvent =
    chainWindow &&
    lifeYear >= 3 &&
    lifeYear <= 5 &&
    (lifeYear === 3 || (state.chainProgress.careerShock ?? 0) === lifeYear - 3)
      ? createCareerShockChainEvent(lifeYear)
      : null;
  if (chainEvent) return [{ event: chainEvent, source: "chain" }, state];
  const candidates = EVENTS.filter((event) => eventEligible(state, event));
  const totalWeight = candidates.reduce((sum, event) => sum + event.weight, 0);
  const [roll, rolled] = nextRoll(state);
  let cursor = roll * totalWeight;
  for (const event of candidates) {
    cursor -= event.weight;
    if (cursor <= 0) return [{ event, source: "turn" }, rolled];
  }
  return [{ event: candidates[candidates.length - 1] ?? EVENTS[0], source: "turn" }, rolled];
}

function updateWorld(state: GameState): GameState {
  const next = copyState(state);
  const cycleBoundary =
    next.timeScale === "quarter" ? next.turn % 4 === 0 : (next.turn + 1) % 4 === 0;
  if (cycleBoundary) {
    const cycles = ["繁荣", "平稳", "放缓", "衰退"] as const;
    const roll = seededRandom(next.world.seed, 1_000 + next.turn);
    next.world.cycle = cycles[Math.floor(roll * cycles.length)];
    next.world.interestRate = clamp(next.world.interestRate + (roll - 0.5) * 0.018, 0.012, 0.085);
    next.world.inflation = clamp(next.world.inflation + (0.5 - roll) * 0.014, 0.005, 0.09);
    next.world.housingHeat = clamp(next.world.housingHeat + (roll - 0.5) * 0.25, 0.1, 0.95);
    for (const key of Object.keys(next.world.industryTrend)) {
      const shift = seededRandom(next.world.seed, 1_100 + next.turn + key.length) - 0.5;
      next.world.industryTrend[key] = clamp(next.world.industryTrend[key] + shift * 0.28, 0.55, 1.45);
    }
  }
  return next;
}

function settleAssets(state: GameState): [GameState, number] {
  const next = copyState(state);
  let totalChange = 0;
  const periodsPerYear = next.timeScale === "quarter" ? 4 : 1;
  const cycleReturn = { 繁荣: 0.035, 平稳: 0.01, 放缓: -0.025, 衰退: -0.07 }[next.world.cycle];
  next.assets = next.assets.map((held, index) => {
    const definition = ASSETS.find((asset) => asset.id === held.id);
    if (!definition) return held;
    const roll = seededRandom(next.world.seed, next.turn * 37 + index + next.rngStep);
    const shock = ((roll - 0.5) * 2 * definition.volatility) / Math.sqrt(periodsPerYear);
    const categoryModifier =
      definition.category === "房产"
        ? (next.world.housingHeat - 0.5) * 0.08
        : definition.category === "现金"
          ? next.world.interestRate * 0.3
          : 0;
    const annualReturn = definition.expectedAnnualReturn + cycleReturn + categoryModifier;
    const periodReturn = annualReturn / periodsPerYear + shock;
    const oldValue = held.value;
    const value = Math.max(oldValue * 0.18, oldValue * (1 + periodReturn));
    totalChange += value - oldValue;
    return { ...held, value };
  });
  next.rngStep += next.assets.length;
  const passiveCash = next.assets.reduce(
    (sum, held) => sum + (held.value * held.cashYield) / periodsPerYear,
    0,
  );
  next.cash += passiveCash;
  next.passiveIncome = passiveCash / (next.timeScale === "quarter" ? 3 : 12);
  totalChange += passiveCash;
  return [next, totalChange];
}

function calculateAnnualIncomeTax(taxableIncome: number): number {
  const income = Math.max(0, taxableIncome);
  const brackets = [
    [36_000, 0.03],
    [108_000, 0.1],
    [204_000, 0.2],
    [360_000, 0.25],
    [600_000, 0.3],
    [960_000, 0.35],
    [Number.POSITIVE_INFINITY, 0.45],
  ] as const;
  let remaining = income;
  let previous = 0;
  let tax = 0;
  for (const [ceiling, rate] of brackets) {
    const width = Math.min(remaining, ceiling - previous);
    if (width <= 0) break;
    tax += width * rate;
    remaining -= width;
    previous = ceiling;
  }
  return tax;
}

function settleDeepSystems(
  state: GameState,
  activeIncome: number,
): [GameState, {
  tax: number;
  pension: number;
  insurance: number;
  housing: number;
  family: number;
  business: number;
  reconciliation: number;
}] {
  const next = copyState(state);
  if (!next.deep) {
    return [next, { tax: 0, pension: 0, insurance: 0, housing: 0, family: 0, business: 0, reconciliation: 0 }];
  }
  const deep = next.deep;
  const quarter = getQuarter(next) ?? 1;
  const tax = activeIncome * deep.tax.withholdingRate;
  deep.tax.yearTaxPaid += tax;
  const pensionEmployee = activeIncome * deep.pension.contributionRate;
  const pensionMatch = activeIncome * deep.pension.employerMatch;
  const pensionGrowth = deep.pension.balance * (0.045 / 4);
  deep.pension.balance += pensionEmployee + pensionMatch + pensionGrowth;
  const insurance = deep.insurance.annualPremium / 4;

  let housing = 0;
  if (deep.housing.tenure === "owner" && deep.housing.mortgageBalance > 0) {
    const quarterlyRate = deep.housing.mortgageRate / 4;
    const periods = Math.max(1, deep.housing.termQuarters);
    const payment =
      quarterlyRate > 0
        ? (deep.housing.mortgageBalance * quarterlyRate) /
          (1 - Math.pow(1 + quarterlyRate, -periods))
        : deep.housing.mortgageBalance / periods;
    const interest = deep.housing.mortgageBalance * quarterlyRate;
    const principal = Math.min(deep.housing.mortgageBalance, Math.max(0, payment - interest));
    deep.housing.mortgageBalance -= principal;
    deep.housing.termQuarters = Math.max(0, deep.housing.termQuarters - 1);
    housing = payment;
    const housingAnnualReturn = (deep.housing.tenure === "owner"
      ? (next.world.housingHeat - 0.45) * 0.06
      : 0);
    deep.housing.propertyValue *= 1 + housingAnnualReturn / 4;
  }

  const educationSaving = deep.family.children.length * 1_200;
  for (const child of deep.family.children) child.educationFund += 1_200;
  const parentCare = deep.family.parentCareLevel * 1_500;
  const family = educationSaving + parentCare;
  let business = 0;
  if (deep.business.active) {
    const cycleMultiplier = { 繁荣: 1.06, 平稳: 1, 放缓: 0.93, 衰退: 0.84 }[next.world.cycle];
    const governanceBuffer = 0.9 + deep.business.governance / 500;
    const quarterlyRevenue = deep.business.monthlyRevenue * 3 * cycleMultiplier * governanceBuffer;
    const quarterlyCost = deep.business.monthlyCost * 3;
    const inventoryPurchase = Math.min(
      Math.max(0, deep.business.cash),
      Math.max(0, quarterlyRevenue * 0.08 - deep.business.inventory),
    );
    deep.business.inventory += inventoryPurchase;
    business = quarterlyRevenue - quarterlyCost - inventoryPurchase;
    deep.business.cash += business;
    deep.business.inventory = Math.max(0, deep.business.inventory - quarterlyRevenue * 0.06);
    if (deep.business.cash < -30_000) {
      deep.business.active = false;
      deep.business.employees = 0;
      deep.business.monthlyRevenue = 0;
      deep.business.monthlyCost = 0;
      next.stress = clamp(next.stress + 12, 0, 100);
    } else if (deep.business.cash > 60_000) {
      const distribution = Math.min(deep.business.cash * 0.08, 12_000);
      deep.business.cash -= distribution;
      next.cash += distribution;
      next.passiveIncome += distribution / 3;
    }
  }

  let reconciliation = 0;
  if (quarter === 4) {
    const annualGross = next.monthlyIncome * 12;
    const annualTax = calculateAnnualIncomeTax(annualGross - deep.tax.deductions);
    reconciliation = deep.tax.yearTaxPaid - annualTax;
    deep.tax.lastAnnualReconciliation = reconciliation;
    deep.tax.yearTaxPaid = 0;
    deep.tax.deductions = Math.round(deep.tax.deductions * 0.15);
    next.age += 1;
    for (const child of deep.family.children) child.age += 1;
    deep.legacy.heirs = deep.family.children.length;
    deep.legacy.generationScore = clamp(
      deep.legacy.generationScore +
        (deep.legacy.willReady ? 1.5 : 0) +
        deep.family.children.reduce((sum, child) => sum + Math.min(2, child.educationFund / 100_000), 0),
      0,
      100,
    );
    if (
      next.age >= deep.pension.retirementAge &&
      next.monthlyIncome > 0 &&
      !next.memory["进入退休"]
    ) {
      next.monthlyIncome = Math.round(next.monthlyIncome * 0.35);
      const annualDraw = Math.min(deep.pension.balance * 0.04, deep.pension.balance);
      deep.pension.balance -= annualDraw;
      next.passiveIncome += annualDraw / 12;
      next.memory["进入退休"] = 1;
    }
  }

  next.cash += reconciliation - tax - pensionEmployee - insurance - housing - family;
  return [
    next,
    {
      tax,
      pension: pensionEmployee + pensionMatch + pensionGrowth,
      insurance,
      housing,
      family,
      business,
      reconciliation,
    },
  ];
}

function simulateAIMoves(state: GameState): GameState {
  const moves = [
    "补充了现金储备",
    "尝试了一条新职业路线",
    "研究一项长期资产",
    "拒绝了一次高收益诱惑",
    "与合作伙伴重谈分工",
    "投入时间学习新技能",
    "为家庭配置了保障",
    "缩减了一个低效项目",
  ];
  const next = copyState(state);
  next.aiPlayers = next.aiPlayers.map((player, index) => {
    const roll = seededRandom(next.world.seed, next.turn * 19 + index);
    const cashChange = Math.round((roll - 0.35) * 18_000 * (0.6 + player.risk));
    return {
      ...player,
      cash: Math.max(5_000, player.cash + cashChange),
      relationship: clamp(player.relationship + (roll > 0.65 ? 2 : -1), 0, 100),
      currentMove: moves[Math.floor(roll * moves.length)],
    };
  });
  return next;
}

export function advanceTurn(state: GameState): ActionResult {
  if (state.pendingEvent) return { state, success: false, message: "请先处理当前事件卡。" };
  if (state.phase === "review") return { state, success: false, message: "本局已经进入复盘。" };
  if (state.yearPhase !== "consequence") {
    return { state, success: false, message: "先完成年度计划、结果揭晓与后果场景。" };
  }

  let next = updateWorld(state);
  const completedPeriod = next.turn;
  const monthsInPeriod = next.timeScale === "quarter" ? 3 : 12;
  const periodsPerYear = next.timeScale === "quarter" ? 4 : 1;
  const activeCash = next.monthlyIncome * monthsInPeriod;
  const periodExpense = (next.fixedExpense + next.variableExpense) * monthsInPeriod;
  const debtInterest = next.debt * (next.world.interestRate + 0.025) / periodsPerYear;
  const activeNet = activeCash - periodExpense - debtInterest;
  next.cash += activeNet;
  let deepSettlement = {
    tax: 0,
    pension: 0,
    insurance: 0,
    housing: 0,
    family: 0,
    business: 0,
    reconciliation: 0,
  };
  if (next.deep) {
    [next, deepSettlement] = settleDeepSystems(next, activeCash);
  }
  next.debt = Math.max(0, next.debt + (next.cash < 0 ? Math.abs(next.cash) * 1.08 : 0));
  if (next.cash < 0) next.cash = 0;
  const [assetSettled, assetChange] = settleAssets(next);
  next = assetSettled;
  next.health = clamp(next.health + (next.stress > 70 ? -5 : 1) / periodsPerYear, 0, 100);
  next.energy = clamp(next.energy + (12 - next.stress * 0.08) / periodsPerYear, 0, 100);
  next.stress = clamp(next.stress + (-7 + (next.actionPoints <= 1 ? 4 : 0)) / periodsPerYear, 0, 100);
  next.happiness = clamp(next.happiness + (activeNet > 0 ? 1 : -3), 0, 100);
  next = simulateAIMoves(next);
  next = addHistory(next, {
    type: "settlement",
    title: `${getPeriodLabel(next)}结算`,
    description: next.deep
      ? `个人现金流 ${formatSignedMoney(activeNet)}，税费 ${formatMoney(deepSettlement.tax)}，养老金入账 ${formatMoney(deepSettlement.pension)}，保障/住房/家庭支出 ${formatMoney(deepSettlement.insurance + deepSettlement.housing + deepSettlement.family)}，企业经营 ${formatSignedMoney(deepSettlement.business)}，资产变化 ${formatSignedMoney(assetChange)}${deepSettlement.reconciliation ? `，年末汇算 ${formatSignedMoney(deepSettlement.reconciliation)}` : ""}。`
      : `主动现金流 ${formatSignedMoney(activeNet)}，资产与分配现金流 ${formatSignedMoney(assetChange)}，利息成本 ${formatMoney(debtInterest)}。`,
    cashDelta: activeNet + assetChange,
    tags: [next.timeScale === "quarter" ? "季度结算" : "年度结算", next.world.cycle],
  });

  if (next.turn >= next.maxTurns) {
    next.phase = "review";
    next.lastCard = {
      eyebrow: "人生实验 · 已完成",
      title: "你的选择已经形成一条独特轨迹",
      narrative: "系统正在从真实行动、概率快照、人生记忆与最终状态中生成复盘，不会只按财富数值判定胜负。",
      tags: ["局末复盘", "可解释结果"],
    };
    next.savedAt = Date.now();
    return { state: next, success: true, message: "本局完成，进入个性化复盘。" };
  }

  next.turn += 1;
  next.actionPoints = next.actionBudget;
  next.plan = [];
  next.reveals = [];
  next.revealIndex = 0;
  next.consequenceScene = null;
  next.variableExpense = Math.round(
    next.variableExpense * (1 + next.world.inflation / periodsPerYear),
  );
  const dueConsequences = next.delayedConsequences.filter(
    (item) => item.status === "pending" && item.dueTurn <= next.turn,
  );
  for (const consequence of dueConsequences) {
    next = applyEffects(next, consequence.effects);
    next = addHistory(next, {
      type: "system",
      title: `延迟后果：${consequence.title}`,
      description: consequence.description,
      cashDelta: consequence.effects.cash,
      tags: ["延迟后果", consequence.sourceTag],
    });
    const stored = next.delayedConsequences.find((item) => item.id === consequence.id);
    if (stored) stored.status = "resolved";
  }
  const [pendingEvent, rolled] = chooseEvent(next);
  next = rolled;
  next.pendingEvent = pendingEvent;
  next.annualBriefing = createAnnualBriefing(next);
  const chapterPeriod = next.timeScale === "quarter" ? 12 : 3;
  if (completedPeriod % chapterPeriod === 0) {
    const recent = next.history.filter(
      (entry) =>
        entry.turn >= Math.max(1, completedPeriod - chapterPeriod + 1) &&
        entry.turn <= completedPeriod,
    );
    const chapterIndex = Math.ceil(completedPeriod / chapterPeriod);
    const completedLifeYear =
      next.timeScale === "quarter" ? Math.ceil(completedPeriod / 4) : completedPeriod;
    const highlights = recent
      .filter((entry) => entry.type === "action" || entry.type === "event")
      .slice(-4)
      .map((entry) => `${entry.title}：${entry.description}`);
    const resilience = Math.round(
      clamp(
        getEmergencyMonths(next) * 8 +
          next.health * 0.2 +
          next.credit * 0.18 +
          Math.max(0, ...next.aiPlayers.map((player) => player.trust)) * 0.12,
        0,
        100,
      ),
    );
    const chapter: ChapterSummary = {
      index: chapterIndex,
      title: CHAPTER_NAMES[Math.min(CHAPTER_NAMES.length - 1, chapterIndex - 1)],
      years: `第 ${Math.max(1, completedLifeYear - 2)}–${completedLifeYear} 年`,
      headline:
        resilience >= 72
          ? "你开始拥有穿越变化的选择权"
          : resilience >= 48
            ? "几次取舍正在形成稳定的个人方法"
            : "增长发生了，但底盘仍会放大下一次冲击",
      highlights: highlights.length
        ? highlights
        : ["你守住了基础承诺，也保留了下一阶段重新选择的空间。"],
      unlockedRoutes: [...next.unlockedRoutes],
      resilience,
    };
    next.yearPhase = "chapter";
    next.chapterSummary = chapter;
    next.lastCard = {
      eyebrow: `章节 ${String(chapter.index).padStart(2, "0")} · ${chapter.years}`,
      title: chapter.headline,
      narrative: `这三年不只改变了净资产，也改变了你的能力证据、关系信用、健康资本与风险承受力。章节韧性评分 ${chapter.resilience}。`,
      outcome: chapter.highlights[0],
      tags: [chapter.title, "三年章节", ...chapter.unlockedRoutes.slice(-2)],
    };
  } else {
    next.yearPhase = "opening";
    next.chapterSummary = null;
    next.lastCard = {
      eyebrow: `${next.annualBriefing.chapter} · ${next.timeScale === "quarter" ? "季度" : "年度"}开场`,
      title: next.annualBriefing.headline,
      narrative: next.annualBriefing.cityNews,
      outcome: next.annualBriefing.riskNote,
      tags: [next.annualBriefing.chapter, next.world.cycle, "城市新闻"],
    };
  }
  next.savedAt = Date.now();
  return {
    state: next,
    success: true,
    message:
      next.yearPhase === "chapter"
        ? `完成${next.chapterSummary?.title ?? "三年章节"}，请查看章节总结。`
        : `新的${next.timeScale === "quarter" ? "季度" : "一年"}开始，请先阅读城市与人物消息。`,
  };
}

export function resolvePendingEvent(state: GameState, choiceId: string): ActionResult {
  const pending = state.pendingEvent;
  if (!pending) return { state, success: false, message: "当前没有等待处理的事件。" };
  const choice = pending.event.choices.find((item) => item.id === choiceId);
  if (!choice) return { state, success: false, message: "未找到这个事件选择。" };
  let base = choice.baseProbability ?? 1;
  if (pending.source === "chain") {
    const preparation =
      (state.memory["裁员链:技能准备"] ? 0.12 : 0) +
      (state.memory["裁员链:现金准备"] ? 0.1 : 0) +
      (getEmergencyMonths(state) >= 6 ? 0.08 : 0) +
      (Math.max(0, ...state.aiPlayers.map((player) => player.trust)) >= 68 ? 0.06 : 0);
    base = clamp(base + preparation, 0.08, 0.94);
  }
  const resourceAdequacy =
    choice.cost && choice.cost > 0 ? clamp(state.cash / choice.cost / 2, 0, 1) : state.energy / 100;
  const [snapshot, rolled] = probabilitySnapshot(
    state,
    `${pending.event.title}：${choice.label}`,
    base,
    [],
    resourceAdequacy,
  );
  let next = applyEffects(rolled, choice.effects);
  next = applyEffects(next, snapshot.success ? choice.successEffects ?? {} : choice.failureEffects ?? {});
  next.pendingEvent = null;
  if (pending.source === "chain") {
    next.chainProgress.careerShock = Math.max(
      next.chainProgress.careerShock ?? 0,
      Number(pending.event.id.at(-1) ?? 0),
    );
  }
  next = addKnowledge(next, choice.knowledgeTags);
  next = addMemory(next, [...choice.memoryTags, `事件:${pending.event.type}`]);
  const outcome = snapshot.success
    ? `${choice.label}的主要目标实现了。系统同时保留成本与后续影响。`
    : `${choice.label}没有按预期发展，失败来自准备、环境与随机扰动的共同作用。`;
  next = finalizeActionCard(
    next,
    snapshot,
    `${pending.event.type}事件 · 已处理`,
    pending.event.title,
    pending.event.narrative,
    [pending.event.type, choice.risk + "风险", ...choice.knowledgeTags],
    outcome,
  );
  next = addHistory(next, {
    type: "event",
    title: `${pending.event.title} · ${choice.label}`,
    description: outcome,
    cashDelta: choice.effects.cash,
    tags: [pending.event.type, ...choice.knowledgeTags],
  });
  return { state: next, success: true, message: outcome };
}

export function changeTheme(state: GameState, theme: GameState["theme"]): GameState {
  return { ...state, theme, savedAt: Date.now() };
}

export function getBoardStage(state: GameState) {
  const normalizedTurn =
    state.maxTurns === 12
      ? state.turn
      : Math.max(1, Math.ceil((state.turn / state.maxTurns) * 12));
  return BOARD_STAGES[clamp(normalizedTurn - 1, 0, BOARD_STAGES.length - 1)];
}

function createMacroEvent(state: GameState): MacroEventCard {
  const cards: Record<GameState["world"]["cycle"], Omit<MacroEventCard, "id">> = {
    繁荣: {
      type: "宏观",
      title: "高估值与招聘潮同时升温",
      narrative: "城市里的岗位、融资和消费都在扩张，真实收入增长了，但资产价格与固定成本也被推高。繁荣不是免费红利，而是一张要求你决定扩张边界的公共事件牌。",
      background: `通胀 ${(state.world.inflation * 100).toFixed(1)}% · 房产热度 ${Math.round(state.world.housingHeat * 100)} · ${state.world.platformTrend}`,
      affected: ["职业机会", "成长资产", "经营成本", "消费倾向"],
      choices: [
        {
          id: "prosperity-buffer",
          label: "把新增收入留在安全垫",
          description: "克制消费升级，优先建立可穿越下一轮周期的现金缓冲。",
          risk: "低",
          baseProbability: 0.94,
          effects: { happiness: -1 },
          successEffects: { cash: 4_000, stress: -2 },
          failureEffects: {},
          knowledgeTags: ["应急金", "生活方式膨胀"],
          memoryTags: ["繁荣期保留流动性"],
        },
        {
          id: "prosperity-skill",
          label: "趁窗口升级可迁移能力",
          description: "支付培训与试错成本，把繁荣期的机会转化为下一轮仍可使用的能力证据。",
          risk: "中",
          baseProbability: 0.72,
          effects: { cash: -3_500, energy: -3 },
          successEffects: { monthlyIncome: 420, credit: 2 },
          failureEffects: { stress: 2 },
          knowledgeTags: ["人力资本", "时代适配"],
          memoryTags: ["顺周期学习"],
        },
        {
          id: "prosperity-expand",
          label: "顺势放大经营与投资",
          description: "承担更高投入和管理压力，争取在窗口关闭前形成规模。",
          risk: "高",
          baseProbability: 0.54,
          effects: { cash: -9_000, stress: 5 },
          successEffects: { cash: 19_000, passiveIncome: 260 },
          failureEffects: { cash: -4_000, happiness: -3 },
          knowledgeTags: ["经营杠杆", "资产配置"],
          memoryTags: ["繁荣期扩张"],
        },
      ],
    },
    平稳: {
      type: "宏观",
      title: "城市进入没有明显红利的换挡期",
      narrative: "招聘、消费和资本市场都没有给出一致方向。这个阶段不会奖励追逐口号的人，真实交付、合同质量和现金流将拉开差距。",
      background: `利率 ${(state.world.interestRate * 100).toFixed(1)}% · ${state.world.platformTrend} · 行业分化`,
      affected: ["合同质量", "职业证据", "稳定现金流", "合作信用"],
      choices: [
        {
          id: "steady-audit",
          label: "复核现金流与低效承诺",
          description: "停止一个没有证据的支出或项目，把资源收回到可验证路径。",
          risk: "低",
          baseProbability: 0.96,
          effects: { happiness: -1 },
          successEffects: { cash: 2_500, stress: -3 },
          failureEffects: {},
          knowledgeTags: ["现金流", "机会成本"],
          memoryTags: ["换挡期复核"],
        },
        {
          id: "steady-deliver",
          label: "用一次真实交付争取复购",
          description: "不追热点，集中完成一个能被客户或雇主验证的成果。",
          risk: "中",
          baseProbability: 0.7,
          effects: { energy: -5, cash: -1_500 },
          successEffects: { cash: 7_000, monthlyIncome: 320, credit: 3 },
          failureEffects: { stress: 2 },
          knowledgeTags: ["人力资本", "复利"],
          memoryTags: ["真实交付"],
        },
        {
          id: "steady-alliance",
          label: "建立一份边界清楚的合作",
          description: "用书面分工、收益和退出条款，把关系资源变成可持续协作。",
          risk: "中",
          baseProbability: 0.64,
          effects: { cash: -2_000, energy: -2 },
          successEffects: { relationship: 6, credit: 2, monthlyIncome: 180 },
          failureEffects: { relationship: -2, stress: 3 },
          knowledgeTags: ["合同", "关系复利"],
          memoryTags: ["换挡期合作"],
        },
      ],
    },
    放缓: {
      type: "宏观",
      title: "订单收缩，行业开始明显分化",
      narrative: "同一座城市里，有人仍在增长，也有人开始延迟付款和冻结岗位。现金缓冲、客户集中度和可迁移能力正在改变每个人承受的冲击。",
      background: `增长放缓 · 利率 ${(state.world.interestRate * 100).toFixed(1)}% · 应收账款周期拉长`,
      affected: ["主业稳定", "客户回款", "现金缓冲", "转行机会"],
      choices: [
        {
          id: "slowdown-defend",
          label: "缩短回款并保住现金",
          description: "放弃一部分名义增长，优先收回应收款、压缩库存和可选支出。",
          risk: "低",
          baseProbability: 0.88,
          effects: { happiness: -2 },
          successEffects: { cash: 5_000, credit: 2 },
          failureEffects: { stress: 1 },
          knowledgeTags: ["现金流", "应急金"],
          memoryTags: ["放缓期防守"],
        },
        {
          id: "slowdown-transfer",
          label: "把能力迁移到逆势需求",
          description: "用时间研究降本、照护、维修或再训练需求，验证一条逆周期收入路线。",
          risk: "中",
          baseProbability: 0.62,
          effects: { cash: -2_500, energy: -4 },
          successEffects: { monthlyIncome: 460, happiness: 2 },
          failureEffects: { stress: 3 },
          knowledgeTags: ["时代适配", "收入多元"],
          memoryTags: ["逆周期迁移"],
        },
        {
          id: "slowdown-bet",
          label: "押注被错杀的高波动机会",
          description: "投入现金等待周期修复；判断正确会获得超额回报，错误则压缩后续选择权。",
          risk: "高",
          baseProbability: 0.42,
          effects: { cash: -8_000, stress: 3 },
          successEffects: { cash: 18_000 },
          failureEffects: { cash: -5_000, happiness: -3 },
          knowledgeTags: ["能力圈", "资产配置"],
          memoryTags: ["放缓期逆向押注"],
        },
      ],
    },
    衰退: {
      type: "宏观",
      title: "信贷收紧，风险开始跨市场传导",
      narrative: "岗位、订单和资产价格同时承压。坏消息对所有人公开，但负债期限、保障、关系信用和应急金让后果并不相同。",
      background: `衰退压力 · 融资成本 ${(state.world.interestRate * 100 + 2.5).toFixed(1)}% · 流动性优先`,
      affected: ["负债成本", "失业风险", "资产价格", "家庭责任"],
      choices: [
        {
          id: "recession-survive",
          label: "先保证六个月生存空间",
          description: "暂停扩张，重谈支出与债务期限，让未来仍保留选择。",
          risk: "低",
          baseProbability: 0.84,
          effects: { happiness: -2, credit: 1 },
          successEffects: { cash: 3_500, stress: -4 },
          failureEffects: { cash: -1_500 },
          knowledgeTags: ["应急金", "负债管理"],
          memoryTags: ["衰退期生存"],
        },
        {
          id: "recession-network",
          label: "用信用交换真实信息与订单",
          description: "向可信关系说明能力、底线和可交付成果，争取转岗、客户或联合项目。",
          risk: "中",
          baseProbability: 0.58,
          effects: { cash: -1_500, energy: -3 },
          successEffects: { monthlyIncome: 520, relationship: 5 },
          failureEffects: { relationship: -1, stress: 2 },
          knowledgeTags: ["关系复利", "收入多元"],
          memoryTags: ["衰退期求助"],
        },
        {
          id: "recession-acquire",
          label: "承担高风险，收购低价资产",
          description: "只有资金期限足够长时才可能奏效；短期继续下跌会直接伤害现金流。",
          risk: "极高",
          baseProbability: 0.34,
          effects: { cash: -10_000, stress: 5 },
          successEffects: { cash: 24_000, passiveIncome: 180 },
          failureEffects: { cash: -7_000, happiness: -4 },
          knowledgeTags: ["期限错配", "资产配置"],
          memoryTags: ["衰退期逆向收购"],
        },
      ],
    },
  };
  return {
    ...cards[state.world.cycle],
    id: `macro-${state.turn}-${state.world.cycle}`,
    affected: [...cards[state.world.cycle].affected],
    choices: cards[state.world.cycle].choices.map((choice) => ({
      ...choice,
      effects: { ...choice.effects },
      successEffects: { ...choice.successEffects },
      failureEffects: { ...choice.failureEffects },
      knowledgeTags: [...choice.knowledgeTags],
      memoryTags: [...choice.memoryTags],
    })),
  };
}

export function enterOrdinaryActionPhase(state: GameState): ActionResult {
  if (state.turnPhase !== "world") {
    return { state, success: false, message: "请先完成当前回合阶段。" };
  }
  let prepared = copyState(state);
  if (prepared.yearPhase === "chapter") {
    const continued = continueAfterChapter(prepared);
    if (!continued.success) return continued;
    prepared = continued.state;
  }
  if (!prepared.queuedPersonalEvent) {
    if (prepared.pendingEvent) {
      prepared.queuedPersonalEvent = prepared.pendingEvent;
    } else {
      const [event, rolled] = chooseEvent(prepared);
      prepared = rolled;
      prepared.queuedPersonalEvent = event;
    }
  }
  prepared.pendingEvent = null;
  const opened = beginYearPlanning(prepared);
  if (!opened.success) return opened;
  opened.state.turnPhase = "action";
  return {
    state: opened.state,
    success: true,
    message: "普通行动阶段已开始：职业、学习、收入、投资、家庭与健康都在争夺同一份时间。",
  };
}

export function finishOrdinaryActionPhase(state: GameState): ActionResult {
  if (state.turnPhase !== "action" || state.yearPhase !== "planning") {
    return { state, success: false, message: "当前不是普通行动阶段。" };
  }
  const next = copyState(state);
  next.turnPhase = "interaction";
  next.lastCard = {
    eyebrow: `${getPeriodLabel(next)} · 玩家互动`,
    title: "行动不会发生在真空里",
    narrative: "同桌角色有自己的目标、资源和底线。你可以求助、先提供帮助、提出联合项目或重谈边界，也可以保持独立。",
    tags: ["玩家互动", "关系记忆", "合同边界"],
  };
  return { state: next, success: true, message: "进入玩家互动阶段。" };
}

export function finishPlayerInteractionPhase(state: GameState): ActionResult {
  if (state.turnPhase !== "interaction" || state.yearPhase !== "planning") {
    return { state, success: false, message: "当前不是玩家互动阶段。" };
  }
  const committed = commitYearPlan(state);
  if (!committed.success) return committed;
  const summarized = skipYearReveals(committed.state);
  if (!summarized.success) return summarized;
  summarized.state.turnPhase = "macro";
  summarized.state.macroEvent = createMacroEvent(summarized.state);
  summarized.state.lastCard = {
    eyebrow: `${getPeriodLabel(summarized.state)} · 宏观公共事件`,
    title: summarized.state.macroEvent.title,
    narrative: summarized.state.macroEvent.narrative,
    tags: ["宏观", summarized.state.world.cycle, ...summarized.state.macroEvent.affected.slice(0, 2)],
  };
  return { state: summarized.state, success: true, message: "行动已由规则引擎裁决，宏观事件牌翻开。" };
}

export function resolveMacroEventPhase(state: GameState, choiceId: string): ActionResult {
  if (state.turnPhase !== "macro") {
    return { state, success: false, message: "当前没有等待回应的宏观事件。" };
  }
  const card = state.macroEvent ?? createMacroEvent(state);
  const choice = card.choices.find((item) => item.id === choiceId);
  if (!choice) return { state, success: false, message: "未找到这项宏观应对策略。" };
  const cashNeed = Math.max(1, Math.abs(choice.effects.cash ?? 0));
  const resourceAdequacy = clamp((state.cash / cashNeed + state.energy / 70) / 3, 0, 1);
  const [snapshot, rolled] = probabilitySnapshot(
    state,
    `${card.title}：${choice.label}`,
    choice.baseProbability,
    [],
    resourceAdequacy,
  );
  let next = applyEffects(rolled, choice.effects);
  next = applyEffects(next, snapshot.success ? choice.successEffects : choice.failureEffects);
  next = addKnowledge(next, choice.knowledgeTags);
  next = addMemory(next, [...choice.memoryTags, `宏观:${state.world.cycle}`]);
  const outcome = snapshot.success
    ? `你的应对在当前周期中奏效，但投入与机会成本仍然保留。`
    : `这次应对没有达到预期；资源准备、周期逆风和随机扰动共同形成了结果。`;
  next = finalizeActionCard(
    next,
    snapshot,
    "宏观事件 · 已回应",
    card.title,
    choice.description,
    ["宏观", choice.risk + "风险", ...choice.knowledgeTags],
    outcome,
  );
  next = addHistory(next, {
    type: "event",
    title: `${card.title} · ${choice.label}`,
    description: outcome,
    cashDelta: (choice.effects.cash ?? 0) + (snapshot.success ? choice.successEffects.cash ?? 0 : choice.failureEffects.cash ?? 0),
    tags: ["宏观", state.world.cycle, ...choice.knowledgeTags],
  });
  next.turnPhase = "personal";
  next.pendingEvent = next.queuedPersonalEvent;
  next.queuedPersonalEvent = null;
  return { state: next, success: true, message: "宏观事件已记录，进入个人与关系事件。" };
}

export function resolvePersonalEventPhase(state: GameState, choiceId: string): ActionResult {
  if (state.turnPhase !== "personal") {
    return { state, success: false, message: "当前不是个人与关系事件阶段。" };
  }
  const resolved = resolvePendingEvent(state, choiceId);
  if (!resolved.success) return resolved;
  resolved.state.turnPhase = "settlement";
  return { state: resolved.state, success: true, message: "个人事件已进入人生记忆，准备统一结算。" };
}

export function skipEmptyPersonalEventPhase(state: GameState): ActionResult {
  if (state.turnPhase !== "personal" || state.pendingEvent) {
    return { state, success: false, message: "仍有个人事件需要处理。" };
  }
  const next = copyState(state);
  next.turnPhase = "settlement";
  return { state: next, success: true, message: "本期没有额外个人事件，进入统一结算。" };
}

export function settleTurnPhase(state: GameState): ActionResult {
  if (state.turnPhase !== "settlement") {
    return { state, success: false, message: "当前还不能进行资产与状态结算。" };
  }
  const settled = advanceTurn(state);
  if (!settled.success || settled.state.phase === "review") return settled;
  settled.state.turnPhase = "learning";
  settled.state.macroEvent = null;
  settled.state.queuedPersonalEvent = null;
  return { state: settled.state, success: true, message: "资产与状态已结算，进入本期学习反馈。" };
}

export function continueAfterLearningPhase(state: GameState): ActionResult {
  if (state.turnPhase !== "learning") {
    return { state, success: false, message: "请先查看本期学习反馈。" };
  }
  let next = copyState(state);
  if (next.yearPhase === "chapter") {
    const continued = continueAfterChapter(next);
    if (!continued.success) return continued;
    next = continued.state;
  }
  next.turnPhase = "world";
  next.macroEvent = null;
  next.lastCard = {
    eyebrow: `${getStateChapterName(next)} · 世界与个人状态`,
    title: next.annualBriefing.headline,
    narrative: next.annualBriefing.cityNews,
    outcome: next.annualBriefing.riskNote,
    tags: [next.annualBriefing.chapter, next.world.cycle, "世界观察"],
  };
  return { state: next, success: true, message: `进入${getPeriodLabel(next)}，先观察世界与个人状态。` };
}

export function generateReview(state: GameState): ReviewReport {
  const netWorth = getNetWorth(state);
  const emergencyMonths = getEmergencyMonths(state);
  const totalDebt = state.debt + (state.deep?.housing.mortgageBalance ?? 0);
  const totalAssets =
    state.cash +
    state.assets.reduce((sum, item) => sum + item.value, 0) +
    (state.deep?.housing.propertyValue ?? 0) +
    (state.deep?.pension.balance ?? 0) +
    (state.deep?.business.cash ?? 0) +
    (state.deep?.business.inventory ?? 0);
  const debtRatio = totalDebt / Math.max(1, totalDebt + totalAssets);
  const incomeSources = new Set<string>();
  if (state.monthlyIncome > 0) incomeSources.add("active");
  for (const asset of state.assets) incomeSources.add(asset.category);
  if ((state.memory["副业尝试"] ?? 0) > 0) incomeSources.add("side");
  const incomeDiversity = clamp(incomeSources.size / 5, 0, 1);
  const resilienceScore = Math.round(
    clamp(
      emergencyMonths * 8 +
        (1 - debtRatio) * 25 +
        incomeDiversity * 18 +
        state.health * 0.16 +
        state.credit * 0.13,
      0,
      100,
    ),
  );
  const learningScore = Math.round(
    clamp(
      Object.values(state.skills).reduce((sum, level) => sum + level, 0) * 2.5 +
        state.revealedKnowledge.length * 2 +
        state.audits.length,
      0,
      100,
    ),
  );
  const riskActions =
    (state.memory["高风险暴露"] ?? 0) +
    state.history.filter((item) => item.tags.includes("高")).length;
  const exploration =
    (state.memory["持续学习"] ?? 0) +
    (state.memory["副业尝试"] ?? 0) +
    (state.memory["使用自由机会"] ?? 0) +
    state.careerHistory.length;
  const safety =
    (state.memory["保留流动性"] ?? 0) +
    (state.memory["拥有保障"] ?? 0) +
    (state.memory["主动降债"] ?? 0);
  const style =
    exploration >= safety + 2
      ? "探索型配置者"
      : safety >= exploration + 2
        ? "韧性型守护者"
        : riskActions >= 3
          ? "高波动机会猎手"
          : "平衡型实验者";
  const styleDescription =
    style === "探索型配置者"
      ? "你愿意用真实行动获取信息，优势是选择面扩张，风险是多线经营稀释精力。"
      : style === "韧性型守护者"
        ? "你重视可持续与最坏结果，优势是抗冲击，风险是可能把所有不确定性都当成危险。"
        : style === "高波动机会猎手"
          ? "你能抓住窗口，但需要用仓位、合同和流动性把偶然成功变成可持续结果。"
          : "你在成长、安全与生活之间保持动态平衡，关键是把原则继续写成可重复规则。";

  const insights: ReviewReport["insights"] = [
    {
      title: emergencyMonths >= 6 ? "现金缓冲提供了选择权" : "现金缓冲仍是最薄弱的一环",
      body:
        emergencyMonths >= 6
          ? `最终现金可覆盖约 ${emergencyMonths.toFixed(1)} 个月必要支出，面对突发事件时较少需要被迫卖出资产。`
          : `最终现金只覆盖约 ${emergencyMonths.toFixed(1)} 个月必要支出。你的赚钱能力不一定弱，但在坏时点会缺少等待与谈判的空间。`,
      tone: emergencyMonths >= 6 ? "positive" : "watch",
    },
    {
      title: incomeDiversity >= 0.45 ? "收入来源开始分散" : "主动收入仍决定大多数结果",
      body:
        incomeDiversity >= 0.45
          ? "你建立了多个收益来源。下一步不是盲目增加项目，而是评估它们的相关性、时间成本与可持续性。"
          : "你主要依赖主业现金流。先提高技能与安全垫，再用小额试错验证第二收入来源，会比仓促辞职更稳健。",
      tone: incomeDiversity >= 0.45 ? "positive" : "neutral",
    },
    {
      title: debtRatio <= 0.25 ? "负债没有主导人生选择" : "杠杆放大了现金流压力",
      body:
        debtRatio <= 0.25
          ? "你的负债处在可控范围。仍需区分能产生现金流的负债与纯消费负债，而不是简单地把所有负债归为好或坏。"
          : `负债占资产与负债合计约 ${(debtRatio * 100).toFixed(0)}%。当收入或资产价格波动时，利息和期限会压缩你的选择空间。`,
      tone: debtRatio <= 0.25 ? "positive" : "watch",
    },
    {
      title: state.health >= 65 ? "你保住了长期行动能力" : "过劳正在侵蚀其他资本",
      body:
        state.health >= 65
          ? "健康与精力没有被完全用于追逐短期收入，这让技能、关系和资产更有机会形成长期复利。"
          : "多线行动提高了短期产出，却降低了判断与恢复能力。健康不是消费，而是使用其他资本的底层条件。",
      tone: state.health >= 65 ? "positive" : "watch",
    },
  ];

  const turningPoints = [...state.history]
    .filter((item) => item.type !== "system")
    .sort((a, b) => Math.abs(b.cashDelta ?? 0) - Math.abs(a.cashDelta ?? 0))
    .slice(0, 5);
  const auditedSuccess = state.audits.filter((item) => item.success).length;
  const luck = state.audits.length
    ? clamp(
        state.audits.reduce(
          (sum, item) => sum + (item.success ? 1 - item.finalProbability : item.finalProbability),
          0,
        ) /
          state.audits.length,
        0.12,
        0.5,
      )
    : 0.25;
  const preparation = clamp(
    (Object.values(state.skills).reduce((sum, level) => sum + level, 0) / 25 +
      Math.min(emergencyMonths, 8) / 8) /
      2,
    0.15,
    0.6,
  );
  const decisions = clamp(1 - luck - preparation, 0.18, 0.58);
  const total = luck + preparation + decisions;

  return {
    netWorth,
    emergencyMonths,
    debtRatio,
    incomeDiversity,
    resilienceScore,
    learningScore,
    style,
    styleDescription,
    insights,
    turningPoints,
    knowledge: state.revealedKnowledge.filter((tag) => KNOWLEDGE_MODELS[tag]).slice(-10),
    luckVsPreparation: {
      luck: luck / total,
      preparation: preparation / total,
      decisions: decisions / total + auditedSuccess * 0,
    },
  };
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSignedMoney(value: number): string {
  return `${value >= 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`;
}
