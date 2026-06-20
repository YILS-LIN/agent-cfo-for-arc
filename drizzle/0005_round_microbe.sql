CREATE TYPE "public"."provider_policy_decision" AS ENUM('allowed', 'review', 'blocked');--> statement-breakpoint
CREATE TABLE "provider_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider_key" text NOT NULL,
	"display_name" text NOT NULL,
	"decision" "provider_policy_decision" DEFAULT 'review' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_policies" ADD CONSTRAINT "provider_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_policies" ADD CONSTRAINT "provider_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_policy_workspace_key_unique" ON "provider_policies" USING btree ("workspace_id","provider_key");--> statement-breakpoint
CREATE INDEX "provider_policy_workspace_decision_idx" ON "provider_policies" USING btree ("workspace_id","decision");