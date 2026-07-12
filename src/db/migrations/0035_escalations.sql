CREATE TABLE "escalations" (
	"id" text PRIMARY KEY NOT NULL,
	"department_slug" varchar(120) NOT NULL,
	"workflow_id" text,
	"task_id" varchar(160),
	"client_workspace_id" varchar(120),
	"source_agent" varchar(120),
	"reason" varchar(48) NOT NULL,
	"severity" varchar(16) DEFAULT 'medium' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempted_recoveries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_decision" text NOT NULL,
	"assignee" varchar(120),
	"sla_due_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolution_action" varchar(16),
	"resolved_by" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "escalations_open_dedup_uidx" ON "escalations" USING btree ("department_slug","workflow_id","task_id","reason") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "escalations_dept_status_idx" ON "escalations" USING btree ("department_slug","status");--> statement-breakpoint
CREATE INDEX "escalations_status_idx" ON "escalations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "escalations_created_idx" ON "escalations" USING btree ("created_at");