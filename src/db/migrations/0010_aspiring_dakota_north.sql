CREATE TABLE "memory_conflicts" (
	"id" text PRIMARY KEY NOT NULL,
	"new_record_id" text NOT NULL,
	"existing_record_id" text NOT NULL,
	"bank_slug" varchar(120),
	"similarity" numeric,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"resolution" varchar(32),
	"detected_by" varchar(120),
	"resolved_by" varchar(120),
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "review_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "memory_conflicts_status_idx" ON "memory_conflicts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_conflicts_new_record_idx" ON "memory_conflicts" USING btree ("new_record_id");