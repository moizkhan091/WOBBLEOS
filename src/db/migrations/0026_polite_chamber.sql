CREATE INDEX IF NOT EXISTS "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approvals_created_at_idx" ON "approvals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_runs_created_at_idx" ON "model_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_runs_module_created_idx" ON "model_runs" USING btree ("module","created_at");