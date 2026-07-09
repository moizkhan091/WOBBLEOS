-- 0007 — migration-history reconciliation (deploy safety).
--
-- WHY: taste_profiles / feedback_events were created idempotently by 0006, and the
-- intelligence_items columns (metrics/extracted/relations) exist in live databases,
-- but drizzle's snapshots had drifted so these were re-emitted here. Critically, the
-- three intelligence_items columns are NOT created by any earlier migration SQL, so a
-- from-scratch rebuild (e.g. a VPS deploy) would previously produce a broken
-- intelligence_items table. This migration closes that gap.
--
-- Every statement uses IF NOT EXISTS so it is a safe no-op on databases that already
-- have these objects, and correctly creates them on a fresh build. Nothing destructive.

CREATE TABLE IF NOT EXISTS "feedback_events" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" text NOT NULL,
	"decision" varchar(32) NOT NULL,
	"reason_category" varchar(80),
	"reason" text,
	"actor" varchar(120) NOT NULL,
	"founder_id" varchar(120),
	"client_id" text,
	"project_id" text,
	"output_type" varchar(120),
	"module" varchar(80),
	"agent_slug" varchar(120),
	"source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_bank_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signal_strength" numeric(6, 4) DEFAULT '1' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taste_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_key" varchar(160) NOT NULL,
	"scope" varchar(40) NOT NULL,
	"subject_id" text,
	"label" varchar(180) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"hard_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preference_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"positive_signals" integer DEFAULT 0 NOT NULL,
	"negative_signals" integer DEFAULT 0 NOT NULL,
	"confidence" numeric(5, 4) DEFAULT '0' NOT NULL,
	"last_feedback_at" timestamp with time zone,
	"provenance_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelligence_items" ADD COLUMN IF NOT EXISTS "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "intelligence_items" ADD COLUMN IF NOT EXISTS "extracted" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "intelligence_items" ADD COLUMN IF NOT EXISTS "relations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_events_target_idx" ON "feedback_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_events_actor_idx" ON "feedback_events" USING btree ("actor");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_events_module_idx" ON "feedback_events" USING btree ("module");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_events_agent_slug_idx" ON "feedback_events" USING btree ("agent_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_events_created_at_idx" ON "feedback_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "taste_profiles_profile_key_unique" ON "taste_profiles" USING btree ("profile_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taste_profiles_scope_idx" ON "taste_profiles" USING btree ("scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taste_profiles_subject_idx" ON "taste_profiles" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taste_profiles_status_idx" ON "taste_profiles" USING btree ("status");
