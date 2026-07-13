CREATE TABLE "improvement_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" varchar(120),
	"pattern" text NOT NULL,
	"hypothesis" text NOT NULL,
	"target_type" varchar(24) NOT NULL,
	"target_ref" varchar(200),
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_value" numeric(6, 2) DEFAULT '0' NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"risk_level" varchar(16) DEFAULT 'low' NOT NULL,
	"score" numeric(10, 2),
	"historical_baseline_metric" numeric(14, 4),
	"historical_candidate_metric" numeric(14, 4),
	"historical_sample_size" integer,
	"status" varchar(16) DEFAULT 'proposed' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approved_by" varchar(120),
	"approved_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"rejected_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimizer_activations" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" varchar(120) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"baseline_metric" numeric(14, 4) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"activated_by" varchar(120) NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimizer_cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" varchar(24) DEFAULT 'scheduled' NOT NULL,
	"status" varchar(24) DEFAULT 'observing' NOT NULL,
	"scope" varchar(40) DEFAULT 'os' NOT NULL,
	"observation_count" integer DEFAULT 0 NOT NULL,
	"opportunity_count" integer DEFAULT 0 NOT NULL,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimizer_monitoring" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" varchar(120) NOT NULL,
	"activation_id" varchar(120) NOT NULL,
	"measured_metric" numeric(14, 4) NOT NULL,
	"baseline_metric" numeric(14, 4) NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"degraded" boolean DEFAULT false NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimizer_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" varchar(120) NOT NULL,
	"signal_type" varchar(40) NOT NULL,
	"metric_key" varchar(120) NOT NULL,
	"metric_value" numeric(14, 4) NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"evidence_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimizer_rollback_events" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" varchar(120) NOT NULL,
	"activation_id" varchar(120),
	"reason" text NOT NULL,
	"measured_metric" numeric(14, 4),
	"baseline_metric" numeric(14, 4),
	"rolled_back_by" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "improvement_proposals_status_idx" ON "improvement_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "improvement_proposals_cycle_idx" ON "improvement_proposals" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "optimizer_activations_proposal_idx" ON "optimizer_activations" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "optimizer_activations_status_idx" ON "optimizer_activations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "optimizer_cycles_status_idx" ON "optimizer_cycles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "optimizer_cycles_started_idx" ON "optimizer_cycles" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "optimizer_monitoring_proposal_idx" ON "optimizer_monitoring" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "optimizer_observations_cycle_idx" ON "optimizer_observations" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "optimizer_observations_signal_idx" ON "optimizer_observations" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "optimizer_rollback_events_proposal_idx" ON "optimizer_rollback_events" USING btree ("proposal_id");