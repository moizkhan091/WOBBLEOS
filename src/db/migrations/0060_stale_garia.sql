CREATE TABLE "content_intelligence_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" varchar(12) DEFAULT 'manual' NOT NULL,
	"status" varchar(12) DEFAULT 'running' NOT NULL,
	"objective" text NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"topic_count" integer DEFAULT 0 NOT NULL,
	"model" varchar(120),
	"requested_by" varchar(120) NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_intelligence_runs_status_idx" ON "content_intelligence_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_intelligence_runs_created_idx" ON "content_intelligence_runs" USING btree ("created_at");