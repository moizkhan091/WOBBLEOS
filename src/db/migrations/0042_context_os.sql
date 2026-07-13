CREATE TABLE "context_assertions" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"statement" text NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_type" varchar(16) NOT NULL,
	"scope_id" varchar(200) NOT NULL,
	"classification" varchar(32) DEFAULT 'internal' NOT NULL,
	"trust" numeric(4, 3) DEFAULT '0.5' NOT NULL,
	"status" varchar(16) DEFAULT 'extracted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes" text,
	"extracted_by_agent" varchar(120),
	"approved_by" varchar(120),
	"approved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_retrievals" (
	"id" text PRIMARY KEY NOT NULL,
	"scope_type" varchar(16) NOT NULL,
	"scope_id" varchar(200) NOT NULL,
	"task" varchar(80) NOT NULL,
	"agent_slug" varchar(120),
	"assertion_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" varchar(40) NOT NULL,
	"content" text NOT NULL,
	"scope_type" varchar(16) NOT NULL,
	"scope_id" varchar(200) NOT NULL,
	"classification" varchar(32) DEFAULT 'internal' NOT NULL,
	"imported_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "context_assertions_scope_status_idx" ON "context_assertions" USING btree ("scope_type","scope_id","status");--> statement-breakpoint
CREATE INDEX "context_assertions_source_idx" ON "context_assertions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "context_retrievals_scope_idx" ON "context_retrievals" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "context_retrievals_created_idx" ON "context_retrievals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "context_sources_scope_idx" ON "context_sources" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "context_sources_created_idx" ON "context_sources" USING btree ("created_at");