CREATE TABLE "content_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" varchar(40) DEFAULT 'image' NOT NULL,
	"caption" text,
	"media_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_scope" varchar(40) DEFAULT 'company' NOT NULL,
	"owner_id" text,
	"source_type" varchar(40) DEFAULT 'imported' NOT NULL,
	"source_packet_id" text,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"platform" varchar(40) NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'scheduled' NOT NULL,
	"publisher" varchar(40) DEFAULT 'manual' NOT NULL,
	"publisher_ref" text,
	"published_at" timestamp with time zone,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "content_assets_status_idx" ON "content_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_assets_kind_idx" ON "content_assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "content_assets_source_packet_idx" ON "content_assets" USING btree ("source_packet_id");--> statement-breakpoint
CREATE INDEX "scheduled_posts_status_idx" ON "scheduled_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_posts_scheduled_at_idx" ON "scheduled_posts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "scheduled_posts_asset_id_idx" ON "scheduled_posts" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "scheduled_posts_platform_idx" ON "scheduled_posts" USING btree ("platform");