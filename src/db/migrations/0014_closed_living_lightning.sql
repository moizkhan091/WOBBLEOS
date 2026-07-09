CREATE TABLE "crm_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"industry" varchar(120),
	"website" text,
	"country" varchar(80),
	"city" varchar(120),
	"email" text,
	"phone" varchar(60),
	"whatsapp" varchar(60),
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_source" varchar(80),
	"status" varchar(40) DEFAULT 'prospect' NOT NULL,
	"client_type" varchar(60),
	"company_size" varchar(40),
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text,
	"full_name" text NOT NULL,
	"role" varchar(120),
	"email" text,
	"phone" varchar(60),
	"whatsapp" varchar(60),
	"linkedin" text,
	"relationship_type" varchar(40) DEFAULT 'other' NOT NULL,
	"lead_source" varchar(80),
	"preferred_channel" varchar(40),
	"last_contacted_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"assigned_owner" varchar(120),
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company_id" text,
	"contact_id" text,
	"source" varchar(80),
	"campaign" varchar(120),
	"score" integer DEFAULT 0 NOT NULL,
	"intent_level" varchar(20) DEFAULT 'unknown' NOT NULL,
	"budget_level" varchar(20) DEFAULT 'unknown' NOT NULL,
	"urgency_level" varchar(20) DEFAULT 'unknown' NOT NULL,
	"fit_level" varchar(20) DEFAULT 'unknown' NOT NULL,
	"problem_stated" text,
	"service_interest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_owner" varchar(120),
	"status" varchar(32) DEFAULT 'new' NOT NULL,
	"converted_opportunity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company_id" text NOT NULL,
	"contact_id" text,
	"stage" varchar(40) DEFAULT 'new_lead' NOT NULL,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"expected_close_at" timestamp with time zone,
	"source" varchar(80),
	"assigned_owner" varchar(120),
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"service_interest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pain_points" text,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"win_reason" text,
	"proposal_id" text,
	"invoice_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar(120),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_stage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"old_stage" varchar(40),
	"new_stage" varchar(40) NOT NULL,
	"moved_by" varchar(120),
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" varchar(40) NOT NULL,
	"company_id" text,
	"contact_id" text,
	"opportunity_id" text,
	"proposal_id" text,
	"billing_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"amount_paid_cents" integer DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone,
	"payment_terms" varchar(80),
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"notes" text,
	"created_by" varchar(120),
	"approved_by" varchar(120),
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "crm_companies_status_idx" ON "crm_companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_companies_archived_idx" ON "crm_companies" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "crm_contacts_company_idx" ON "crm_contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_contacts_archived_idx" ON "crm_contacts" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "crm_leads_status_idx" ON "crm_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_leads_company_idx" ON "crm_leads" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_opportunities_stage_idx" ON "crm_opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "crm_opportunities_status_idx" ON "crm_opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_opportunities_company_idx" ON "crm_opportunities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_stage_history_opportunity_idx" ON "crm_stage_history" USING btree ("opportunity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_idx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_company_idx" ON "invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoices_opportunity_idx" ON "invoices" USING btree ("opportunity_id");