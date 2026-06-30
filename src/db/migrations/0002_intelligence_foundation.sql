CREATE TABLE IF NOT EXISTS research_targets (
  id text PRIMARY KEY,
  target_type varchar(80) NOT NULL,
  name varchar(180) NOT NULL,
  platform varchar(80),
  handle_or_url text,
  query text,
  scope varchar(64) NOT NULL DEFAULT 'wobble',
  client_id text,
  status varchar(32) NOT NULL DEFAULT 'active',
  approval_status varchar(32) NOT NULL DEFAULT 'pending',
  trust_level varchar(80) NOT NULL DEFAULT 'tier_4_experimental',
  cadence varchar(40) NOT NULL DEFAULT 'manual',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  added_by varchar(120),
  approved_by varchar(120),
  approved_at timestamptz,
  last_checked_at timestamptz,
  next_run_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_items (
  id text PRIMARY KEY,
  item_type varchar(80) NOT NULL,
  scope varchar(64) NOT NULL DEFAULT 'wobble',
  client_id text,
  target_id text,
  source_id text,
  source_url text,
  platform varchar(80),
  actor_name varchar(180),
  title text NOT NULL,
  summary text NOT NULL,
  raw_text text,
  summary_embedding vector(1536),
  trust_level varchar(80) NOT NULL DEFAULT 'tier_4_experimental',
  approval_status varchar(32) NOT NULL DEFAULT 'pending',
  freshness_status varchar(32) NOT NULL DEFAULT 'unknown',
  confidence numeric NOT NULL DEFAULT 0.6,
  observed_at timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  relations jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_agent varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_insights (
  id text PRIMARY KEY,
  insight_type varchar(80) NOT NULL,
  scope varchar(64) NOT NULL DEFAULT 'wobble',
  client_id text,
  title text NOT NULL,
  summary text NOT NULL,
  recommendation text,
  summary_embedding vector(1536),
  evidence_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  applies_to_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0.6,
  impact_score integer NOT NULL DEFAULT 50,
  approval_status varchar(32) NOT NULL DEFAULT 'pending',
  freshness_status varchar(32) NOT NULL DEFAULT 'current',
  supersedes_insight_id text,
  created_by_agent varchar(120),
  approved_by varchar(120),
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_suggestions (
  id text PRIMARY KEY,
  suggestion_type varchar(80) NOT NULL,
  scope varchar(64) NOT NULL DEFAULT 'wobble',
  client_id text,
  title text NOT NULL,
  rationale text NOT NULL,
  proposed_action text NOT NULL,
  evidence_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_insight_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority varchar(32) NOT NULL DEFAULT 'medium',
  confidence numeric NOT NULL DEFAULT 0.6,
  status varchar(32) NOT NULL DEFAULT 'pending',
  approval_status varchar(32) NOT NULL DEFAULT 'pending',
  approval_id text,
  created_by_agent varchar(120) NOT NULL DEFAULT 'dreamer',
  review_after timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiments (
  id text PRIMARY KEY,
  scope varchar(64) NOT NULL DEFAULT 'wobble',
  client_id text,
  linked_suggestion_id text,
  title text NOT NULL,
  hypothesis text NOT NULL,
  goal text NOT NULL,
  primary_metric varchar(120) NOT NULL,
  expected_result text NOT NULL,
  actual_result text,
  decision text,
  owner varchar(120),
  status varchar(32) NOT NULL DEFAULT 'planned',
  approval_status varchar(32) NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  ended_at timestamptz,
  review_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS output_intelligence_usage (
  id text PRIMARY KEY,
  output_type varchar(80) NOT NULL,
  output_id text NOT NULL,
  source_id text,
  intelligence_item_id text,
  insight_id text,
  memory_chunk_id text,
  weight numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_targets_scope_status_idx ON research_targets(scope, status, approval_status);
CREATE INDEX IF NOT EXISTS intelligence_items_scope_type_status_idx ON intelligence_items(scope, item_type, approval_status, freshness_status);
CREATE INDEX IF NOT EXISTS intelligence_items_collected_idx ON intelligence_items(collected_at);
CREATE INDEX IF NOT EXISTS intelligence_insights_scope_type_status_idx ON intelligence_insights(scope, insight_type, approval_status, freshness_status);
CREATE INDEX IF NOT EXISTS intelligence_suggestions_status_priority_idx ON intelligence_suggestions(status, priority, approval_status);
CREATE INDEX IF NOT EXISTS experiments_status_scope_idx ON experiments(status, scope, approval_status);
CREATE INDEX IF NOT EXISTS output_intelligence_usage_output_idx ON output_intelligence_usage(output_type, output_id);
CREATE INDEX IF NOT EXISTS intelligence_items_summary_embedding_idx ON intelligence_items USING hnsw (summary_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS intelligence_insights_summary_embedding_idx ON intelligence_insights USING hnsw (summary_embedding vector_cosine_ops);
