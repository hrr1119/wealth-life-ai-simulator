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
  GameState,
  HistoryEntry,
  NewGameConfig,
  NumericEffects,
  OpportunityCard,
  ProbabilitySnapshot,
  ReviewReport,
  TalentState,
} from "./types.ts";

const TALENT_KEYS = ["表达", "分析", "技术", "销售", "管理", "创意", "手艺", "研究"];

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
    audits: [...state.audits],
    history: [...state.history],
    aiPlayers: state.aiPlayers.map((player) => ({ ...player })),
    careerHistory: [...state.careerHistory],
    pendingEvent: state.pendingEvent
      ? { ...state.pendingEvent, event: state.pendingEvent.event }
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

export function createGame(config: NewGameConfig): GameState {
  const seed = Math.abs(config.seed ?? Math.floor(Date.now() % 2_147_483_647));
  const mode = MODES.find((item) => item.id === config.mode) ?? MODES[0];
  const role = ROLES.find((item) => item.id === config.roleId) ?? ROLES[0];
  const skills: Record<string, number> = {};
  for (const skill of role.starterSkills) skills[skill] = 1;

  return {
    version: 1,
    phase: "playing",
    mode: mode.id,
    theme: config.theme,
    roleId: role.id,
    turn: 1,
    maxTurns: mode.turns,
    actionPoints: 8,
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
    pendingEvent: null,
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
        description: `${role.name}在${createWorld(seed).city}开始了新的财务人生。`,
        tags: ["开局"],
        timestamp: Date.now(),
      },
    ],
    aiPlayers: createAIPlayers(seed),
    rngStep: 200,
    savedAt: Date.now(),
  };
}

export function getNetWorth(state: GameState): number {
  return state.cash + state.assets.reduce((sum, asset) => sum + asset.value, 0) - state.debt;
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

function eventEligible(state: GameState, event: (typeof EVENTS)[number]): boolean {
  if ((event.minTurn ?? 1) > state.turn + 1) return false;
  if (event.maxTurn && event.maxTurn < state.turn + 1) return false;
  if (event.requiredTags?.some((tag) => !state.memory[tag])) return false;
  if (event.blockedTags?.some((tag) => state.memory[tag])) return false;
  return true;
}

function chooseEvent(state: GameState): [GameState["pendingEvent"], GameState] {
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
  if ((next.turn + 1) % 4 === 0) {
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
  const cycleReturn = { 繁荣: 0.035, 平稳: 0.01, 放缓: -0.025, 衰退: -0.07 }[next.world.cycle];
  next.assets = next.assets.map((held, index) => {
    const definition = ASSETS.find((asset) => asset.id === held.id);
    if (!definition) return held;
    const roll = seededRandom(next.world.seed, next.turn * 37 + index + next.rngStep);
    const shock = (roll - 0.5) * 2 * definition.volatility;
    const categoryModifier =
      definition.category === "房产"
        ? (next.world.housingHeat - 0.5) * 0.08
        : definition.category === "现金"
          ? next.world.interestRate * 0.3
          : 0;
    const annualReturn = definition.expectedAnnualReturn + cycleReturn + categoryModifier + shock;
    const oldValue = held.value;
    const value = Math.max(oldValue * 0.18, oldValue * (1 + annualReturn));
    totalChange += value - oldValue;
    return { ...held, value };
  });
  next.rngStep += next.assets.length;
  const passiveCash = next.assets.reduce(
    (sum, held) => sum + held.value * held.cashYield,
    0,
  );
  next.cash += passiveCash;
  next.passiveIncome = passiveCash / 12;
  totalChange += passiveCash;
  return [next, totalChange];
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

  let next = updateWorld(state);
  const annualActiveCash = next.monthlyIncome * 12;
  const annualExpense = (next.fixedExpense + next.variableExpense) * 12;
  const debtInterest = next.debt * (next.world.interestRate + 0.025);
  const activeNet = annualActiveCash - annualExpense - debtInterest;
  next.cash += activeNet;
  next.debt = Math.max(0, next.debt + (next.cash < 0 ? Math.abs(next.cash) * 1.08 : 0));
  if (next.cash < 0) next.cash = 0;
  const [assetSettled, assetChange] = settleAssets(next);
  next = assetSettled;
  next.health = clamp(next.health + (next.stress > 70 ? -5 : 1), 0, 100);
  next.energy = clamp(next.energy + 12 - next.stress * 0.08, 0, 100);
  next.stress = clamp(next.stress - 7 + (next.actionPoints <= 1 ? 4 : 0), 0, 100);
  next.happiness = clamp(next.happiness + (activeNet > 0 ? 1 : -3), 0, 100);
  next = simulateAIMoves(next);
  next = addHistory(next, {
    type: "settlement",
    title: `第 ${next.turn} 年结算`,
    description: `主动现金流 ${formatSignedMoney(activeNet)}，资产与分配现金流 ${formatSignedMoney(assetChange)}，利息成本 ${formatMoney(debtInterest)}。`,
    cashDelta: activeNet + assetChange,
    tags: ["年度结算", next.world.cycle],
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
  next.actionPoints = 8;
  next.variableExpense = Math.round(next.variableExpense * (1 + next.world.inflation));
  const [pendingEvent, rolled] = chooseEvent(next);
  next = rolled;
  next.pendingEvent = pendingEvent;
  next.lastCard = {
    eyebrow: `${pendingEvent?.event.type ?? "人生"}事件 · 等待选择`,
    title: pendingEvent?.event.title ?? "新的一年",
    narrative: pendingEvent?.event.narrative ?? "世界继续变化。",
    tags: [pendingEvent?.event.type ?? "事件", next.world.cycle],
  };
  next.savedAt = Date.now();
  return { state: next, success: true, message: "新的一年开始，请处理当前事件。" };
}

export function resolvePendingEvent(state: GameState, choiceId: string): ActionResult {
  const pending = state.pendingEvent;
  if (!pending) return { state, success: false, message: "当前没有等待处理的事件。" };
  const choice = pending.event.choices.find((item) => item.id === choiceId);
  if (!choice) return { state, success: false, message: "未找到这个事件选择。" };
  const base = choice.baseProbability ?? 1;
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

export function generateReview(state: GameState): ReviewReport {
  const netWorth = getNetWorth(state);
  const emergencyMonths = getEmergencyMonths(state);
  const debtRatio = state.debt / Math.max(1, state.debt + state.assets.reduce((sum, item) => sum + item.value, 0) + state.cash);
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
