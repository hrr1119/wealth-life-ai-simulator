import type {
  EventDefinition,
  GameState,
  HistoryEntry,
  LifeRouteCandidate,
  LifeRouteEdge,
  LifeRouteNode,
  LifeRouteState,
  PlannedAction,
  RouteLaneId,
  RouteNodeCategory,
  YearReveal,
} from "./types.ts";

type RouteSnapshot = Pick<
  GameState,
  | "turn"
  | "cash"
  | "fixedExpense"
  | "variableExpense"
  | "passiveIncome"
  | "monthlyIncome"
  | "health"
  | "energy"
  | "relationship"
  | "skills"
  | "assets"
  | "aiPlayers"
  | "deep"
>;

const LANE_ORIGINS: Record<RouteLaneId, string> = {
  career: "route-origin-career",
  capital: "route-origin-capital",
  life: "route-origin-life",
};

function originNode(
  lane: RouteLaneId,
  label: string,
  detail: string,
  evidence: string,
): LifeRouteNode {
  return {
    id: LANE_ORIGINS[lane],
    lane,
    category: "origin",
    status: "reached",
    label,
    detail,
    evidence,
    turn: 1,
  };
}

function laneForTags(tags: string[], fallback: RouteLaneId = "life"): RouteLaneId {
  const joined = tags.join("|");
  if (/职业|学习|技能|主业|人力资本|技术|内容|教育|职业包/.test(joined)) return "career";
  if (/投资|资产|现金流|负债|金融|房产|企业|收入|副业/.test(joined)) return "capital";
  if (/家庭|关系|健康|休息|生活|AI角色|社交/.test(joined)) return "life";
  return fallback;
}

function laneForAction(item: PlannedAction): RouteLaneId {
  if (item.kind === "skill" || item.kind === "career" || item.kind === "core") return "career";
  if (item.kind === "asset") return "capital";
  if (item.kind === "social") return "life";
  if (item.kind === "opportunity") {
    return item.payload?.category === "investment" || item.payload?.category === "income"
      ? "capital"
      : item.payload?.category === "career" || item.payload?.category === "learning"
        ? "career"
        : "life";
  }
  return laneForTags([item.category, item.label]);
}

function categoryForAction(item: PlannedAction): RouteNodeCategory {
  if (item.kind === "skill") return "skill";
  if (item.kind === "career" || item.kind === "core") return "career";
  if (item.kind === "asset") return "investment";
  if (item.kind === "social") return "relationship";
  if (item.kind === "opportunity") return "opportunity";
  if (/家庭/.test(item.category)) return "family";
  if (/健康|休息|保障|照护/.test(item.category)) return "wellbeing";
  if (/投资|住房|养老|税务|企业/.test(item.category)) return "investment";
  if (/职业|学习/.test(item.category)) return "career";
  if (/收入|income/.test(item.category)) return "income";
  return "wellbeing";
}

function pushNode(
  graph: LifeRouteState,
  node: LifeRouteNode,
  edgeKind: LifeRouteEdge["kind"],
  edgeLabel: string,
): LifeRouteState {
  const from = graph.cursors[node.lane] || LANE_ORIGINS[node.lane];
  const next: LifeRouteState = {
    nodes: [...graph.nodes, node].slice(-90),
    edges: [
      ...graph.edges,
      {
        id: `route-edge-${node.id}`,
        lane: node.lane,
        from,
        to: node.id,
        kind: edgeKind,
        label: edgeLabel,
        turn: node.turn,
      },
    ].slice(-90),
    cursors: { ...graph.cursors, [node.lane]: node.id },
    candidates: [...graph.candidates],
    lastMutation: {
      turn: node.turn,
      nodeId: node.id,
      summary: `${node.label}：${node.detail}`,
    },
  };
  return next;
}

function hasAnySkill(state: RouteSnapshot, ids: string[], level = 1): boolean {
  return ids.some((id) => (state.skills[id] ?? 0) >= level);
}

function hasAllSkills(state: RouteSnapshot, ids: string[], level = 1): boolean {
  return ids.every((id) => (state.skills[id] ?? 0) >= level);
}

