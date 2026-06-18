-- Saved power plant bookmarks, keyed to the approved login email.
-- Run this in the Supabase SQL editor for the project used by SUPABASE_URL.

CREATE TABLE IF NOT EXISTS saved_power_plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  plant_id text NOT NULL,
  name text NOT NULL,
  coordinates jsonb NOT NULL,
  source text,
  output_display text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_email, plant_id)
);

CREATE INDEX IF NOT EXISTS saved_power_plants_user_email_idx
  ON saved_power_plants (user_email);
