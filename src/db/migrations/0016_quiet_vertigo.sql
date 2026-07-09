CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text,
	"opportunity_id" text,
	"audit_id" text,
	"title" text NOT NULL,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope" text,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricing_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"terms" text,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" varchar(120),
	"approved_by" varchar(120),
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"rejected_reason" text,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "proposals_status_idx" ON "proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "proposals_company_idx" ON "proposals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "proposals_opportunity_idx" ON "proposals" USING btree ("opportunity_id");