CREATE TABLE "radar_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"focus" text NOT NULL,
	"status" varchar(16) DEFAULT 'new' NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "radar_scans_status_idx" ON "radar_scans" USING btree ("status");