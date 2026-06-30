CREATE TABLE IF NOT EXISTS content_tracks (
  id text PRIMARY KEY,
  slug varchar(120) NOT NULL,
  label varchar(160) NOT NULL,
  owner_type varchar(64) NOT NULL DEFAULT 'company',
  voice_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  banned_phrases jsonb NOT NULL DEFAULT '[]'::jsonb,
  aggression_range jsonb NOT NULL DEFAULT '{"min":0,"max":10}'::jsonb,
  platform_priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  approval_required boolean NOT NULL DEFAULT true,
  status varchar(32) NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_packets
  ADD COLUMN IF NOT EXISTS content_track_id text;

UPDATE content_packets
SET content_track_id = 'track_wobble_company'
WHERE content_track_id IS NULL;

ALTER TABLE content_packets
  ALTER COLUMN content_track_id SET DEFAULT 'track_wobble_company',
  ALTER COLUMN content_track_id SET NOT NULL;

ALTER TABLE content_packets
  ADD COLUMN IF NOT EXISTS created_by varchar(120) NOT NULL DEFAULT 'system';
