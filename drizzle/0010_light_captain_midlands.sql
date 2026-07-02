CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text,
	"redirect_uris" jsonb NOT NULL,
	"grant_types" jsonb NOT NULL,
	"response_types" jsonb NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'none' NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_client_id_unique" ON "oauth_clients" USING btree ("client_id");