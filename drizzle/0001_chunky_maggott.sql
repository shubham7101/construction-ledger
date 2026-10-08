CREATE INDEX `idx_expense_category_date` ON `expenses` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_ledger_category_date` ON `ledger_entries` (`category_id`,`date`);