CREATE TABLE "context_retrieval_failures" (
	"id" text PRIMARY KEY NOT NULL,
	"generator" varchar(120),
	"task" varchar(80) NOT NULL,
	"scope_type" varchar(16) NOT NULL,
	"scope_id" varchar(200) NOT NULL,
	"error_category" varchar(40) NOT NULL,
	"error_message" text,
	"correlation_id" varchar(120),
	"retryable" boolean DEFAULT true NOT NULL,
	"downstream_outcome" varchar(40) DEFAULT 'proceeded_ungrounded' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "context_retrieval_failures_scope_idx" ON "context_retrieval_failures" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "context_retrieval_failures_created_idx" ON "context_retrieval_failures" USING btree ("created_at");