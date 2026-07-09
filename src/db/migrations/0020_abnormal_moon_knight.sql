CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"context" text,
	"category" varchar(40) DEFAULT 'strategy' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_option_id" text,
	"decision_rationale" text,
	"reasoning_trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"owner" varchar(120),
	"company_id" text,
	"opportunity_id" text,
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"audience" text,
	"promise" text,
	"price_model" varchar(40),
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"experiments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"result_notes" text,
	"owner" varchar(120),
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "decisions_status_idx" ON "decisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "decisions_category_idx" ON "decisions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "offers_status_idx" ON "offers" USING btree ("status");