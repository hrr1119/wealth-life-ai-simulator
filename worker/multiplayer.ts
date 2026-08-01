import {
  MULTIPLAYER_ACTIONS,
  MULTIPLAYER_WORLD_EVENTS,
  validateMultiplayerPlanSelection,
  type MultiplayerPlanItem,
  type MultiplayerReveal,
} from "../lib/multiplayer.ts";

interface D1Result {
  success: boolean;
  meta?: { changes?: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

interface RoomRow {
  code: string;
  host_player_id: string;
  mode: "quick" | "standard";
  turn: number;
  max_turns: number;
  phase: "lobby" | "planning" | "negotiation" | "settlement" | "learning" | "complete";
  seed: number;
  version: number;
  phase_deadline: number;
  world_event: string;
  reveals_json: string;
  created_at: number;
  updated_at: number;
}

interface PlayerRow {
  id: string;
  room_code: string;
  seat: number;
  name: string;
  token_hash: string;
  control: "human" | "ai";
  online: number;
  ready: number;
  submitted: number;
  plan_json: string;
  cash: number;
  monthly_income: number;
  monthly_expense: number;
  trust: number;
  net_worth: number;
  last_seen: number;
  joined_at: number;
}

interface TradeRow {
  id: string;
  room_code: string;
  from_player_id: string;
  to_player_id: string;
  cash: number;
  terms: string;
  status: "open" | "accepted" | "rejected" | "cancelled";
  created_at: number;
  updated_at: number;
}

const MAX_ROOM_PLAYERS = 4;
const MIN_ROOM_PLAYERS = 2;
const HUMAN_STALE_MS = 75_000;
const PLANNING_WINDOW_MS = 150_000;
let schemaReady = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Player-Id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

function cleanName(value: unknown): string {
  return String(value ?? "")
    .replace(/[<>{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

function cleanTerms(value: unknown): string {
  return String(value ?? "")
    .replace(/[<>{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deterministicRoll(value: string): number {
  return fnv1a(value) / 4_294_967_296;
}

function worldEvent(seed: number, turn: number) {
  return MULTIPLAYER_WORLD_EVENTS[
    Math.floor(deterministicRoll(`${seed}:world:${turn}`) * MULTIPLAYER_WORLD_EVENTS.length)
  ];
}

function actionRules(actionId: string) {
  return {
    career_sprint: { base: 0.68, successCash: 5_000, failureCash: 0, income: 650, trust: 1 },
    learn_skill: { base: 0.82, successCash: 1_000, failureCash: 0, income: 280, trust: 1 },
    side_business: { base: 0.54, successCash: 15_000, failureCash: -2_000, income: 520, trust: 0 },
    market_invest: { base: 0.57, successCash: 12_000, failureCash: -5_000, income: 120, trust: 0 },
    build_network: { base: 0.74, successCash: 2_000, failureCash: 0, income: 180, trust: 8 },
    family_commitment: { base: 0.9, successCash: 0, failureCash: 0, income: 0, trust: 6 },
    recover_energy: { base: 1, successCash: 0, failureCash: 0, income: 0, trust: 2 },
    build_reserve: { base: 1, successCash: 0, failureCash: 0, income: 0, trust: 1 },
  }[actionId];
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS multiplayer_rooms (
      code TEXT PRIMARY KEY NOT NULL,
      host_player_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      turn INTEGER DEFAULT 1 NOT NULL,
      max_turns INTEGER NOT NULL,
      phase TEXT DEFAULT 'lobby' NOT NULL,
      seed INTEGER NOT NULL,
      version INTEGER DEFAULT 1 NOT NULL,
      phase_deadline INTEGER DEFAULT 0 NOT NULL,
      world_event TEXT DEFAULT '{}' NOT NULL,
      reveals_json TEXT DEFAULT '[]' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS multiplayer_players (
      id TEXT PRIMARY KEY NOT NULL,
      room_code TEXT NOT NULL,
      seat INTEGER NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      control TEXT DEFAULT 'human' NOT NULL,
      online INTEGER DEFAULT 1 NOT NULL,
      ready INTEGER DEFAULT 0 NOT NULL,
      submitted INTEGER DEFAULT 0 NOT NULL,
      plan_json TEXT DEFAULT '[]' NOT NULL,
      cash REAL DEFAULT 60000 NOT NULL,
      monthly_income REAL DEFAULT 10000 NOT NULL,
      monthly_expense REAL DEFAULT 6500 NOT NULL,
      trust REAL DEFAULT 55 NOT NULL,
      net_worth REAL DEFAULT 60000 NOT NULL,
      last_seen INTEGER NOT NULL,
      joined_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS multiplayer_trades (
      id TEXT PRIMARY KEY NOT NULL,
      room_code TEXT NOT NULL,
      from_player_id TEXT NOT NULL,
      to_player_id TEXT NOT NULL,
      cash REAL DEFAULT 0 NOT NULL,
      terms TEXT NOT NULL,
      status TEXT DEFAULT 'open' NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_players_room_idx ON multiplayer_players (room_code)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS multiplayer_players_room_seat_unique ON multiplayer_players (room_code, seat)"),
    db.prepare("CREATE INDEX IF NOT EXISTS multiplayer_trades_room_idx ON multiplayer_trades (room_code)"),
  ]);
  schemaReady = true;
}

async function getRoom(db: D1Database, code: string): Promise<RoomRow | null> {
  return db.prepare("SELECT * FROM multiplayer_rooms WHERE code = ?").bind(code).first<RoomRow>();
}

async function getPlayers(db: D1Database, code: string): Promise<PlayerRow[]> {
  const result = await db
    .prepare("SELECT * FROM multiplayer_players WHERE room_code = ? ORDER BY seat ASC")
    .bind(code)
    .all<PlayerRow>();
  return result.results;
}

async function getTrades(db: D1Database, code: string): Promise<TradeRow[]> {
  const result = await db
    .prepare("SELECT * FROM multiplayer_trades WHERE room_code = ? ORDER BY created_at DESC LIMIT 30")
    .bind(code)
    .all<TradeRow>();
  return result.results;
}

async function promoteHostIfNeeded(db: D1Database, room: RoomRow): Promise<void> {
  const players = await getPlayers(db, room.code);
  const host = players.find((player) => player.id === room.host_player_id);
  const hostUnavailable =
    !host ||
    host.control === "ai" ||
    !host.online ||
    Date.now() - host.last_seen > HUMAN_STALE_MS;
  if (!hostUnavailable) return;
  const nextHost = players.find(
    (player) =>
      player.id !== room.host_player_id &&
      player.control === "human" &&
      player.online &&
      Date.now() - player.last_seen <= HUMAN_STALE_MS,
  );
  if (!nextHost) return;
  await db
    .prepare(
      "UPDATE multiplayer_rooms SET host_player_id = ?, version = version + 1, updated_at = ? WHERE code = ? AND host_player_id = ?",
    )
    .bind(nextHost.id, Date.now(), room.code, room.host_player_id)
    .run();
}

async function authenticate(
  db: D1Database,
  request: Request,
  code: string,
): Promise<PlayerRow | null> {
  const playerId = request.headers.get("X-Player-Id")?.trim();
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!playerId || !token) return null;
  const player = await db
    .prepare("SELECT * FROM multiplayer_players WHERE id = ? AND room_code = ?")
    .bind(playerId, code)
    .first<PlayerRow>();
  if (!player || (await hashToken(token)) !== player.token_hash) return null;
  return player;
}

function aiPlan(player: PlayerRow, room: RoomRow): MultiplayerPlanItem[] {
  const affordable = MULTIPLAYER_ACTIONS.filter((item) => item.cashCost <= player.cash * 0.22);
  const first = affordable[Math.floor(deterministicRoll(`${room.seed}:${room.turn}:${player.id}:a`) * affordable.length)];
  const candidates = affordable.filter(
    (item) => item.id !== first.id && item.timeCost + first.timeCost <= 8,
  );
  const second = candidates[
    Math.floor(deterministicRoll(`${room.seed}:${room.turn}:${player.id}:b`) * candidates.length)
  ];
  return second ? [first, second] : [first];
}

function createReveals(room: RoomRow, players: PlayerRow[]): MultiplayerReveal[] {
  const event = parseJson<{ modifier?: number }>(room.world_event, {});
  return players.map((player) => {
    const plan = parseJson<MultiplayerPlanItem[]>(player.plan_json, []);
    const outcomes = plan.map((action) => {
      const rules = actionRules(action.id) ?? {
        base: 0.5,
        successCash: 0,
        failureCash: 0,
        income: 0,
        trust: 0,
      };
      const resourceModifier = player.cash >= action.cashCost * 4 ? 0.05 : -0.04;
      const trustModifier =
        action.category === "关系" || action.category === "家庭"
          ? (player.trust - 50) / 500
          : 0;
      const probability = Math.max(
        0.08,
        Math.min(0.95, rules.base + (event.modifier ?? 0) + resourceModifier + trustModifier),
      );
      const roll = deterministicRoll(
        `${room.code}:${room.seed}:${room.turn}:${player.id}:${action.id}`,
      );
      const success = roll <= probability;
      const cashDelta =
        -action.cashCost + (success ? rules.successCash : rules.failureCash);
      const incomeDelta = success ? rules.income : 0;
      const trustDelta = success ? rules.trust : action.category === "关系" ? -2 : 0;
      return {
        actionId: action.id,
        label: action.label,
        success,
        probability,
        cashDelta,
        incomeDelta,
        trustDelta,
        narrative: success
          ? `${action.label}形成了可继续使用的结果。`
          : `${action.label}没有达到目标，但成本和样本会进入下一轮判断。`,
      };
    });
    return {
      playerId: player.id,
      playerName: player.name,
      outcomes,
      totalCashDelta: outcomes.reduce((sum, outcome) => sum + outcome.cashDelta, 0),
    };
  });
}

async function resolvePlanning(db: D1Database, room: RoomRow): Promise<void> {
  const claimed = await db
    .prepare(
      "UPDATE multiplayer_rooms SET phase = 'negotiation', phase_deadline = ?, updated_at = ?, version = version + 1 WHERE code = ? AND phase = 'planning'",
    )
    .bind(Date.now() + 180_000, Date.now(), room.code)
    .run();
  if ((claimed.meta?.changes ?? 0) !== 1) return;
}

async function claimAndResolveIfReady(db: D1Database, code: string): Promise<void> {
  const remaining = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM multiplayer_players WHERE room_code = ? AND submitted = 0",
    )
    .bind(code)
    .first<{ count: number }>();
  if ((remaining?.count ?? 1) > 0) return;
  const room = await getRoom(db, code);
  if (room?.phase === "planning") await resolvePlanning(db, room);
}

async function tickRoom(db: D1Database, room: RoomRow): Promise<void> {
  if (room.phase !== "planning") return;
  const now = Date.now();
  const players = await getPlayers(db, room.code);
  const statements: D1PreparedStatement[] = [];
  for (const player of players) {
    const stale = now - player.last_seen > HUMAN_STALE_MS;
    const deadlineExpired = room.phase_deadline > 0 && room.phase_deadline <= now;
    if (!player.submitted && (stale || deadlineExpired || player.control === "ai")) {
      statements.push(
        db
          .prepare(
            "UPDATE multiplayer_players SET control = 'ai', online = 0, submitted = 1, plan_json = ? WHERE id = ? AND submitted = 0",
          )
          .bind(JSON.stringify(aiPlan(player, room)), player.id),
      );
    } else if (stale && player.control === "human") {
      statements.push(
        db
          .prepare("UPDATE multiplayer_players SET control = 'ai', online = 0 WHERE id = ?")
          .bind(player.id),
      );
    }
  }
  if (statements.length) await db.batch(statements);
  await claimAndResolveIfReady(db, room.code);
}

async function tickNegotiation(db: D1Database, room: RoomRow): Promise<void> {
  if (
    room.phase !== "negotiation" ||
    room.phase_deadline <= 0 ||
    room.phase_deadline > Date.now()
  ) {
    return;
  }
  const claimed = await db
    .prepare(
      "UPDATE multiplayer_rooms SET phase = 'settlement', updated_at = ?, version = version + 1 WHERE code = ? AND phase = 'negotiation'",
    )
    .bind(Date.now(), room.code)
    .run();
  if ((claimed.meta?.changes ?? 0) !== 1) return;
  const settling = await getRoom(db, room.code);
  if (settling) await prepareAndApplySettlement(db, settling);
}

async function prepareAndApplySettlement(db: D1Database, room: RoomRow): Promise<void> {
  const players = await getPlayers(db, room.code);
  const reveals = createReveals(room, players);
  await db
    .prepare(
      "UPDATE multiplayer_rooms SET reveals_json = ?, updated_at = ?, version = version + 1 WHERE code = ? AND phase = 'settlement'",
    )
    .bind(JSON.stringify(reveals), Date.now(), room.code)
    .run();
  const latest = await getRoom(db, room.code);
  if (latest?.phase === "settlement") await applySettlement(db, latest);
}

async function applySettlement(db: D1Database, room: RoomRow): Promise<void> {
  const players = await getPlayers(db, room.code);
  const reveals = parseJson<MultiplayerReveal[]>(room.reveals_json, []);
  const statements: D1PreparedStatement[] = [];
  for (const player of players) {
    const reveal = reveals.find((candidate) => candidate.playerId === player.id);
    const cashDelta = reveal?.outcomes.reduce((sum, item) => sum + item.cashDelta, 0) ?? 0;
    const incomeDelta = reveal?.outcomes.reduce((sum, item) => sum + item.incomeDelta, 0) ?? 0;
    const trustDelta = reveal?.outcomes.reduce((sum, item) => sum + item.trustDelta, 0) ?? 0;
    const settlementCash = player.monthly_income * 12 - player.monthly_expense * 12;
    const nextCash = Math.max(0, player.cash + cashDelta + settlementCash);
    statements.push(
      db
        .prepare(
          "UPDATE multiplayer_players SET cash = ?, monthly_income = ?, trust = ?, net_worth = ?, submitted = 0, plan_json = '[]' WHERE id = ?",
        )
        .bind(
          nextCash,
          Math.max(0, player.monthly_income + incomeDelta),
          Math.max(0, Math.min(100, player.trust + trustDelta)),
          nextCash,
          player.id,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        "UPDATE multiplayer_rooms SET phase = 'learning', phase_deadline = ?, updated_at = ?, version = version + 1 WHERE code = ? AND phase = 'settlement'",
      )
      .bind(
        Date.now() + 180_000,
        Date.now(),
        room.code,
      ),
  );
  await db.batch(statements);
}

async function finishLearning(db: D1Database, room: RoomRow): Promise<void> {
  if (room.phase !== "learning") return;
  const completed = room.turn >= room.max_turns;
  const nextTurn = completed ? room.turn : room.turn + 1;
  const event = worldEvent(room.seed, nextTurn);
  await db
    .prepare(
      "UPDATE multiplayer_rooms SET turn = ?, phase = ?, phase_deadline = ?, world_event = ?, reveals_json = '[]', updated_at = ?, version = version + 1 WHERE code = ? AND phase = 'learning'",
    )
    .bind(
      nextTurn,
      completed ? "complete" : "planning",
      completed ? 0 : Date.now() + PLANNING_WINDOW_MS,
      JSON.stringify(event),
      Date.now(),
      room.code,
    )
    .run();
}

async function snapshot(db: D1Database, code: string): Promise<Response> {
  const room = await getRoom(db, code);
  if (!room) return json({ error: "房间不存在或已经关闭。" }, 404);
  await promoteHostIfNeeded(db, room);
  if (room.phase === "planning") {
    await tickRoom(db, room);
  } else if (room.phase === "negotiation") {
    await tickNegotiation(db, room);
  } else if (room.phase === "settlement" && Date.now() - room.updated_at > 4_000) {
    if (parseJson<MultiplayerReveal[]>(room.reveals_json, []).length) await applySettlement(db, room);
    else await prepareAndApplySettlement(db, room);
  } else if (room.phase === "learning" && room.phase_deadline > 0 && room.phase_deadline <= Date.now()) {
    await finishLearning(db, room);
  }
  const current = (await getRoom(db, code)) ?? room;
  const players = await getPlayers(db, code);
  const trades = await getTrades(db, code);
  return json({
    code: current.code,
    mode: current.mode,
    turn: current.turn,
    maxTurns: current.max_turns,
    phase: current.phase,
    seed: current.seed,
    version: current.version,
    phaseDeadline: current.phase_deadline,
    worldEvent: parseJson(current.world_event, {
      title: "等待世界生成",
      description: "房主开始后会共同揭晓宏观事件。",
      modifier: 0,
    }),
    players: players.map((player) => ({
      id: player.id,
      seat: player.seat,
      name: player.name,
      control: player.control,
      online: Boolean(player.online) && Date.now() - player.last_seen < HUMAN_STALE_MS,
      ready: Boolean(player.ready),
      submitted: Boolean(player.submitted),
      cash: player.cash,
      monthlyIncome: player.monthly_income,
      monthlyExpense: player.monthly_expense,
      trust: player.trust,
      netWorth: player.net_worth,
      isHost: player.id === current.host_player_id,
    })),
    reveals:
      current.phase === "learning" || current.phase === "settlement" || current.phase === "complete"
        ? parseJson(current.reveals_json, [])
        : [],
    trades: trades.map((trade) => ({
      id: trade.id,
      fromPlayerId: trade.from_player_id,
      toPlayerId: trade.to_player_id,
      cash: trade.cash,
      terms: trade.terms,
      status: trade.status,
      createdAt: trade.created_at,
    })),
    serverNow: Date.now(),
  });
}

async function createRoom(db: D1Database, body: Record<string, unknown>): Promise<Response> {
  const name = cleanName(body.name);
  const mode = body.mode === "standard" ? "standard" : "quick";
  if (name.length < 2) return json({ error: "请输入 2–18 个字符的玩家名。" }, 400);
  let code = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = roomCode();
    if (!(await getRoom(db, candidate))) {
      code = candidate;
      break;
    }
  }
  if (!code) return json({ error: "暂时无法分配房间，请稍后重试。" }, 503);
  const now = Date.now();
  const playerId = crypto.randomUUID();
  const token = randomToken();
  const seed = Math.floor(Math.random() * 2_000_000_000);
  await db.batch([
    db
      .prepare(
        "INSERT INTO multiplayer_rooms (code, host_player_id, mode, turn, max_turns, phase, seed, version, phase_deadline, world_event, reveals_json, created_at, updated_at) VALUES (?, ?, ?, 1, ?, 'lobby', ?, 1, 0, '{}', '[]', ?, ?)",
      )
      .bind(code, playerId, mode, mode === "standard" ? 24 : 12, seed, now, now),
    db
      .prepare(
        "INSERT INTO multiplayer_players (id, room_code, seat, name, token_hash, control, online, ready, submitted, plan_json, cash, monthly_income, monthly_expense, trust, net_worth, last_seen, joined_at) VALUES (?, ?, 1, ?, ?, 'human', 1, 1, 0, '[]', 60000, 10000, 6500, 55, 60000, ?, ?)",
      )
      .bind(playerId, code, name, await hashToken(token), now, now),
  ]);
  return json({ session: { code, playerId, token, name } }, 201);
}

async function joinRoom(db: D1Database, body: Record<string, unknown>): Promise<Response> {
  const code = String(body.code ?? "").trim().toUpperCase();
  const name = cleanName(body.name);
  const room = await getRoom(db, code);
  if (!room) return json({ error: "没有找到这个房间。" }, 404);
  if (room.phase !== "lobby") return json({ error: "这局已经开始，不能再加入新玩家。" }, 409);
  const players = await getPlayers(db, code);
  if (players.length >= MAX_ROOM_PLAYERS) return json({ error: "房间已经满员。" }, 409);
  if (name.length < 2) return json({ error: "请输入 2–18 个字符的玩家名。" }, 400);
  const now = Date.now();
  const playerId = crypto.randomUUID();
  const token = randomToken();
  await db
    .prepare(
      "INSERT INTO multiplayer_players (id, room_code, seat, name, token_hash, control, online, ready, submitted, plan_json, cash, monthly_income, monthly_expense, trust, net_worth, last_seen, joined_at) VALUES (?, ?, ?, ?, ?, 'human', 1, 1, 0, '[]', 60000, 10000, 6500, 55, 60000, ?, ?)",
    )
    .bind(playerId, code, players.length + 1, name, await hashToken(token), now, now)
    .run();
  await db
    .prepare("UPDATE multiplayer_rooms SET version = version + 1, updated_at = ? WHERE code = ?")
    .bind(now, code)
    .run();
  return json({ session: { code, playerId, token, name } }, 201);
}

async function handleAction(
  db: D1Database,
  request: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const code = String(body.code ?? "").trim().toUpperCase();
  const action = String(body.action ?? "");
  const player = await authenticate(db, request, code);
  if (!player) return json({ error: "房间身份已失效，请重新加入。" }, 401);
  const room = await getRoom(db, code);
  if (!room) return json({ error: "房间不存在。" }, 404);
  const now = Date.now();
  await db
    .prepare(
      "UPDATE multiplayer_players SET last_seen = ?, online = 1, control = 'human' WHERE id = ?",
    )
    .bind(now, player.id)
    .run();

  if (action === "heartbeat") return snapshot(db, code);

  if (action === "start") {
    if (room.host_player_id !== player.id) return json({ error: "只有房主可以开始。" }, 403);
    const players = await getPlayers(db, code);
    if (players.length < MIN_ROOM_PLAYERS) return json({ error: "至少需要 2 位玩家。" }, 409);
    if (room.phase !== "lobby") return json({ error: "这局已经开始。" }, 409);
    const event = worldEvent(room.seed, 1);
    await db.batch([
      db
        .prepare(
          "UPDATE multiplayer_rooms SET phase = 'planning', phase_deadline = ?, world_event = ?, updated_at = ?, version = version + 1 WHERE code = ? AND phase = 'lobby'",
        )
        .bind(now + PLANNING_WINDOW_MS, JSON.stringify(event), now, code),
      db
        .prepare(
          "UPDATE multiplayer_players SET submitted = 0, plan_json = '[]' WHERE room_code = ?",
        )
        .bind(code),
    ]);
    return snapshot(db, code);
  }

  if (action === "submit_plan") {
    if (room.phase !== "planning") return json({ error: "当前不是同时规划阶段。" }, 409);
    const plan = validateMultiplayerPlanSelection(body.plan, player.cash);
    if (!plan) return json({ error: "计划需包含 1–3 项行动，最多 8 点时间且不能超过可用现金。" }, 400);
    const update = await db
      .prepare(
        "UPDATE multiplayer_players SET plan_json = ?, submitted = 1, last_seen = ? WHERE id = ? AND submitted = 0",
      )
      .bind(JSON.stringify(plan), now, player.id)
      .run();
    if ((update.meta?.changes ?? 0) !== 1) return json({ error: "本回合计划已经提交。" }, 409);
    await claimAndResolveIfReady(db, code);
    return snapshot(db, code);
  }

  if (action === "propose_trade") {
    if (room.phase !== "negotiation") return json({ error: "只有谈判窗口可以提出交易。" }, 409);
    const toPlayerId = String(body.toPlayerId ?? "");
    const cash = Math.round(Number(body.cash ?? 0));
    const terms = cleanTerms(body.terms);
    const target = await db
      .prepare("SELECT * FROM multiplayer_players WHERE id = ? AND room_code = ?")
      .bind(toPlayerId, code)
      .first<PlayerRow>();
    if (!target || target.id === player.id) return json({ error: "请选择另一位房间玩家。" }, 400);
    if (!Number.isFinite(cash) || cash < 0 || cash > player.cash || cash > 100_000) {
      return json({ error: "交易现金超出可承受范围。" }, 400);
    }
    if (terms.length < 4) return json({ error: "请写清楚交换条件或合作承诺。" }, 400);
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO multiplayer_trades (id, room_code, from_player_id, to_player_id, cash, terms, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)",
      )
      .bind(id, code, player.id, target.id, cash, terms, now, now)
      .run();
    return snapshot(db, code);
  }

  if (action === "respond_trade") {
    if (room.phase !== "negotiation") return json({ error: "谈判窗口已经关闭。" }, 409);
    const tradeId = String(body.tradeId ?? "");
    const decision = body.decision === "accept" ? "accepted" : "rejected";
    const trade = await db
      .prepare("SELECT * FROM multiplayer_trades WHERE id = ? AND room_code = ?")
      .bind(tradeId, code)
      .first<TradeRow>();
    if (!trade || trade.to_player_id !== player.id || trade.status !== "open") {
      return json({ error: "这项交易已处理或不属于你。" }, 409);
    }
    if (decision === "accepted") {
      const from = await db
        .prepare("SELECT * FROM multiplayer_players WHERE id = ?")
        .bind(trade.from_player_id)
        .first<PlayerRow>();
      if (!from || from.cash < trade.cash) return json({ error: "发起方现金已经不足。" }, 409);
      const claim = await db
        .prepare(
          "UPDATE multiplayer_trades SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'open'",
        )
        .bind(now, trade.id)
        .run();
      if ((claim.meta?.changes ?? 0) !== 1) {
        return json({ error: "这项交易刚刚已经被处理。" }, 409);
      }
      await db.batch([
        db
          .prepare("UPDATE multiplayer_players SET cash = cash - ?, trust = MIN(100, trust + 2) WHERE id = ?")
          .bind(trade.cash, trade.from_player_id),
        db
          .prepare("UPDATE multiplayer_players SET cash = cash + ?, trust = MIN(100, trust + 2) WHERE id = ?")
          .bind(trade.cash, trade.to_player_id),
        db
          .prepare("UPDATE multiplayer_trades SET status = 'accepted', updated_at = ? WHERE id = ? AND status = 'processing'")
          .bind(now, trade.id),
      ]);
    } else {
      await db
        .prepare("UPDATE multiplayer_trades SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'open'")
        .bind(now, trade.id)
        .run();
    }
    return snapshot(db, code);
  }

  if (action === "advance") {
    if (room.host_player_id !== player.id) return json({ error: "只有房主可以推进共同回合。" }, 403);
    if (room.phase === "learning") {
      await finishLearning(db, room);
      return snapshot(db, code);
    }
    if (room.phase !== "negotiation") return json({ error: "当前阶段不能推进共同回合。" }, 409);
    const claimed = await db
      .prepare(
        "UPDATE multiplayer_rooms SET phase = 'settlement', updated_at = ?, version = version + 1 WHERE code = ? AND phase = 'negotiation'",
      )
      .bind(now, code)
      .run();
    if ((claimed.meta?.changes ?? 0) !== 1) return json({ error: "本回合正在结算。" }, 409);
    const settling = await getRoom(db, code);
    if (settling) await prepareAndApplySettlement(db, settling);
    return snapshot(db, code);
  }

  if (action === "leave") {
    await db
      .prepare("UPDATE multiplayer_players SET control = 'ai', online = 0, last_seen = ? WHERE id = ?")
      .bind(now - HUMAN_STALE_MS - 1, player.id)
      .run();
    await promoteHostIfNeeded(db, room);
    if (room.phase === "planning") await tickRoom(db, room);
    return json({ ok: true });
  }

  return json({ error: "未知的房间操作。" }, 400);
}

export async function handleMultiplayerRequest(
  request: Request,
  db: D1Database | undefined,
): Promise<Response> {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (!db) return json({ error: "多人房间数据库尚未连接。" }, 503);
  await ensureSchema(db);
  if (request.method === "GET") {
    const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
    const player = await authenticate(db, request, code);
    if (!player) return json({ error: "房间身份已失效，请重新加入。" }, 401);
    await db
      .prepare(
        "UPDATE multiplayer_players SET last_seen = ?, online = 1, control = 'human' WHERE id = ?",
      )
      .bind(Date.now(), player.id)
      .run();
    return snapshot(db, code);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "请求格式无效。" }, 400);
  }
  const action = String(body.action ?? "");
  if (action === "create") return createRoom(db, body);
  if (action === "join") return joinRoom(db, body);
  return handleAction(db, request, body);
}
