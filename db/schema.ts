import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const multiplayerRooms = sqliteTable("multiplayer_rooms", {
  code: text("code").primaryKey(),
  hostPlayerId: text("host_player_id").notNull(),
  mode: text("mode").notNull(),
  turn: integer("turn").notNull().default(1),
  maxTurns: integer("max_turns").notNull(),
  phase: text("phase").notNull().default("lobby"),
  seed: integer("seed").notNull(),
  version: integer("version").notNull().default(1),
  phaseDeadline: integer("phase_deadline").notNull().default(0),
  worldEvent: text("world_event").notNull().default("{}"),
  revealsJson: text("reveals_json").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const multiplayerPlayers = sqliteTable(
  "multiplayer_players",
  {
    id: text("id").primaryKey(),
    roomCode: text("room_code").notNull(),
    seat: integer("seat").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    control: text("control").notNull().default("human"),
    online: integer("online").notNull().default(1),
    ready: integer("ready").notNull().default(0),
    submitted: integer("submitted").notNull().default(0),
    planJson: text("plan_json").notNull().default("[]"),
    cash: real("cash").notNull().default(60000),
    monthlyIncome: real("monthly_income").notNull().default(10000),
    monthlyExpense: real("monthly_expense").notNull().default(6500),
    trust: real("trust").notNull().default(55),
    netWorth: real("net_worth").notNull().default(60000),
    lastSeen: integer("last_seen").notNull(),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [
    index("multiplayer_players_room_idx").on(table.roomCode),
    uniqueIndex("multiplayer_players_room_seat_unique").on(table.roomCode, table.seat),
  ],
);

export const multiplayerTrades = sqliteTable(
  "multiplayer_trades",
  {
    id: text("id").primaryKey(),
    roomCode: text("room_code").notNull(),
    fromPlayerId: text("from_player_id").notNull(),
    toPlayerId: text("to_player_id").notNull(),
    cash: real("cash").notNull().default(0),
    terms: text("terms").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("multiplayer_trades_room_idx").on(table.roomCode)],
);

export const multiplayerPlayerDomains = sqliteTable(
  "multiplayer_player_domains",
  {
    playerId: text("player_id").primaryKey(),
    roomCode: text("room_code").notNull(),
    stateJson: text("state_json").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("multiplayer_player_domains_room_idx").on(table.roomCode)],
);

export const multiplayerContracts = sqliteTable(
  "multiplayer_contracts",
  {
    id: text("id").primaryKey(),
    roomCode: text("room_code").notNull(),
    title: text("title").notNull(),
    fromPlayerId: text("from_player_id").notNull(),
    toPlayerId: text("to_player_id").notNull(),
    fromPlayerName: text("from_player_name").notNull(),
    toPlayerName: text("to_player_name").notNull(),
    terms: text("terms").notNull(),
    status: text("status").notNull().default("active"),
    contribution: real("contribution").notNull().default(1000),
    timeCost: integer("time_cost").notNull().default(2),
    payout: real("payout").notNull().default(3000),
    incomeDelta: real("income_delta").notNull().default(120),
    exitCost: real("exit_cost").notNull().default(1000),
    nextDueTurn: integer("next_due_turn").notNull(),
    milestone: integer("milestone").notNull().default(0),
    recordsJson: text("records_json").notNull().default("[]"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("multiplayer_contracts_room_idx").on(table.roomCode),
    index("multiplayer_contracts_room_status_idx").on(table.roomCode, table.status),
  ],
);
