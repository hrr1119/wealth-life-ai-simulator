import type { FamilyLedgerState, RiskLevel } from "./types.ts";

export type MultiplayerPhase =
  | "lobby"
  | "planning"
  | "negotiation"
  | "settlement"
  | "learning"
  | "complete";

export type MultiplayerActionKind =
  | "career_work"
  | "career"
  | "skill"
  | "asset_buy"
  | "asset_sell"
  | "life"
  | "contract";

export interface MultiplayerPlanItem {
  id: string;
  kind: MultiplayerActionKind;
  targetId: string;
  label: string;
  description: string;
  category: string;
  timeCost: number;
  cashCost: number;
  tags: string[];
  recommended: boolean;
  locked: boolean;
  lockReason?: string;
  contractAction?: "fulfill" | "exit";
  saleFraction?: 0.25 | 1;
}

export interface MultiplayerAssetHolding {
  assetId: string;
  name: string;
  category: string;
  units: number;
  costBasis: number;
  value: number;
  purchasedTurn: number;
}

export interface MultiplayerEventHistoryEntry {
  turn: number;
  eventId: string;
  title: string;
  choiceId: string;
  choiceLabel: string;
  success: boolean;
  narrative: string;
}

export interface MultiplayerDomainState {
  version: 1;
  roleId: string;
  careerId: string;
  skills: Record<string, number>;
  assets: MultiplayerAssetHolding[];
  familyLedger: FamilyLedgerState;
  health: number;
  energy: number;
  happiness: number;
  stress: number;
  credit: number;
  relationship: number;
  debt: number;
  passiveIncome: number;
  memories: string[];
  eventHistory: MultiplayerEventHistoryEntry[];
}

export interface MultiplayerPublicDomain {
  roleId: string;
  roleName: string;
  careerId: string;
  careerName: string;
  health: number;
  energy: number;
  happiness: number;
  stress: number;
  credit: number;
  debt: number;
  passiveIncome: number;
  skills: Array<{ id: string; name: string; level: number; category: string }>;
  assets: MultiplayerAssetHolding[];
  familyLedger: FamilyLedgerState;
  activeSkillCombinations: string[];
  eventHistory: MultiplayerEventHistoryEntry[];
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
  domain: MultiplayerPublicDomain;
}

export interface MultiplayerOutcome {
  actionId: string;
  kind: MultiplayerActionKind | "event" | "settlement";
  targetId: string;
  label: string;
  success: boolean;
  probability: number;
  cashDelta: number;
  incomeDelta: number;
  expenseDelta: number;
  passiveIncomeDelta: number;
  debtDelta: number;
  energyDelta: number;
  stressDelta: number;
  trustDelta: number;
  narrative: string;
  evidence: string[];
}

export interface MultiplayerReveal {
  playerId: string;
  playerName: string;
  outcomes: MultiplayerOutcome[];
  totalCashDelta: number;
  settlementCashflow: number;
  familyCost: number;
  assetChange: number;
  debtInterest: number;
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

export interface MultiplayerContractRecord {
  turn: number;
  action: "accepted" | "fulfilled" | "breached" | "terminated" | "completed";
  detail: string;
}

export interface MultiplayerContract {
  id: string;
  title: string;
  partyIds: [string, string];
  partyNames: [string, string];
  terms: string;
  status: "active" | "completed" | "breached" | "terminated";
  contribution: number;
  timeCost: number;
  payout: number;
  incomeDelta: number;
  exitCost: number;
  nextDueTurn: number;
  milestone: number;
  records: MultiplayerContractRecord[];
}

export interface MultiplayerWorldEventChoice {
  id: string;
  label: string;
  description: string;
  risk: RiskLevel;
  cost: number;
  timeCost: number;
}

export interface MultiplayerWorldEvent {
  eventId: string;
  type: string;
  title: string;
  description: string;
  modifier: number;
  tags: string[];
  choices: MultiplayerWorldEventChoice[];
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
  worldEvent: MultiplayerWorldEvent;
  players: MultiplayerPlayer[];
  reveals: MultiplayerReveal[];
  trades: MultiplayerTrade[];
  contracts: MultiplayerContract[];
  availableActions: MultiplayerPlanItem[];
  serverNow: number;
}

export interface MultiplayerSession {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

export interface MultiplayerSubmittedPlan {
  actions: MultiplayerPlanItem[];
  eventChoiceId: string;
}

export function parseMultiplayerSubmittedPlan(value: unknown): MultiplayerSubmittedPlan {
  if (Array.isArray(value)) {
    return { actions: value as MultiplayerPlanItem[], eventChoiceId: "" };
  }
  if (!value || typeof value !== "object") return { actions: [], eventChoiceId: "" };
  const candidate = value as { actions?: unknown; eventChoiceId?: unknown };
  return {
    actions: Array.isArray(candidate.actions) ? candidate.actions as MultiplayerPlanItem[] : [],
    eventChoiceId: String(candidate.eventChoiceId ?? ""),
  };
}

export function validateMultiplayerPlanSelection(
  value: unknown,
  cash: number,
  availableActions: MultiplayerPlanItem[],
): MultiplayerPlanItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null;
  const unique = new Set<string>();
  const plan: MultiplayerPlanItem[] = [];
  for (const raw of value) {
    const id = typeof raw === "object" && raw ? String((raw as { id?: unknown }).id ?? "") : "";
    const action = availableActions.find((candidate) => candidate.id === id);
    if (!action || action.locked || unique.has(id)) return null;
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
