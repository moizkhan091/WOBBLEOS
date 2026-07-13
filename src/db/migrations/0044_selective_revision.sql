CREATE TABLE "revision_component_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" varchar(60) NOT NULL,
	"component_key" varchar(120) NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot_reason" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_components" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" varchar(60) NOT NULL,
	"component_key" varchar(120) NOT NULL,
	"kind" varchar(60) NOT NULL,
	"produced_by" varchar(120) NOT NULL,
	"depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'approved' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_kind" varchar(40) NOT NULL,
	"artifact_ref" varchar(200) NOT NULL,
	"graph_run_id" varchar(200),
	"status" varchar(24) DEFAULT 'planned' NOT NULL,
	"triggered_by" varchar(120) NOT NULL,
	"failed_components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"company_id" varchar(120),
	"client_id" varchar(120),
	"created_by" varchar(120),
	"applied_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "revision_component_versions_cycle_idx" ON "revision_component_versions" USING btree ("cycle_id","component_key");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_components_cycle_key_uq" ON "revision_components" USING btree ("cycle_id","component_key");--> statement-breakpoint
CREATE INDEX "revision_cycles_artifact_idx" ON "revision_cycles" USING btree ("artifact_kind","artifact_ref");--> statement-breakpoint
CREATE INDEX "revision_cycles_status_idx" ON "revision_cycles" USING btree ("status");