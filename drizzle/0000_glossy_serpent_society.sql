CREATE TYPE "public"."audit_source" AS ENUM('web', 'mcp', 'system');--> statement-breakpoint
CREATE TYPE "public"."budget_period" AS ENUM('task', 'daily', 'weekly', 'monthly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."budget_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ownership_status" AS ENUM('unverified', 'verified', 'managed');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('arc', 'circle_gateway', 'x402', 'demo');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."risk_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('open', 'investigating', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('idle', 'syncing', 'ready', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'running', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wallet_source" AS ENUM('manual', 'metamask', 'circle_user_controlled', 'circle_agent', 'external');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'operator', 'viewer');--> statement-breakpoint
CREATE TABLE "analysis_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid,
	"range_start" timestamp with time zone NOT NULL,
	"range_end" timestamp with time zone NOT NULL,
	"version" text NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_range_valid" CHECK ("analysis_snapshots"."range_end" >= "analysis_snapshots"."range_start")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"source" "audit_source" NOT NULL,
	"idempotency_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid,
	"task_id" uuid,
	"provider_id" text,
	"period_type" "budget_period" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount" numeric(38, 6) NOT NULL,
	"currency" text DEFAULT 'USDC' NOT NULL,
	"warning_threshold" numeric(5, 2) DEFAULT '80' NOT NULL,
	"hard_limit_requested" boolean DEFAULT false NOT NULL,
	"status" "budget_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_amount_positive" CHECK ("budgets"."amount" > 0),
	CONSTRAINT "budget_period_valid" CHECK ("budgets"."period_end" > "budgets"."period_start"),
	CONSTRAINT "budget_warning_threshold_valid" CHECK ("budgets"."warning_threshold" > 0 and "budgets"."warning_threshold" <= 100)
);
--> statement-breakpoint
CREATE TABLE "chain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"transaction_hash" text NOT NULL,
	"event_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text,
	"contract_address" text NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "idempotency_status" DEFAULT 'processing' NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"wallet_address" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"task_id" uuid,
	"chain_event_id" uuid,
	"external_id" text NOT NULL,
	"transaction_hash" text,
	"amount" numeric(38, 6) NOT NULL,
	"currency" text DEFAULT 'USDC' NOT NULL,
	"provider_id" text,
	"provider_name" text,
	"category" text,
	"resource_uri" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" "payment_source" NOT NULL,
	"raw_reference" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("payment_events"."amount" > 0),
	CONSTRAINT "payment_currency_usdc" CHECK ("payment_events"."currency" = 'USDC')
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid,
	"task_id" uuid,
	"analysis_snapshot_id" uuid,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"content" jsonb,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"error_code" text,
	"generated_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_signals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid,
	"task_id" uuid,
	"analysis_snapshot_id" uuid,
	"rule_id" text NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"status" "risk_status" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"source" "payment_source" NOT NULL,
	"cursor" text,
	"status" "sync_status" DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"last_attempted_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid,
	"external_key" text,
	"name" text NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"email" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"address" text NOT NULL,
	"normalized_address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"source" "wallet_source" NOT NULL,
	"label" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"ownership_status" "ownership_status" DEFAULT 'unverified' NOT NULL,
	"capabilities" jsonb NOT NULL,
	"external_provider" text,
	"external_wallet_id" text,
	"sync_status" "sync_status" DEFAULT 'idle' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_normalized_address_lowercase" CHECK ("wallets"."normalized_address" = lower("wallets"."normalized_address"))
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_accounts" ADD CONSTRAINT "identity_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_chain_event_id_chain_events_id_fk" FOREIGN KEY ("chain_event_id") REFERENCES "public"."chain_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_analysis_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("analysis_snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_analysis_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("analysis_snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_workspace_input_version_unique" ON "analysis_snapshots" USING btree ("workspace_id","input_hash","version");--> statement-breakpoint
CREATE INDEX "analysis_workspace_calculated_idx" ON "analysis_snapshots" USING btree ("workspace_id","calculated_at");--> statement-breakpoint
CREATE INDEX "audit_workspace_created_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "budget_workspace_period_idx" ON "budgets" USING btree ("workspace_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_event_identity_unique" ON "chain_events" USING btree ("chain_id","transaction_hash","event_index");--> statement-breakpoint
CREATE INDEX "chain_event_block_idx" ON "chain_events" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_workspace_operation_key_unique" ON "idempotency_keys" USING btree ("workspace_id","operation","key");--> statement-breakpoint
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_provider_subject_unique" ON "identity_accounts" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "identity_user_idx" ON "identity_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_workspace_source_external_unique" ON "payment_events" USING btree ("workspace_id","source","external_id");--> statement-breakpoint
CREATE INDEX "payment_workspace_occurred_idx" ON "payment_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "payment_wallet_occurred_idx" ON "payment_events" USING btree ("wallet_id","occurred_at");--> statement-breakpoint
CREATE INDEX "payment_task_idx" ON "payment_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "report_workspace_created_idx" ON "reports" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "risk_workspace_status_idx" ON "risk_signals" USING btree ("workspace_id","status","detected_at");--> statement-breakpoint
CREATE INDEX "risk_wallet_idx" ON "risk_signals" USING btree ("wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_cursor_wallet_source_unique" ON "sync_cursors" USING btree ("wallet_id","source");--> statement-breakpoint
CREATE INDEX "sync_cursor_workspace_idx" ON "sync_cursors" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_workspace_external_key_unique" ON "tasks" USING btree ("workspace_id","external_key");--> statement-breakpoint
CREATE INDEX "task_workspace_idx" ON "tasks" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_workspace_chain_address_unique" ON "wallets" USING btree ("workspace_id","chain_id","normalized_address");--> statement-breakpoint
CREATE INDEX "wallet_workspace_idx" ON "wallets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_member_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_owner_idx" ON "workspaces" USING btree ("owner_id");