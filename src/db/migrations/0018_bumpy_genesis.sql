CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"meeting_type" varchar(40) DEFAULT 'ai_readiness_call' NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"timezone" varchar(60),
	"organizer" varchar(120),
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"company_id" text,
	"contact_id" text,
	"opportunity_id" text,
	"location" text,
	"status" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"outcome" text,
	"notes" text,
	"follow_up_required" boolean DEFAULT false NOT NULL,
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"task_type" varchar(40) DEFAULT 'internal_admin' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"status" varchar(24) DEFAULT 'not_started' NOT NULL,
	"assigned_to" varchar(120),
	"assigned_by" varchar(120),
	"company_id" text,
	"contact_id" text,
	"opportunity_id" text,
	"proposal_id" text,
	"invoice_id" text,
	"due_date" timestamp with time zone,
	"reminder_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meetings_start_idx" ON "meetings" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "meetings_company_idx" ON "meetings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_assigned_idx" ON "tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "tasks_company_idx" ON "tasks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");