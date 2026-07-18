CREATE TABLE "offer_validation_dimensions" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"dimension" varchar(60) NOT NULL,
	"agent_slug" varchar(80) NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"weight" numeric(4, 2) DEFAULT '1' NOT NULL,
	"rationale" text NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_validation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"verdict" varchar(12) NOT NULL,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"model" varchar(120),
	"created_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "offer_validation_dimensions_run_idx" ON "offer_validation_dimensions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "offer_validation_runs_offer_idx" ON "offer_validation_runs" USING btree ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_validation_runs_offer_version_uq" ON "offer_validation_runs" USING btree ("offer_id","version");