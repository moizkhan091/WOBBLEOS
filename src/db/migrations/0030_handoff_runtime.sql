CREATE TABLE "handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" varchar(200) NOT NULL,
	"task_id" varchar(120) NOT NULL,
	"parent_task_id" varchar(120),
	"correlation_id" varchar(200) NOT NULL,
	"causation_id" varchar(120),
	"department" varchar(64) NOT NULL,
	"source_agent" varchar(120) NOT NULL,
	"destination_agent" varchar(120),
	"destination_capability" varchar(120),
	"company_id" text,
	"client_workspace_id" text,
	"project_id" text,
	"lead_id" text,
	"actor" varchar(120) NOT NULL,
	"data_classification" varchar(40) DEFAULT 'internal' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"envelope" jsonb NOT NULL,
	"delivery_state" varchar(32) DEFAULT 'delivered' NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"lease_owner" varchar(120),
	"lease_expires_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone,
	"failure_reason" text,
	"cost_estimate" numeric(12, 6),
	"latency_ms" integer,
	"quality_score" numeric(5, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "handoffs_workflow_key_uidx" ON "handoffs" USING btree ("workflow_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "handoffs_workflow_idx" ON "handoffs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "handoffs_correlation_idx" ON "handoffs" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "handoffs_state_idx" ON "handoffs" USING btree ("delivery_state");--> statement-breakpoint
CREATE INDEX "handoffs_destination_idx" ON "handoffs" USING btree ("destination_agent");--> statement-breakpoint
CREATE INDEX "handoffs_created_at_idx" ON "handoffs" USING btree ("created_at");