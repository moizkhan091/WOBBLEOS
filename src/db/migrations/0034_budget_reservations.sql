CREATE TABLE "budget_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"department_slug" varchar(120) NOT NULL,
	"workflow_id" text NOT NULL,
	"task_id" varchar(160) NOT NULL,
	"estimated_cents" integer DEFAULT 0 NOT NULL,
	"estimated_tokens" integer DEFAULT 0 NOT NULL,
	"actual_cents" integer,
	"actual_tokens" integer,
	"provider" varchar(80),
	"state" varchar(16) DEFAULT 'reserved' NOT NULL,
	"reason" text,
	"override_by" varchar(120),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "budget_reservations_unit_uidx" ON "budget_reservations" USING btree ("department_slug","workflow_id","task_id");--> statement-breakpoint
CREATE INDEX "budget_reservations_dept_state_idx" ON "budget_reservations" USING btree ("department_slug","state");--> statement-breakpoint
CREATE INDEX "budget_reservations_state_expiry_idx" ON "budget_reservations" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "budget_reservations_created_idx" ON "budget_reservations" USING btree ("created_at");