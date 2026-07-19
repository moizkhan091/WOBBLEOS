CREATE TABLE "lead_magnets" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"magnet_type" varchar(24) NOT NULL,
	"audience" text NOT NULL,
	"promise" text NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliverable" text,
	"usable_outcome" boolean DEFAULT true NOT NULL,
	"status" varchar(16) DEFAULT 'pending_review' NOT NULL,
	"pillar" varchar(40),
	"topic_id" text,
	"reviewed_by" varchar(120),
	"reviewed_at" timestamp with time zone,
	"created_by_agent" varchar(120),
	"model" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lead_magnets_status_idx" ON "lead_magnets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_magnets_type_idx" ON "lead_magnets" USING btree ("magnet_type");