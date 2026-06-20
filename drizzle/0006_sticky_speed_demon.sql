CREATE TYPE "public"."credential_status" AS ENUM('unverified', 'valid', 'invalid');--> statement-breakpoint
CREATE TABLE "ai_provider_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"encryption_auth_tag" text NOT NULL,
	"encryption_key_id" text NOT NULL,
	"secret_hint" text NOT NULL,
	"status" "credential_status" DEFAULT 'unverified' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error_code" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credential_workspace_provider_unique" ON "ai_provider_credentials" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "ai_credential_workspace_status_idx" ON "ai_provider_credentials" USING btree ("workspace_id","status");