CREATE TABLE "automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" varchar(20) DEFAULT 'manual' NOT NULL,
	"trigger_event" varchar(80),
	"schedule" varchar(60),
	"action_queue" varchar(60) DEFAULT 'general' NOT NULL,
	"action_type" varchar(80) NOT NULL,
	"action_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" varchar(20),
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "automation_rules_enabled_idx" ON "automation_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "automation_rules_trigger_idx" ON "automation_rules" USING btree ("trigger_event");