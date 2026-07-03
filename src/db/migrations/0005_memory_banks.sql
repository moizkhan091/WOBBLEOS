CREATE TABLE "memory_bank_links" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_bank_slug" varchar(120) NOT NULL,
	"memory_record_id" text,
	"memory_chunk_id" text,
	"source_id" text,
	"proposal_id" text,
	"link_type" varchar(40) DEFAULT 'membership' NOT NULL,
	"created_by" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_banks" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"label" varchar(160) NOT NULL,
	"scope" varchar(40) NOT NULL,
	"purpose" text NOT NULL,
	"description" text NOT NULL,
	"default_tier" varchar(32) NOT NULL,
	"allowed_trust_levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_scope" varchar(40),
	"owner_id" text,
	"parent_slug" varchar(120),
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD COLUMN "bank_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "bank_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_update_proposals" ADD COLUMN "source_intake_run_id" text;--> statement-breakpoint
ALTER TABLE "memory_update_proposals" ADD COLUMN "knowledge_type" varchar(80);--> statement-breakpoint
ALTER TABLE "memory_update_proposals" ADD COLUMN "suggested_bank_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_update_proposals" ADD COLUMN "approved_bank_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_update_proposals" ADD COLUMN "router_reason" text;--> statement-breakpoint
ALTER TABLE "memory_update_proposals" ADD COLUMN "router_confidence" numeric;--> statement-breakpoint
ALTER TABLE "memory_update_proposals" ADD COLUMN "rejected_reason" text;--> statement-breakpoint
CREATE INDEX "memory_bank_links_bank_slug_idx" ON "memory_bank_links" USING btree ("memory_bank_slug");--> statement-breakpoint
CREATE INDEX "memory_bank_links_record_id_idx" ON "memory_bank_links" USING btree ("memory_record_id");--> statement-breakpoint
CREATE INDEX "memory_bank_links_chunk_id_idx" ON "memory_bank_links" USING btree ("memory_chunk_id");--> statement-breakpoint
CREATE INDEX "memory_bank_links_source_id_idx" ON "memory_bank_links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "memory_bank_links_proposal_id_idx" ON "memory_bank_links" USING btree ("proposal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_banks_slug_unique" ON "memory_banks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "memory_banks_scope_idx" ON "memory_banks" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "memory_banks_status_idx" ON "memory_banks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_banks_parent_slug_idx" ON "memory_banks" USING btree ("parent_slug");