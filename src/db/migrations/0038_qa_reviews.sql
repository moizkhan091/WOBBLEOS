CREATE TABLE "qa_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"board_slug" varchar(120) NOT NULL,
	"reviewer_agent_slug" varchar(120) NOT NULL,
	"department" varchar(120) NOT NULL,
	"artifact_schema" varchar(120) NOT NULL,
	"author_agent_slug" varchar(120) NOT NULL,
	"workflow_id" text NOT NULL,
	"task_id" varchar(160),
	"client_workspace_id" varchar(120),
	"verdict" varchar(16) NOT NULL,
	"score" numeric(6, 4) DEFAULT '0' NOT NULL,
	"independent" boolean DEFAULT true NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"routing_target" jsonb,
	"summary" text NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "qa_reviews_board_workflow_idx" ON "qa_reviews" USING btree ("board_slug","workflow_id");--> statement-breakpoint
CREATE INDEX "qa_reviews_dept_verdict_idx" ON "qa_reviews" USING btree ("department","verdict");--> statement-breakpoint
CREATE INDEX "qa_reviews_workflow_idx" ON "qa_reviews" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "qa_reviews_created_idx" ON "qa_reviews" USING btree ("created_at");