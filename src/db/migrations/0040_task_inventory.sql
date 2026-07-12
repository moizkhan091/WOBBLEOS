CREATE TABLE "task_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"task" text NOT NULL,
	"owner" varchar(120) NOT NULL,
	"department" varchar(120) NOT NULL,
	"frequency" jsonb NOT NULL,
	"baseline_minutes" numeric(10, 2) DEFAULT '0' NOT NULL,
	"current_minutes" numeric(10, 2) DEFAULT '0' NOT NULL,
	"automation_state" varchar(16) NOT NULL,
	"human_review_minutes" numeric(10, 2) DEFAULT '0' NOT NULL,
	"evidence_source" varchar(24) NOT NULL,
	"confidence" varchar(8) DEFAULT 'low' NOT NULL,
	"completed_count" integer,
	"client_id" varchar(120),
	"project_id" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "task_inventory_department_idx" ON "task_inventory" USING btree ("department");--> statement-breakpoint
CREATE INDEX "task_inventory_client_idx" ON "task_inventory" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "task_inventory_project_idx" ON "task_inventory" USING btree ("project_id");