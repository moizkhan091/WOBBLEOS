CREATE TABLE "social_strategies" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" varchar(24) DEFAULT 'multi' NOT NULL,
	"niche" text NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"strategy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "social_strategies_status_idx" ON "social_strategies" USING btree ("status");