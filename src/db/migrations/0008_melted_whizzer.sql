CREATE TABLE "conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" varchar(32) NOT NULL,
	"content" text,
	"tool_name" varchar(120),
	"model_run_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"founder_id" varchar(120),
	"founder_name" varchar(120),
	"surface" varchar(80) DEFAULT 'ask_wobble' NOT NULL,
	"scope" varchar(40) DEFAULT 'founder' NOT NULL,
	"client_id" text,
	"project_id" text,
	"title" text,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"harvest_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"harvested_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_id_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_founder_id_idx" ON "conversations" USING btree ("founder_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversations_harvest_status_idx" ON "conversations" USING btree ("harvest_status");--> statement-breakpoint
CREATE INDEX "conversations_surface_idx" ON "conversations" USING btree ("surface");