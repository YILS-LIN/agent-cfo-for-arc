CREATE TYPE "public"."transaction_intent_status" AS ENUM('pending_approval', 'approved', 'submitted', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "transaction_intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"task_id" uuid,
	"chain_id" integer NOT NULL,
	"recipient_address" text NOT NULL,
	"amount" numeric(38, 6) NOT NULL,
	"currency" text DEFAULT 'USDC' NOT NULL,
	"reason" text NOT NULL,
	"status" "transaction_intent_status" DEFAULT 'pending_approval' NOT NULL,
	"risk_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"transaction_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_intent_amount_positive" CHECK ("transaction_intents"."amount" > 0),
	CONSTRAINT "transaction_intent_currency_usdc" CHECK ("transaction_intents"."currency" = 'USDC'),
	CONSTRAINT "transaction_intent_expiry_valid" CHECK ("transaction_intents"."expires_at" > "transaction_intents"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "budget_workspace_id_unique" ON "budgets" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "transaction_intents" ADD CONSTRAINT "transaction_intents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_intents" ADD CONSTRAINT "transaction_intents_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_intents" ADD CONSTRAINT "transaction_intents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_intents" ADD CONSTRAINT "transaction_intent_workspace_wallet_fk" FOREIGN KEY ("workspace_id","wallet_id") REFERENCES "public"."wallets"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_intents" ADD CONSTRAINT "transaction_intent_workspace_budget_fk" FOREIGN KEY ("workspace_id","budget_id") REFERENCES "public"."budgets"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_intents" ADD CONSTRAINT "transaction_intent_workspace_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_intent_workspace_status_idx" ON "transaction_intents" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "transaction_intent_wallet_created_idx" ON "transaction_intents" USING btree ("wallet_id","created_at");