export function deriveRouteCandidates(state: RouteSnapshot): LifeRouteCandidate[] {
  const emergencyMonths = state.cash / Math.max(1, state.fixedExpense + state.variableExpense);
  const maxTrust = Math.max(0, ...state.aiPlayers.map((player) => player.trust));
  const candidates: LifeRouteCandidate[] = [
    {
      id: "candidate-crossborder-content",
      lane: "career",
      category: "career",
      label: "跨境内容路线",
      detail: "翻译、采访、短视频与品牌合作",
      reason: "外语与内容能力已经能够形成组合，而不是单项数值加成。",
      requirements: ["俄语", "摄影/视频/表达任一项"],
      ready:
        hasAllSkills(state, ["russian"]) &&
        hasAnySkill(state, ["photography", "video", "communication"]),
    },
    {
      id: "candidate-crossborder-business",
      lane: "career",
      category: "career",
      label: "跨境经营路线",
      detail: "销售、贸易、物流与本地服务",
      reason: "语言能力与交易、履约能力组合后才能形成真实经营入口。",
      requirements: ["俄语", "销售/贸易/运营任一项"],
      ready:
        hasAllSkills(state, ["russian"]) &&
        hasAnySkill(state, ["sales", "trade", "operations", "logistics"]),
    },
    {
      id: "candidate-independent-expert",
      lane: "career",
      category: "career",
      label: "独立专家路线",
      detail: "顾问、研究、培训与高信用交付",
      reason: "专业能力必须与表达、谈判或教学组合，才能离开单一岗位。",
      requirements: ["研究/金融/技术达到 2 级", "表达/谈判/教学任一项"],
      ready:
        hasAnySkill(state, ["research", "finance", "coding", "engineering"], 2) &&
        hasAnySkill(state, ["communication", "negotiation", "teaching"]),
    },
    {
      id: "candidate-cash-optionality",
      lane: "capital",
      category: "investment",
      label: "六个月选择权",
      detail: `${emergencyMonths.toFixed(1)} / 6 个月安全垫`,
      reason: "现金缓冲不是分数，它会改变转行、谈判和危机事件的可选项。",
      requirements: ["应急金达到 6 个月"],
      ready: emergencyMonths >= 6,
    },
    {
      id: "candidate-diversified-income",
      lane: "capital",
      category: "income",
      label: "多元现金流",
      detail: "主动收入与资产现金流并存",
      reason: "第二收入来源已经开始降低单一职业冲击。",
      requirements: ["持有产生现金流的资产", "保留主动收入"],
      ready: state.monthlyIncome > 0 && state.passiveIncome > 0 && state.assets.length > 0,
    },
    {
      id: "candidate-business-owner",
      lane: "capital",
      category: "income",
      label: "企业经营者",
      detail: "订单、团队、库存与治理共同结算",
      reason: "创业只有进入持续经营与治理阶段，才是一条路线而不是一次加薪。",
      requirements: ["创办企业", "形成月度营收"],
      ready: Boolean(state.deep?.business.active && state.deep.business.monthlyRevenue > 0),
    },
    {
      id: "candidate-trusted-alliance",
      lane: "life",
      category: "relationship",
      label: "可信同盟",
      detail: `当前最高信任 ${Math.round(maxTrust)} / 70`,
      reason: "关系只有通过真实互惠和边界协商，才会变成可调用的社会资本。",
      requirements: ["一位角色信任达到 70"],
      ready: maxTrust >= 70,
    },
    {
      id: "candidate-sustainable-pace",
      lane: "life",
      category: "wellbeing",
      label: "可持续节奏",
      detail: `健康 ${Math.round(state.health)} · 精力 ${Math.round(state.energy)}`,
      reason: "健康与精力同时稳定，才能让多线经营不退化成无成本叠加。",
      requirements: ["健康达到 70", "精力达到 70"],
      ready: state.health >= 70 && state.energy >= 70,
    },
    {
      id: "candidate-family-finance",
      lane: "life",
      category: "family",
      label: "共同家庭财务",
      detail: "账户、照护、住房与长期目标",
      reason: "家庭路线会改变现金流、风险承受力与未来事件，而不是一项幸福加成。",
      requirements: ["建立共同财务", "家庭信任达到 60"],
      ready: Boolean(state.deep?.family.partnered && state.deep.family.familyTrust >= 60),
    },
  ];
  return candidates.sort((a, b) => Number(b.ready) - Number(a.ready));
}

