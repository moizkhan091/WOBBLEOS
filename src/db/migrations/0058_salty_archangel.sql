CREATE TABLE "meeting_intelligence" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"company_id" text,
	"kind" varchar(24) NOT NULL,
	"content" text NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"source_snippet" text NOT NULL,
	"status" varchar(16) DEFAULT 'pending_review' NOT NULL,
	"reviewed_by" varchar(120),
	"reviewed_at" timestamp with time zone,
	"model" varchar(120),
	"created_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meeting_intelligence_meeting_idx" ON "meeting_intelligence" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_intelligence_status_idx" ON "meeting_intelligence" USING btree ("status");