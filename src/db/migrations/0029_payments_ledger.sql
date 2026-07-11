CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_reference" varchar(200),
	"method" varchar(40) DEFAULT 'manual' NOT NULL,
	"note" text,
	"recorded_by" varchar(120),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_invoice_ref_uidx" ON "payments" USING btree ("invoice_id","payment_reference") WHERE payment_reference IS NOT NULL;