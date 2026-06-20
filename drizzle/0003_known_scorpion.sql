ALTER TABLE "risk_signals" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
DELETE FROM "risk_signals"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "workspace_id", "rule_id"
        ORDER BY "updated_at" DESC, "id" DESC
      ) AS "duplicate_rank"
    FROM "risk_signals"
  ) AS "ranked_risks"
  WHERE "duplicate_rank" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "risk_workspace_rule_unique" ON "risk_signals" USING btree ("workspace_id","rule_id");
