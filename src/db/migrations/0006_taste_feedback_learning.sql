CREATE TABLE IF NOT EXISTS taste_profiles (
  id text PRIMARY KEY NOT NULL,
  profile_key varchar(160) NOT NULL,
  scope varchar(40) NOT NULL,
  subject_id text,
  label varchar(180) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  hard_constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  preference_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  positive_signals integer NOT NULL DEFAULT 0,
  negative_signals integer NOT NULL DEFAULT 0,
  confidence numeric(5, 4) NOT NULL DEFAULT '0',
  last_feedback_at timestamp with time zone,
  provenance_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_events (
  id text PRIMARY KEY NOT NULL,
  target_type varchar(80) NOT NULL,
  target_id text NOT NULL,
  decision varchar(32) NOT NULL,
  reason_category varchar(80),
  reason text,
  actor varchar(120) NOT NULL,
  founder_id varchar(120),
  client_id text,
  project_id text,
  output_type varchar(120),
  module varchar(80),
  agent_slug varchar(120),
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory_bank_slugs jsonb NOT NULL DEFAULT '[]'::jsonb,
  dimensions jsonb NOT NULL DEFAULT '[]'::jsonb,
  profile_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  signal_strength numeric(6, 4) NOT NULL DEFAULT '1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS taste_profiles_profile_key_unique ON taste_profiles (profile_key);
CREATE INDEX IF NOT EXISTS taste_profiles_scope_idx ON taste_profiles (scope);
CREATE INDEX IF NOT EXISTS taste_profiles_subject_idx ON taste_profiles (subject_id);
CREATE INDEX IF NOT EXISTS taste_profiles_status_idx ON taste_profiles (status);

CREATE INDEX IF NOT EXISTS feedback_events_target_idx ON feedback_events (target_type, target_id);
CREATE INDEX IF NOT EXISTS feedback_events_actor_idx ON feedback_events (actor);
CREATE INDEX IF NOT EXISTS feedback_events_module_idx ON feedback_events (module);
CREATE INDEX IF NOT EXISTS feedback_events_agent_slug_idx ON feedback_events (agent_slug);
CREATE INDEX IF NOT EXISTS feedback_events_created_at_idx ON feedback_events (created_at);
