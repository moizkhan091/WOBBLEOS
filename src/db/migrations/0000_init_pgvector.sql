CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS founder_profiles (
  id text PRIMARY KEY,
  display_name varchar(80) NOT NULL,
  role varchar(120) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  approval_default boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  session_token_hash text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id text PRIMARY KEY,
  key varchar(120) NOT NULL,
  scope varchar(64) NOT NULL DEFAULT 'global',
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  queue varchar(80) NOT NULL,
  type varchar(120) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  idempotency_key varchar(160),
  linked_module varchar(80),
  linked_entity_type varchar(80),
  linked_entity_id text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_after timestamptz,
  locked_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_attempts (
  id text PRIMARY KEY,
  job_id text NOT NULL,
  attempt_number integer NOT NULL,
  status varchar(32) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id text PRIMARY KEY,
  worker_name varchar(120) NOT NULL,
  worker_type varchar(80) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'online',
  current_job_id text,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_trust_levels (
  id text PRIMARY KEY,
  slug varchar(80) NOT NULL,
  label varchar(120) NOT NULL,
  priority integer NOT NULL,
  description text NOT NULL,
  can_update_brain boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY,
  title text NOT NULL,
  source_type varchar(80) NOT NULL,
  url text,
  trust_level varchar(80) NOT NULL DEFAULT 'tier_4_experimental',
  approval_status varchar(32) NOT NULL DEFAULT 'pending',
  status varchar(32) NOT NULL DEFAULT 'active',
  discovered_by varchar(120),
  added_by varchar(120),
  approved_by varchar(120),
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id text PRIMARY KEY,
  path text NOT NULL,
  file_type varchar(80) NOT NULL,
  module varchar(80) NOT NULL,
  linked_entity_type varchar(80),
  linked_entity_id text,
  created_by varchar(120) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  approval_state varchar(32) NOT NULL DEFAULT 'not_required',
  size_bytes numeric,
  checksum text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_chunks (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_records (
  id text PRIMARY KEY,
  slug varchar(120) NOT NULL,
  title text NOT NULL,
  memory_tier varchar(32) NOT NULL,
  area varchar(80) NOT NULL,
  content text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  source_id text,
  confidence numeric,
  approved_by varchar(120),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id text PRIMARY KEY,
  memory_record_id text,
  content text NOT NULL,
  embedding vector(1536),
  memory_tier varchar(32) NOT NULL,
  trust_level varchar(48) NOT NULL,
  source_id text,
  parent_entity_id text,
  entity_type varchar(64),
  status varchar(32) NOT NULL DEFAULT 'active',
  archived boolean NOT NULL DEFAULT false,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_update_proposals (
  id text PRIMARY KEY,
  proposed_memory text NOT NULL,
  reason text NOT NULL,
  source_id text,
  affected_area varchar(80) NOT NULL,
  confidence numeric,
  approval_id text,
  status varchar(32) NOT NULL DEFAULT 'pending',
  approved_by varchar(120),
  approved_at timestamptz,
  rejected_by varchar(120),
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  approval_type varchar(80) NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  risk_level varchar(32) NOT NULL DEFAULT 'normal',
  requested_by varchar(120),
  approved_by varchar(120),
  approved_at timestamptz,
  rejected_by varchar(120),
  rejected_at timestamptz,
  approval_action varchar(80),
  confirmation_required boolean NOT NULL DEFAULT false,
  confirmation_completed boolean NOT NULL DEFAULT false,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_actions (
  id text PRIMARY KEY,
  slug varchar(80) NOT NULL,
  label varchar(120) NOT NULL,
  description text NOT NULL,
  risk_level varchar(32) NOT NULL DEFAULT 'normal',
  requires_confirmation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_packets (
  id text PRIMARY KEY,
  platform varchar(80) NOT NULL,
  format varchar(80) NOT NULL,
  objective text NOT NULL,
  target_audience text NOT NULL,
  angle text NOT NULL,
  hook text,
  main_copy text,
  carousel_slides jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption text,
  cta text,
  design_direction text,
  source_ids_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  insight_ids_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory_chunks_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_summary text,
  claim_risk_level varchar(32) NOT NULL DEFAULT 'low',
  proof_required boolean NOT NULL DEFAULT false,
  quality_status varchar(32) NOT NULL DEFAULT 'not_reviewed',
  approval_status varchar(32) NOT NULL DEFAULT 'draft',
  n8n_handoff_status varchar(32) NOT NULL DEFAULT 'not_sent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_versions (
  id text PRIMARY KEY,
  content_packet_id text NOT NULL,
  version_number integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_reason text,
  created_by varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quality_reviews (
  id text PRIMARY KEY,
  entity_type varchar(80) NOT NULL,
  entity_id text NOT NULL,
  usefulness integer NOT NULL,
  originality integer NOT NULL,
  brand_fit integer NOT NULL,
  clarity integer NOT NULL,
  aggression_control integer NOT NULL,
  proof_strength integer NOT NULL,
  post_worthiness varchar(32) NOT NULL,
  passed boolean NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_runs (
  id text PRIMARY KEY,
  provider varchar(64) NOT NULL,
  model varchar(128) NOT NULL,
  role varchar(64) NOT NULL,
  module varchar(64) NOT NULL,
  input_tokens integer,
  output_tokens integer,
  estimated_cost numeric,
  actual_cost numeric,
  latency_ms integer,
  status varchar(32) NOT NULL,
  error text,
  linked_entity_type varchar(80),
  linked_entity_id text,
  provider_run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_runs (
  id text PRIMARY KEY,
  provider varchar(80) NOT NULL,
  operation varchar(120) NOT NULL,
  status varchar(32) NOT NULL,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_metadata jsonb,
  estimated_cost numeric,
  actual_cost numeric,
  latency_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  event_type varchar(80) NOT NULL,
  module varchar(64) NOT NULL,
  entity_type varchar(80),
  entity_id text,
  actor varchar(80),
  model_run_id text,
  cost_estimate numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id text PRIMARY KEY,
  name varchar(120) NOT NULL,
  module varchar(80) NOT NULL,
  url text NOT NULL,
  secret_ref_name varchar(120) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  endpoint_id text,
  direction varchar(32) NOT NULL,
  event_type varchar(120) NOT NULL,
  status varchar(32) NOT NULL,
  idempotency_key varchar(160),
  signature_verified boolean NOT NULL DEFAULT false,
  replay_protected boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  failure_reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dead_letters (
  id text PRIMARY KEY,
  source_type varchar(80) NOT NULL,
  source_id text NOT NULL,
  module varchar(80) NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_count integer NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_caps (
  id text PRIMARY KEY,
  category varchar(80) NOT NULL,
  period varchar(32) NOT NULL,
  amount numeric NOT NULL,
  currency varchar(8) NOT NULL DEFAULT 'USD',
  max_batch_size integer,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automations (
  id text PRIMARY KEY,
  name varchar(160) NOT NULL,
  module varchar(80) NOT NULL,
  trigger_type varchar(80) NOT NULL,
  schedule varchar(120),
  n8n_workflow_id varchar(160),
  worker_queue varchar(80),
  status varchar(32) NOT NULL DEFAULT 'paused',
  kill_switch_key varchar(120),
  last_successful_run_at timestamptz,
  next_run_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id text PRIMARY KEY,
  automation_id text NOT NULL,
  status varchar(32) NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id text PRIMARY KEY,
  backup_type varchar(80) NOT NULL,
  status varchar(32) NOT NULL,
  storage_path text,
  size_bytes numeric,
  checksum text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_connections (
  id text PRIMARY KEY,
  slug varchar(120) NOT NULL,
  label varchar(160) NOT NULL,
  provider_type varchar(80) NOT NULL,
  credential_key_name varchar(120) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  allowed_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  permission_mode varchar(80) NOT NULL DEFAULT 'read_write',
  cost_category varchar(80) NOT NULL,
  health_status varchar(32) NOT NULL DEFAULT 'unknown',
  reference_doc_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_skills (
  id text PRIMARY KEY,
  slug varchar(120) NOT NULL,
  name varchar(160) NOT NULL,
  module varchar(80) NOT NULL,
  trigger text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status varchar(32) NOT NULL DEFAULT 'draft',
  goal text NOT NULL,
  prompt_body text NOT NULL,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by varchar(120),
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_chunks_embedding_idx ON source_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memory_chunks_embedding_idx ON memory_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memory_chunks_scope_idx ON memory_chunks(memory_tier, trust_level, status, archived);
CREATE INDEX IF NOT EXISTS jobs_queue_status_idx ON jobs(queue, status, run_after);
CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status, approval_type, risk_level);
CREATE INDEX IF NOT EXISTS webhook_events_idempotency_idx ON webhook_events(idempotency_key);
CREATE INDEX IF NOT EXISTS audit_logs_module_created_idx ON audit_logs(module, created_at);
