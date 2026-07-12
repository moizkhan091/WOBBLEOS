CREATE TABLE "department_members" (
	"id" text PRIMARY KEY NOT NULL,
	"department_slug" varchar(120) NOT NULL,
	"member_type" varchar(16) DEFAULT 'agent' NOT NULL,
	"member_ref" varchar(160) NOT NULL,
	"role" varchar(80) NOT NULL,
	"responsibility" text NOT NULL,
	"manager_agent_slug" varchar(120),
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_grants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_input_schemas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_outputs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_authority" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"escalation_destination" varchar(160),
	"budget_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "department_members_unique" ON "department_members" USING btree ("department_slug","member_type","member_ref");--> statement-breakpoint
CREATE INDEX "department_members_dept_idx" ON "department_members" USING btree ("department_slug");--> statement-breakpoint
CREATE INDEX "department_members_ref_idx" ON "department_members" USING btree ("member_ref");--> statement-breakpoint
CREATE INDEX "department_members_active_idx" ON "department_members" USING btree ("active");