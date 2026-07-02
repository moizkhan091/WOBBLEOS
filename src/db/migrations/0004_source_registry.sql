CREATE TABLE "source_intake_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_type" varchar(80) NOT NULL,
	"handler_slug" varchar(120) NOT NULL,
	"trigger" varchar(40) DEFAULT 'manual' NOT NULL,
	"status" varchar(40) DEFAULT 'queued' NOT NULL,
	"tool" varchar(120),
	"agent_run_id" text,
	"job_id" text,
	"raw_payload_ref" text,
	"extracted_insight_id" text,
	"cost_estimate" numeric,
	"actual_cost" numeric,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_type_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"label" varchar(140) NOT NULL,
	"category" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"required_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"optional_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_connected_agents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_memory_banks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_refresh_frequency" varchar(40) DEFAULT 'manual' NOT NULL,
	"supports_url" boolean DEFAULT false NOT NULL,
	"supports_file" boolean DEFAULT false NOT NULL,
	"requires_transcript" boolean DEFAULT false NOT NULL,
	"requires_vision" boolean DEFAULT false NOT NULL,
	"supports_scrape" boolean DEFAULT false NOT NULL,
	"intake_handler_slug" varchar(120) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "owner_scope" varchar(64) DEFAULT 'company' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "intended_use" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "connected_agents" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "refresh_frequency" varchar(40) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_scraped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "processing_status" varchar(40) DEFAULT 'pending_approval' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "confidence" numeric;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "cost_used" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "memory_banks_fed" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "related_output_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "extracted_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "source_intake_runs_source_id_idx" ON "source_intake_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_intake_runs_status_idx" ON "source_intake_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_intake_runs_handler_slug_idx" ON "source_intake_runs" USING btree ("handler_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "source_type_definitions_slug_unique" ON "source_type_definitions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "source_type_definitions_category_idx" ON "source_type_definitions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "source_type_definitions_status_idx" ON "source_type_definitions" USING btree ("status");