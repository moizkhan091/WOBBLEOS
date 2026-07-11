CREATE TABLE "approval_effects" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"effect_type" varchar(64) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" varchar(32) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"run_after" timestamp with time zone,
	"last_error" text,
	"actor" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "approval_effects_approval_type_uidx" ON "approval_effects" USING btree ("approval_id","effect_type");--> statement-breakpoint
CREATE INDEX "approval_effects_state_idx" ON "approval_effects" USING btree ("state");--> statement-breakpoint
CREATE INDEX "approval_effects_created_at_idx" ON "approval_effects" USING btree ("created_at");