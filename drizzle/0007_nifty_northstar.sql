CREATE TABLE "rate_limit_counters" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_counters_scope_key_hash_window_start_pk" PRIMARY KEY("scope","key_hash","window_start"),
	CONSTRAINT "rate_limit_count_positive" CHECK ("rate_limit_counters"."count" > 0)
);
--> statement-breakpoint
CREATE INDEX "rate_limit_expiry_idx" ON "rate_limit_counters" USING btree ("expires_at");