export function createLifeRouteState(
  state: RouteSnapshot,
  roleName: string,
  careerName: string,
): LifeRouteState {
  const nodes = [
    originNode("career", roleName, careerName, `以${roleName}身份进入城市职业网络。`),
    originNode("capital", "现金起点", `可用现金 ¥${Math.round(state.cash).toLocaleString("zh-CN")}`, "初始现金与负债共同决定选择权。"),
    originNode("life", "生活起点", `健康 ${Math.round(state.health)} · 关系 ${Math.round(state.relationship)}`, "健康、精力与关系从第一回合起就是稀缺资源。"),
  ];
  return {
    nodes,
    edges: [],
    cursors: { ...LANE_ORIGINS },
    candidates: deriveRouteCandidates(state),
    lastMutation: null,
  };
}

export function recordActionOnRoute(
  graph: LifeRouteState,
  state: RouteSnapshot,
  item: PlannedAction,
  reveal: YearReveal,
): LifeRouteState {
  if (item.kind === "core") {
    return { ...graph, candidates: deriveRouteCandidates(state) };
  }
  const lane = laneForAction(item);
  const node: LifeRouteNode = {
    id: `route-${state.turn}-${item.id}`,
    lane,
    category: categoryForAction(item),
    status: reveal.success ? "reached" : "scar",
    label: item.label.replace(/^.+? · /, ""),
    detail: reveal.success ? "形成可继续使用的证据" : "留下成本与经验样本",
    evidence: reveal.outcome,
    turn: state.turn,
    sourceId: item.targetId,
  };
  const next = pushNode(graph, node, "choice", item.category);
  next.candidates = deriveRouteCandidates(state);
  return next;
}

export function recordEventOnRoute(
  graph: LifeRouteState,
  state: RouteSnapshot,
  event: EventDefinition,
  choiceLabel: string,
  outcome: string,
  success: boolean,
): LifeRouteState {
  const lane = laneForTags([event.type, ...(event.triggerTags ?? [])]);
  const node: LifeRouteNode = {
    id: `route-event-${state.turn}-${event.id}-${graph.nodes.length}`,
    lane,
    category: "event",
    status: success ? "reached" : "scar",
    label: event.title,
    detail: choiceLabel,
    evidence: outcome,
    turn: state.turn,
    sourceId: event.id,
  };
  const next = pushNode(graph, node, "consequence", `${event.type}事件`);
  next.candidates = deriveRouteCandidates(state);
  return next;
}

function historyToNode(entry: HistoryEntry, index: number): LifeRouteNode {
  const lane = laneForTags(entry.tags);
  return {
    id: `route-legacy-${entry.turn}-${index}`,
    lane,
    category: entry.type === "event" ? "event" : lane === "career" ? "career" : lane === "capital" ? "investment" : "wellbeing",
    status: "reached",
    label: entry.title,
    detail: "旧存档中的真实行动证据",
    evidence: entry.description,
    turn: entry.turn,
  };
}

export function upgradeLifeRouteState(
  state: RouteSnapshot & { history?: HistoryEntry[] },
  existing: LifeRouteState | undefined,
  roleName: string,
  careerName: string,
): LifeRouteState {
  if (existing?.nodes?.length && existing.cursors) {
    return {
      nodes: existing.nodes.map((node) => ({ ...node })),
      edges: (existing.edges ?? []).map((edge) => ({ ...edge })),
      cursors: { ...LANE_ORIGINS, ...existing.cursors },
      candidates: deriveRouteCandidates(state),
      lastMutation: existing.lastMutation ? { ...existing.lastMutation } : null,
    };
  }
  let graph = createLifeRouteState(state, roleName, careerName);
  const evidence = (state.history ?? [])
    .filter((entry) => entry.type === "action" || entry.type === "event")
    .slice(-18);
  for (const [index, entry] of evidence.entries()) {
    const node = historyToNode(entry, index);
    graph = pushNode(graph, node, entry.type === "event" ? "consequence" : "choice", "旧存档迁移");
  }
  graph.candidates = deriveRouteCandidates(state);
  return graph;
}
