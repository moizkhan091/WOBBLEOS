CREATE TABLE "audits" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" varchar(16) DEFAULT 'free' NOT NULL,
	"company_id" text,
	"opportunity_id" text,
	"business_name" text NOT NULL,
	"status" varchar(24) DEFAULT 'complete' NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audits_kind_idx" ON "audits" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "audits_company_idx" ON "audits" USING btree ("company_id");