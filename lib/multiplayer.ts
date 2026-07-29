export type MultiplayerPhase =
  | "lobby"
  | "planning"
  | "negotiation"
  | "settlement"
  | "complete";

export interface MultiplayerPlanItem {
  id: string;
  label: string;
  category: string;
  timeCost: number;
  cashCost: number;
}

export interface MultiplayerPlayer {
  id: string;
  seat: number;
  name: string;
  control: "human" | "ai";
  online: boolean;
  ready: boolean;
  submitted: boolean;
  cash: number;
  monthlyIncome: number;
  monthlyExpense: number;
  trust: number;
  netWorth: number;
  isHost: boolean;
}

export interface MultiplayerReveal {
  playerId: string;
  playerName: string;
  outcomes: Array<{
    actionId: string;
    label: string;
    success: boolean;
    probability: number;
    cashDelta: number;
    incomeDelta: number;
    trustDelta: number;
    narrative: string;
  }>;
  totalCashDelta: number;
}

export interface MultiplayerTrade {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  cash: number;
  terms: string;
  status: "open" | "accepted" | "rejected" | "cancelled";
  createdAt: number;
}

export interface MultiplayerRoomSnapshot {
  code: string;
  mode: "quick" | "standard";
  turn: number;
  maxTurns: number;
  phase: MultiplayerPhase;
  seed: number;
  version: number;
  phaseDeadline: number;
  worldEvent: {
    title: string;
    description: string;
    modifier: number;
  };
  players: MultiplayerPlayer[];
  reveals: MultiplayerReveal[];
  trades: MultiplayerTrade[];
  serverNow: number;
}

export interface MultiplayerSession {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

export const MULTIPLAYER_ACTIONS: MultiplayerPlanItem[] = [
  {
    id: "career_sprint",
    label: "冲刺主业成果",
    category: "职业",
    timeCost: 3,
    cashCost: 0,
  },
  {
    id: "learn_skill",
    label: "学习一项可验证技能",
    category: "学习",
    timeCost: 2,
    cashCost: 3_000,
  },
  {
    id: "side_business",
    label: "验证小型副业",
    category: "经营",
    timeCost: 3,
    cashCost: 6_000,
  },
  {
    id: "market_invest",
    label: "配置一笔周期资产",
    category: "投资",
    timeCost: 1,
    cashCost: 8_000,
  },
  {
    id: "build_network",
    label: "维护合作关系",
    category: "关系",
    timeCost: 2,
    cashCost: 1_500,
  },
  {
    id: "family_commitment",
    label: "履行家庭承诺",
    category: "家庭",
    timeCost: 2,
    cashCost: 2_000,
  },
  {
    id: "recover_energy",
    label: "主动休整",
    category: "健康",
    timeCost: 2,
    cashCost: 1_000,
  },
  {
    id: "build_reserve",
    label: "保留现金缓冲",
    category: "现金流",
    timeCost: 1,
    cashCost: 0,
  },
];

export const MULTIPLAYER_WORLD_EVENTS = [
  {
    title: "融资环境突然收紧",
    description: "高投入项目更难获得外部资金，现金储备和真实收入更有价值。",
    modifier: -0.08,
  },
  {
    title: "本地消费温和复苏",
    description: "经营和关系类行动获得更多真实需求，但扩张成本也随之上升。",
    modifier: 0.05,
  },
  {
    title: "AI 工具进入普及期",
    description: "学习与职业行动更容易形成新产出，单纯追逐概念的投资仍然危险。",
    modifier: 0.07,
  },
  {
    title: "城市进入平稳换挡",
    description: "没有明显红利，行动质量、合作信用与现金流成为主要差异。",
    modifier: 0,
  },
  {
    title: "行业订单开始分化",
    description: "强交付者仍能增长，缺乏缓冲的玩家会承受更明显波动。",
    modifier: -0.03,
  },
] as const;

export function validateMultiplayerPlanSelection(
  value: unknown,
  cash: number,
): MultiplayerPlanItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null;
  const unique = new Set<string>();
  const plan: MultiplayerPlanItem[] = [];
  for (const raw of value) {
    const id = typeof raw === "object" && raw ? String((raw as { id?: unknown }).id ?? "") : "";
    const action = MULTIPLAYER_ACTIONS.find((candidate) => candidate.id === id);
    if (!action || unique.has(id)) return null;
    unique.add(id);
    plan.push(action);
  }
  const time = plan.reduce((sum, item) => sum + item.timeCost, 0);
  const cost = plan.reduce((sum, item) => sum + item.cashCost, 0);
  return time <= 8 && cost <= cash ? plan : null;
}

export function multiplayerApiBase(): string {
  if (typeof document === "undefined") return "";
  return document.body.dataset.runtime === "static"
    ? "https://wealth-life-ai-sim.q1658046672.chatgpt.site"
    : "";
}
