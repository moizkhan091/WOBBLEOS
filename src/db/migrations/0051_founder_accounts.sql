-- Founder accounts: replace the shared team login with per-founder credentials.
--
-- `founder_profiles` becomes the login account (email + password_hash + is_super_admin); `status`
-- ("active" | "disabled") gates both login and live sessions. `auth_sessions.founder_id` ties each
-- session to the account that created it, which is what makes per-founder revocation possible —
-- previously the founder existed only inside the JWT, so session rows were anonymous.
--
-- Credentials are intentionally NOT seeded here: columns are nullable, a profile without a
-- password_hash simply cannot log in, and `npm run auth:bootstrap` sets real per-founder passwords
-- outside version control.
ALTER TABLE "founder_profiles" ADD COLUMN "email" varchar(200);--> statement-breakpoint
ALTER TABLE "founder_profiles" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "founder_profiles" ADD COLUMN "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "founder_profiles" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "founder_profiles" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "founder_profiles_email_unique" ON "founder_profiles" USING btree ("email");--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "founder_id" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_founder_id_founder_profiles_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_founder_idx" ON "auth_sessions" USING btree ("founder_id");
