CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`site_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_amount_positive" CHECK("expenses"."amount" > 0),
	CONSTRAINT "ledger_date_valid" CHECK(date("expenses"."date") IS "expenses"."date")
);
--> statement-breakpoint
CREATE INDEX `idx_expense_site_date` ON `expenses` (`site_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_expense_by_date` ON `expenses` (`created_by`,`date`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`site_id` integer,
	`category_id` integer NOT NULL,
	`mode` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_amount_positive" CHECK("ledger_entries"."amount" > 0),
	CONSTRAINT "ledger_date_valid" CHECK(date("ledger_entries"."date") IS "ledger_entries"."date")
);
--> statement-breakpoint
CREATE INDEX `idx_ledger_person_date` ON `ledger_entries` (`person_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_ledger_site_date` ON `ledger_entries` (`site_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_ledger_by_date` ON `ledger_entries` (`created_by`,`date`);--> statement-breakpoint
CREATE TABLE `person_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_types_name_unique` ON `person_types` (`name`);--> statement-breakpoint
CREATE TABLE `persons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`mobile` text NOT NULL,
	`mobile_2` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`person_type_id` integer NOT NULL,
	`user_id` integer,
	FOREIGN KEY (`person_type_id`) REFERENCES `person_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "persons_mobile_10_digits" CHECK(length("persons"."mobile") = 10 AND "persons"."mobile" NOT GLOB '*[^0-9]*'),
	CONSTRAINT "persons_mobile2_10_digits" CHECK("persons"."mobile_2" = '' OR (length("persons"."mobile_2") = 10 AND "persons"."mobile_2" NOT GLOB '*[^0-9]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `persons_user_id_unique` ON `persons` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_persons_mobile` ON `persons` (`mobile`);--> statement-breakpoint
CREATE TABLE `site_membership` (
	`person_id` integer NOT NULL,
	`site_id` integer NOT NULL,
	PRIMARY KEY(`person_id`, `site_id`),
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_membership_site` ON `site_membership` (`site_id`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_site_access` (
	`user_id` integer NOT NULL,
	`site_id` integer NOT NULL,
	PRIMARY KEY(`user_id`, `site_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_usa_site` ON `user_site_access` (`site_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`mobile` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'regular' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "users_mobile_10_digits" CHECK(length("users"."mobile") = 10 AND "users"."mobile" NOT GLOB '*[^0-9]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_mobile_unique` ON `users` (`mobile`);