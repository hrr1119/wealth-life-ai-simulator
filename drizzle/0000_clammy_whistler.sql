CREATE TABLE `multiplayer_players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`seat` integer NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`control` text DEFAULT 'human' NOT NULL,
	`online` integer DEFAULT 1 NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`submitted` integer DEFAULT 0 NOT NULL,
	`plan_json` text DEFAULT '[]' NOT NULL,
	`cash` real DEFAULT 60000 NOT NULL,
	`monthly_income` real DEFAULT 10000 NOT NULL,
	`monthly_expense` real DEFAULT 6500 NOT NULL,
	`trust` real DEFAULT 55 NOT NULL,
	`net_worth` real DEFAULT 60000 NOT NULL,
	`last_seen` integer NOT NULL,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_players_room_idx` ON `multiplayer_players` (`room_code`);--> statement-breakpoint
CREATE INDEX `multiplayer_players_room_seat_idx` ON `multiplayer_players` (`room_code`,`seat`);--> statement-breakpoint
CREATE TABLE `multiplayer_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_player_id` text NOT NULL,
	`mode` text NOT NULL,
	`turn` integer DEFAULT 1 NOT NULL,
	`max_turns` integer NOT NULL,
	`phase` text DEFAULT 'lobby' NOT NULL,
	`seed` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`phase_deadline` integer DEFAULT 0 NOT NULL,
	`world_event` text DEFAULT '{}' NOT NULL,
	`reveals_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `multiplayer_trades` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`from_player_id` text NOT NULL,
	`to_player_id` text NOT NULL,
	`cash` real DEFAULT 0 NOT NULL,
	`terms` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_trades_room_idx` ON `multiplayer_trades` (`room_code`);