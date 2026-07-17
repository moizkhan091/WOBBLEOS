CREATE TABLE "external_provider_spend" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" varchar(40) NOT NULL,
	"item" varchar(160) NOT NULL,
	"model" varchar(120),
	"estimated_max_cost" numeric NOT NULL,
	"actual_cost" numeric NOT NULL,
	"unit" varchar(16) NOT NULL,
	"tokens" integer,
	"latency_ms" integer,
	"result" varchar(24) NOT NULL,
	"actor" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "external_provider_spend_provider_idx" ON "external_provider_spend" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "external_provider_spend_created_idx" ON "external_provider_spend" USING btree ("created_at");