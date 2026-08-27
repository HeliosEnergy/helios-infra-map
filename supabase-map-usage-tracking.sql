-- InfraMap login and active-user tracking.
-- Run this in the Supabase SQL editor for the project used by helios-infra-map.

create extension if not exists pgcrypto;

create table if not exists public.map_login_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  event_type text not null default 'login_success',
  auth_method text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists map_login_events_email_created_at_idx
  on public.map_login_events (email, created_at desc);

create index if not exists map_login_events_created_at_idx
  on public.map_login_events (created_at desc);

create table if not exists public.map_user_activity (
  email text primary key,
  first_seen_at timestamptz not null default now(),
  last_login_at timestamptz,
  last_seen_at timestamptz not null default now(),
  last_ip_hash text,
  last_user_agent text,
  updated_at timestamptz not null default now()
);

create index if not exists map_user_activity_last_seen_at_idx
  on public.map_user_activity (last_seen_at desc);

create or replace view public.map_active_users as
select
  email,
  last_login_at,
  last_seen_at,
  last_user_agent
from public.map_user_activity
where last_seen_at >= now() - interval '5 minutes'
order by last_seen_at desc;

alter table public.map_login_events enable row level security;
alter table public.map_user_activity enable row level security;

-- No anon/authenticated policies are added.
-- The app writes through the server-side Supabase service role key only.
