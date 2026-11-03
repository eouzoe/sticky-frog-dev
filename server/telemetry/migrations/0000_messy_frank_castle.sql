CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`anon` text NOT NULL,
	`session` text NOT NULL,
	`build` text NOT NULL,
	`dev` text,
	`country` text,
	`origin` text,
	`type` text NOT NULL,
	`level` integer,
	`x` real,
	`prog` real,
	`cause` text,
	`secs` real,
	`stars` integer,
	`n` integer,
	`flies` integer,
	`reason` text,
	`dist` integer,
	`score` integer,
	`item` text,
	`price` integer,
	`coins` integer,
	`lang` text,
	`vw` integer,
	`vh` integer,
	`quality` text,
	`boot_ms` integer
);
--> statement-breakpoint
CREATE INDEX `idx_events_type_level` ON `events` (`type`,`level`);--> statement-breakpoint
CREATE INDEX `idx_events_session` ON `events` (`session`);--> statement-breakpoint
CREATE INDEX `idx_events_ts` ON `events` (`ts`);