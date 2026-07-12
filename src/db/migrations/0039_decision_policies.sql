CREATE TABLE "decision_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" varchar(16) NOT NULL,
	"scope_id" varchar(200) NOT NULL,
	"category" varchar(120) NOT NULL,
	"direction" text NOT NULL,
	"statement" text NOT NULL,
	"status" varchar(16) DEFAULT 'proposed' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"repetition_count" integer DEFAULT 0 NOT NULL,
	"agreement_ratio" numeric(4, 3) DEFAULT '0' NOT NULL,
	"contested" boolean DEFAULT false NOT NULL,
	"dissent_count" integer DEFAULT 0 NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"supersedes" text,
	"origin" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "decision_policies_live_natural_uidx" ON "decision_policies" USING btree ("scope","scope_id","category","direction") WHERE status in ('proposed','active');--> statement-breakpoint
CREATE INDEX "decision_policies_scope_idx" ON "decision_policies" USING btree ("scope","scope_id","category");--> statement-breakpoint
CREATE INDEX "decision_policies_status_idx" ON "decision_policies" USING btree ("status");