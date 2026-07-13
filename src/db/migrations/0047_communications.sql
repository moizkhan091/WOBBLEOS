CREATE TABLE "communications" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" varchar(40) NOT NULL,
	"kind" varchar(60) NOT NULL,
	"subject" varchar(300) NOT NULL,
	"body" text NOT NULL,
	"audience" varchar(200),
	"status" varchar(24) DEFAULT 'prepared' NOT NULL,
	"risk_level" varchar(16) DEFAULT 'low' NOT NULL,
	"scope_type" varchar(16) DEFAULT 'company' NOT NULL,
	"company_id" varchar(120),
	"client_id" varchar(120),
	"project_id" varchar(120),
	"related_entity_type" varchar(40),
	"related_entity_id" varchar(120),
	"autonomy_level" varchar(16),
	"autonomy_policy_id" varchar(120),
	"acted_autonomously" boolean DEFAULT false NOT NULL,
	"prepared_by" varchar(120) NOT NULL,
	"sent_by" varchar(120),
	"dedupe_key" varchar(200),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "communications_status_idx" ON "communications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communications_channel_idx" ON "communications" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "communications_scope_idx" ON "communications" USING btree ("scope_type","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "communications_dedupe_uidx" ON "communications" USING btree ("dedupe_key") WHERE dedupe_key is not null;