CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"purpose" text NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"orchestrator_agent_slug" varchar(120),
	"deterministic_services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"io" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"events" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"governance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kpis" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"degraded_behaviour" text,
	"health_status" varchar(32) DEFAULT 'unknown' NOT NULL,
	"owner" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "departments_slug_unique" ON "departments" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "departments_status_idx" ON "departments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "departments_health_idx" ON "departments" USING btree ("health_status");