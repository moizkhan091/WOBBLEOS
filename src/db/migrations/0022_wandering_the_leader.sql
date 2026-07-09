CREATE TABLE "seo_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"audience" text,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"pillar" text,
	"target_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blog_ideas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "seo_plans_status_idx" ON "seo_plans" USING btree ("status");