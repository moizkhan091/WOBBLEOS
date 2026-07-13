CREATE TABLE "media_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"prompt" text NOT NULL,
	"provider" varchar(40) DEFAULT 'fal' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"budget_cap_cents" integer DEFAULT 0 NOT NULL,
	"actual_cost_cents" integer,
	"output_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"scope_type" varchar(16) DEFAULT 'company' NOT NULL,
	"company_id" varchar(120),
	"client_id" varchar(120),
	"project_id" varchar(120),
	"requested_by" varchar(120) NOT NULL,
	"lease_owner" varchar(120),
	"lease_expires_at" timestamp with time zone,
	"dedupe_key" varchar(200),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "media_jobs_status_idx" ON "media_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "media_jobs_scope_idx" ON "media_jobs" USING btree ("scope_type","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_jobs_dedupe_uidx" ON "media_jobs" USING btree ("dedupe_key") WHERE dedupe_key is not null;