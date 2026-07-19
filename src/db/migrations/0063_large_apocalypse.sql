ALTER TABLE "jobs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;