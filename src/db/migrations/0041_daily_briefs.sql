CREATE TABLE "daily_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" varchar(16) NOT NULL,
	"scope_id" varchar(200),
	"cadence" varchar(16) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_empty" boolean DEFAULT true NOT NULL,
	"total_signals" integer DEFAULT 0 NOT NULL,
	"lowest_confidence" varchar(8),
	"degraded_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"omitted_signals" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"brief" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "daily_briefs_scope_generated_idx" ON "daily_briefs" USING btree ("scope_type","scope_id","generated_at");--> statement-breakpoint
CREATE INDEX "daily_briefs_generated_idx" ON "daily_briefs" USING btree ("generated_at");