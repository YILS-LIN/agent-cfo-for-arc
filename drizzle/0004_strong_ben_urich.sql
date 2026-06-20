ALTER TABLE "sync_cursors" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "sync_cursors" ADD COLUMN "lease_expires_at" timestamp with time zone;