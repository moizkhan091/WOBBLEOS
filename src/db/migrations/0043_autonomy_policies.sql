CREATE TABLE "autonomy_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"category" varchar(80) NOT NULL,
	"granted_level" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"actor" varchar(120),
	"company_id" varchar(120),
	"client_id" varchar(120),
	"project_id" varchar(120),
	"max_risk_level" varchar(16),
	"max_financial_cents" integer,
	"requires_qa_pass" boolean DEFAULT false NOT NULL,
	"success_threshold" numeric(4, 3),
	"historical_sample_size" integer,
	"approved_by" varchar(120) NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "autonomy_policies_category_status_idx" ON "autonomy_policies" USING btree ("category","status");