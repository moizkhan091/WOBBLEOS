-- Data migration: backfill the model roles that used to be hardcoded at their call sites.
--
-- Why a migration and not the seeder: the role map lives in ONE settings row, and the seeder inserts it
-- with ON CONFLICT DO NOTHING (deliberately, so a re-seed can never clobber a founder's model switch).
-- That also means a database seeded before these roles existed would never receive them, and every one
-- of them would silently resolve to the 'default' role instead. Model Control would then show one model
-- while the provider ran another.
--
-- `excluded-style` merge semantics: in jsonb, `a || b` lets b's keys win. Putting the EXISTING value on
-- the right means a role that already has a chosen model keeps it, and only genuinely missing roles are
-- added. Re-running this migration is therefore a no-op.
UPDATE "settings"
SET
  "value" = '{
    "revenue_head":         {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"},
    "call_questions":       {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"},
    "meeting_intelligence": {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"},
    "proposal_architect":   {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"},
    "content_render":       {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"},
    "qualification":        {"provider":"openrouter","model":"openai/gpt-4o-mini"},
    "offer_validation":     {"provider":"openrouter","model":"openai/gpt-4o-mini"}
  }'::jsonb || "value",
  "updated_at" = now()
WHERE "key" = 'model_roles' AND "scope" = 'global';
