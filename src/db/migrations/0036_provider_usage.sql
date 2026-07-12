CREATE TABLE "provider_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_request_id" varchar(200) NOT NULL,
	"provider" varchar(80) NOT NULL,
	"model" varchar(160) NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"cached_output_tokens" integer,
	"reasoning_tokens" integer,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"provider_reported_cost_usd" numeric(12, 6),
	"calculated_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"credits_consumed" numeric(14, 6),
	"latency_ms" integer,
	"status" varchar(16) DEFAULT 'succeeded' NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"estimation_status" varchar(16) DEFAULT 'estimated' NOT NULL,
	"verification_status" varchar(16) DEFAULT 'unverified' NOT NULL,
	"workflow_id" text,
	"task_id" varchar(160),
	"handoff_id" text,
	"department_slug" varchar(120),
	"agent_slug" varchar(120),
	"company_id" varchar(120),
	"client_workspace_id" varchar(120),
	"role" varchar(80),
	"module" varchar(80),
	"model_run_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "provider_usage_request_uidx" ON "provider_usage" USING btree ("provider_request_id","attempt");--> statement-breakpoint
CREATE INDEX "provider_usage_unit_idx" ON "provider_usage" USING btree ("department_slug","workflow_id","task_id");--> statement-breakpoint
CREATE INDEX "provider_usage_created_idx" ON "provider_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "provider_usage_client_idx" ON "provider_usage" USING btree ("client_workspace_id");