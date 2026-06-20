ALTER TABLE "analysis_snapshots" DROP CONSTRAINT "analysis_snapshots_wallet_id_wallets_id_fk";
--> statement-breakpoint
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_wallet_id_wallets_id_fk";
--> statement-breakpoint
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_task_id_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_events" DROP CONSTRAINT "payment_events_wallet_id_wallets_id_fk";
--> statement-breakpoint
ALTER TABLE "risk_signals" DROP CONSTRAINT "risk_signals_wallet_id_wallets_id_fk";
--> statement-breakpoint
ALTER TABLE "sync_cursors" DROP CONSTRAINT "sync_cursors_wallet_id_wallets_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_workspace_id_unique" ON "analysis_snapshots" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_workspace_id_unique" ON "tasks" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_workspace_id_unique" ON "wallets" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_workspace_wallet_fk" FOREIGN KEY ("workspace_id","wallet_id") REFERENCES "public"."wallets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budget_workspace_wallet_fk" FOREIGN KEY ("workspace_id","wallet_id") REFERENCES "public"."wallets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budget_workspace_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_workspace_wallet_fk" FOREIGN KEY ("workspace_id","wallet_id") REFERENCES "public"."wallets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_workspace_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "report_workspace_wallet_fk" FOREIGN KEY ("workspace_id","wallet_id") REFERENCES "public"."wallets"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "report_workspace_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "report_workspace_analysis_fk" FOREIGN KEY ("workspace_id","analysis_snapshot_id") REFERENCES "public"."analysis_snapshots"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_workspace_wallet_fk" FOREIGN KEY ("workspace_id","wallet_id") REFERENCES "public"."wallets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_workspace_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_workspace_analysis_fk" FOREIGN KEY ("workspace_id","analysis_snapshot_id") REFERENCES "public"."analysis_snapshots"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursor_workspace_wallet_fk" FOREIGN KEY ("workspace_id","wallet_id") REFERENCES "public"."wallets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "task_workspace_wallet_fk" FOREIGN KEY ("workspace_id","wallet_id") REFERENCES "public"."wallets"("workspace_id","id") ON DELETE no action ON UPDATE no action;
