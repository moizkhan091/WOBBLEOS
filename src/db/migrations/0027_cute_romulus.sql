CREATE TABLE "graph_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_run_id" varchar(200) NOT NULL,
	"graph" varchar(64) NOT NULL,
	"node_slug" varchar(120) NOT NULL,
	"node_index" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'completed' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"output_text" text DEFAULT '' NOT NULL,
	"output" jsonb,
	"model_run_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "graph_checkpoints_run_node_uidx" ON "graph_checkpoints" USING btree ("graph_run_id","node_slug");--> statement-breakpoint
CREATE INDEX "graph_checkpoints_run_idx" ON "graph_checkpoints" USING btree ("graph_run_id");--> statement-breakpoint
CREATE INDEX "graph_checkpoints_created_at_idx" ON "graph_checkpoints" USING btree ("created_at");