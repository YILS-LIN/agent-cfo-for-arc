CREATE TABLE "budget_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"actor_user_id" uuid,
	"source" "audit_source" NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_revision_budget_version_unique" ON "budget_revisions" USING btree ("budget_id","version");--> statement-breakpoint
CREATE INDEX "budget_revision_workspace_budget_idx" ON "budget_revisions" USING btree ("workspace_id","budget_id");