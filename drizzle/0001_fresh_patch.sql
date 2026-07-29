DROP INDEX `multiplayer_players_room_seat_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `multiplayer_players_room_seat_unique` ON `multiplayer_players` (`room_code`,`seat`);