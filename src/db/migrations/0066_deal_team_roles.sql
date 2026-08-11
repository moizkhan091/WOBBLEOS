-- Data migration: the deal team's four model roles.
--
-- Same jsonb merge as 0064 (`new || existing`): a role a founder has already chosen a model for keeps
-- it, and only genuinely missing roles are added. Without this the four agents would resolve to the
-- 'default' role, so activating them would quietly put adversarial proposal review on a mini model.
UPDATE "settings"
SET
  "value" = '{
    "objection_handling": {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"},
    "follow_up_writing":  {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"},
    "deal_review":        {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"},
    "pricing_analysis":   {"provider":"openrouter","model":"anthropic/claude-sonnet-4.5"}
  }'::jsonb || "value",
  "updated_at" = now()
WHERE "key" = 'model_roles' AND "scope" = 'global';
