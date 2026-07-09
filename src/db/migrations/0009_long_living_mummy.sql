CREATE TABLE "memory_record_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_record_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"edited_by" varchar(120),
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "category" varchar(40) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "surface" varchar(120);--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "purge_after" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "memory_record_versions_record_id_idx" ON "memory_record_versions" USING btree ("memory_record_id");--> statement-breakpoint
CREATE INDEX "audit_logs_category_idx" ON "audit_logs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_logs_event_type_idx" ON "audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");