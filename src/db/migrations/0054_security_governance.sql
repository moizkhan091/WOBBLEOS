CREATE TABLE "kill_switches" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" varchar(24) NOT NULL,
	"target_ref" varchar(160) NOT NULL,
	"state" varchar(16) DEFAULT 'disabled' NOT NULL,
	"reason" text NOT NULL,
	"disabled_by" varchar(120) NOT NULL,
	"disabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reactivated_by" varchar(120),
	"reactivated_at" timestamp with time zone,
	"reactivation_reason" text,
	"approval_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_register" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" varchar(48) NOT NULL,
	"severity" varchar(16) DEFAULT 'medium' NOT NULL,
	"likelihood" varchar(16) DEFAULT 'possible' NOT NULL,
	"impact" text NOT NULL,
	"affected_clients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_systems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner" varchar(120) NOT NULL,
	"mitigation" text,
	"review_at" timestamp with time zone,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" varchar(120) NOT NULL,
	"updated_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" varchar(32) NOT NULL,
	"severity" varchar(16) DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"affected_asset_type" varchar(48) NOT NULL,
	"affected_asset_id" varchar(160),
	"client_workspace_id" varchar(120),
	"detected_by" varchar(120) NOT NULL,
	"detection_method" varchar(24) DEFAULT 'deterministic' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reproduction" text,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"remediation_owner" varchar(120),
	"remediation" text,
	"retest_at" timestamp with time zone,
	"closure_proof" jsonb,
	"resolved_by" varchar(120),
	"resolved_at" timestamp with time zone,
	"approval_id" text,
	"escalation_id" text,
	"qa_review_id" text,
	"incident_id" text,
	"governance_run_id" text,
	"dedupe_key" varchar(200) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"severity" varchar(16) DEFAULT 'medium' NOT NULL,
	"detection_source" varchar(48) NOT NULL,
	"affected_service" varchar(120),
	"client_workspace_id" varchar(120),
	"status" varchar(24) DEFAULT 'detected' NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"containment" text,
	"remediation" text,
	"recovery" text,
	"founder_decision" text,
	"post_incident_review" text,
	"opened_by" varchar(120) NOT NULL,
	"resolved_by" varchar(120),
	"resolved_at" timestamp with time zone,
	"approval_id" text,
	"escalation_id" text,
	"dedupe_key" varchar(200) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "kill_switches_target_uidx" ON "kill_switches" USING btree ("target_type","target_ref") WHERE state = 'disabled';--> statement-breakpoint
CREATE INDEX "kill_switches_state_idx" ON "kill_switches" USING btree ("state");--> statement-breakpoint
CREATE INDEX "risk_register_status_idx" ON "risk_register" USING btree ("status");--> statement-breakpoint
CREATE INDEX "risk_register_review_idx" ON "risk_register" USING btree ("review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "security_findings_open_dedup_uidx" ON "security_findings" USING btree ("dedupe_key") WHERE status not in ('resolved','false_positive','accepted_risk');--> statement-breakpoint
CREATE INDEX "security_findings_status_idx" ON "security_findings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "security_findings_kind_severity_idx" ON "security_findings" USING btree ("kind","severity");--> statement-breakpoint
CREATE INDEX "security_findings_client_idx" ON "security_findings" USING btree ("client_workspace_id");--> statement-breakpoint
CREATE INDEX "security_findings_created_idx" ON "security_findings" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "security_incidents_open_dedup_uidx" ON "security_incidents" USING btree ("dedupe_key") WHERE status not in ('resolved','closed');--> statement-breakpoint
CREATE INDEX "security_incidents_status_idx" ON "security_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "security_incidents_created_idx" ON "security_incidents" USING btree ("created_at");