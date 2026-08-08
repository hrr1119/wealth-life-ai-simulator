CREATE TABLE `multiplayer_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`title` text NOT NULL,
	`from_player_id` text NOT NULL,
	`to_player_id` text NOT NULL,
	`from_player_name` text NOT NULL,
	`to_player_name` text NOT NULL,
	`terms` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`contribution` real DEFAULT 1000 NOT NULL,
	`time_cost` integer DEFAULT 2 NOT NULL,
	`payout` real DEFAULT 3000 NOT NULL,
	`income_delta` real DEFAULT 120 NOT NULL,
	`exit_cost` real DEFAULT 1000 NOT NULL,
	`next_due_turn` integer NOT NULL,
	`milestone` integer DEFAULT 0 NOT NULL,
	`records_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_contracts_room_idx` ON `multiplayer_contracts` (`room_code`);--> statement-breakpoint
CREATE INDEX `multiplayer_contracts_room_status_idx` ON `multiplayer_contracts` (`room_code`,`status`);--> statement-breakpoint
CREATE TABLE `multiplayer_player_domains` (
	`player_id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_player_domains_room_idx` ON `multiplayer_player_domains` (`room_code`);