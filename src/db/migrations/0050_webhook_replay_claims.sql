CREATE TABLE "webhook_replay_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"producer" varchar(80) NOT NULL,
	"delivery_key_hash" varchar(64) NOT NULL,
	"payload_sha256" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'claimed' NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_replay_claims_producer_key_uidx" ON "webhook_replay_claims" USING btree ("producer","delivery_key_hash");
--> statement-breakpoint
CREATE INDEX "webhook_replay_claims_expires_idx" ON "webhook_replay_claims" USING btree ("expires_at");
