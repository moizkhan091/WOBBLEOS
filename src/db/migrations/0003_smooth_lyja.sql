CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"role" varchar(80) NOT NULL,
	"module" varchar(80) NOT NULL,
	"team" varchar(80),
	"purpose" text NOT NULL,
	"input_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_banks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_role" varchar(80),
	"cost_profile" varchar(40) DEFAULT 'mid' NOT NULL,
	"cadence" varchar(40) DEFAULT 'manual' NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"quality_score" numeric(5, 2),
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"agent_slug" varchar(120) NOT NULL,
	"job_id" text,
	"status" varchar(32) DEFAULT 'running' NOT NULL,
	"input_summary" text,
	"output_summary" text,
	"model_run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ids_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_ids_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_estimate" numeric(12, 6),
	"latency_ms" integer,
	"quality_score" numeric(5, 2),
	"error" text,
	"owner_scope" varchar(40),
	"owner_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agents_slug_unique" ON "agents" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "agents_module_idx" ON "agents" USING btree ("module");
--> statement-breakpoint
CREATE INDEX "agents_team_idx" ON "agents" USING btree ("team");
--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "agent_runs_agent_id_idx" ON "agent_runs" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX "agent_runs_agent_slug_idx" ON "agent_runs" USING btree ("agent_slug");
--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "agent_runs_created_at_idx" ON "agent_runs" USING btree ("created_at");
