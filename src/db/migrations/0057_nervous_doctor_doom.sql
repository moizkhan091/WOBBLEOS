CREATE TABLE "qualification_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" varchar(16) NOT NULL,
	"subject_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"grade" varchar(2) NOT NULL,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"recommendation" text NOT NULL,
	"summary" text,
	"model" varchar(120),
	"created_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"role" varchar(60) NOT NULL,
	"agent_slug" varchar(80) NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"weight" numeric(4, 2) DEFAULT '1' NOT NULL,
	"rationale" text NOT NULL,
	"policy_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "qualification_assessments_subject_idx" ON "qualification_assessments" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_assessments_subject_version_uq" ON "qualification_assessments" USING btree ("subject_type","subject_id","version");--> statement-breakpoint
CREATE INDEX "qualification_roles_assessment_idx" ON "qualification_roles" USING btree ("assessment_id");