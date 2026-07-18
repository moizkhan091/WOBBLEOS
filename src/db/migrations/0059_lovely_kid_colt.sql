CREATE TABLE "content_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"pillar" varchar(40) NOT NULL,
	"title" text NOT NULL,
	"angle" text NOT NULL,
	"teaching_job" text NOT NULL,
	"target_audience" text NOT NULL,
	"rationale" text NOT NULL,
	"funnel_stage" varchar(16) DEFAULT 'awareness' NOT NULL,
	"suggested_platform" varchar(16) DEFAULT 'instagram' NOT NULL,
	"suggested_format" varchar(24) DEFAULT 'carousel' NOT NULL,
	"freshness" varchar(16) DEFAULT 'evergreen' NOT NULL,
	"demand_keyword" text,
	"demand_volume" integer,
	"trend_velocity" numeric,
	"competitor_gap" integer DEFAULT 0 NOT NULL,
	"founder_job_value" integer DEFAULT 0 NOT NULL,
	"novelty_score" integer DEFAULT 0 NOT NULL,
	"proof_available" boolean DEFAULT false NOT NULL,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending_review' NOT NULL,
	"reviewed_by" varchar(120),
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"intelligence_run_id" text,
	"promoted_graph_run_id" text,
	"promoted_packet_id" text,
	"created_by_agent" varchar(120),
	"model" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_topics_status_idx" ON "content_topics" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_topics_pillar_idx" ON "content_topics" USING btree ("pillar");--> statement-breakpoint
CREATE INDEX "content_topics_run_idx" ON "content_topics" USING btree ("intelligence_run_id");--> statement-breakpoint
CREATE INDEX "content_topics_score_idx" ON "content_topics" USING btree ("overall_score");