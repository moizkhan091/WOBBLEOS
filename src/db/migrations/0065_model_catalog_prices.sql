-- Data migration: put real prices on the model catalog, and offer models a small balance can actually afford.
--
-- Same reasoning as 0064: the catalog is a single settings row inserted ON CONFLICT DO NOTHING, so an
-- existing database never receives a new entry. Without this, Model Control can only offer GPT-4o mini,
-- GPT-4o and Sonnet 4.5, and cannot show what any of them cost.
--
-- Every price below was read from OpenRouter's live model list, not remembered.

-- 1. Backfill prices onto the entries that are already there. Only the listed ids are touched.
UPDATE "settings" s
SET "value" = jsonb_set(s."value", '{models}', (
  SELECT coalesce(jsonb_agg(CASE WHEN pr.p IS NULL THEN t.m ELSE t.m || pr.p END ORDER BY t.ord), '[]'::jsonb)
  FROM jsonb_array_elements(s."value"->'models') WITH ORDINALITY AS t(m, ord)
  LEFT JOIN (VALUES
    ('openai/gpt-4o-mini',          '{"usdPerMillionInput":0.15,"usdPerMillionOutput":0.6}'::jsonb),
    ('openai/gpt-4o',               '{"usdPerMillionInput":2.5,"usdPerMillionOutput":10}'::jsonb),
    ('anthropic/claude-sonnet-4.5', '{"usdPerMillionInput":3,"usdPerMillionOutput":15}'::jsonb)
  ) AS pr(id, p) ON pr.id = t.m->>'id'
)), "updated_at" = now()
WHERE s."key" = 'model_catalog' AND jsonb_typeof(s."value"->'models') = 'array';

-- 2. Add the cheaper models, skipping any id already present so a founder's own additions survive.
UPDATE "settings" s
SET "value" = jsonb_set(s."value", '{models}', (s."value"->'models') || (
  SELECT coalesce(jsonb_agg(n), '[]'::jsonb)
  FROM jsonb_array_elements('[
    {"id":"google/gemini-2.5-flash-lite","label":"Gemini 2.5 Flash Lite","provider":"openrouter","modalities":["text","vision"],"costTier":"cheap","status":"active","contextWindow":1048576,"usdPerMillionInput":0.1,"usdPerMillionOutput":0.4,"goodFor":["classification","routing","extraction","cheap-drafts","high-volume"],"notes":"Cheaper per token than GPT-4o mini with a far larger context window. Not yet validated on WOBBLE prompts."},
    {"id":"google/gemini-2.5-flash","label":"Gemini 2.5 Flash","provider":"openrouter","modalities":["text","vision"],"costTier":"mid","status":"active","contextWindow":1048576,"usdPerMillionInput":0.3,"usdPerMillionOutput":2.5,"goodFor":["reasoning","extraction","long-context","strategy"],"notes":"About a tenth of Sonnet 4.5 per token. The frugal preset judgment model."},
    {"id":"openai/gpt-4.1-mini","label":"GPT-4.1 mini","provider":"openrouter","modalities":["text","vision"],"costTier":"mid","status":"active","contextWindow":1047576,"usdPerMillionInput":0.4,"usdPerMillionOutput":1.6,"goodFor":["reasoning","extraction","long-context"]},
    {"id":"openai/gpt-5-mini","label":"GPT-5 mini","provider":"openrouter","modalities":["text","vision"],"costTier":"mid","status":"active","contextWindow":400000,"usdPerMillionInput":0.25,"usdPerMillionOutput":2,"goodFor":["reasoning","strategy","long-context"]},
    {"id":"anthropic/claude-haiku-4.5","label":"Claude Haiku 4.5","provider":"openrouter","modalities":["text","vision"],"costTier":"mid","status":"active","contextWindow":200000,"usdPerMillionInput":1,"usdPerMillionOutput":5,"goodFor":["copywriting","extraction","reasoning"],"notes":"Anthropic voice at a third of Sonnet price."}
  ]'::jsonb) n
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s."value"->'models') e WHERE e->>'id' = n->>'id')
)), "updated_at" = now()
WHERE s."key" = 'model_catalog' AND jsonb_typeof(s."value"->'models') = 'array';
