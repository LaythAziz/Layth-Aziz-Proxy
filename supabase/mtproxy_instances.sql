-- Run once in the dedicated proxy Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.mtproxy_instances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  server text not null,
  port integer not null check (port between 1 and 65535),
  secret_encrypted text not null,
  status text not null default 'pending' check (status in ('pending','online','offline','stopped','error')),
  last_check timestamptz,
  latency_ms integer,
  provider_name text,
  provider_server_id text,
  provider_location text,
  server_type text,
  created_at timestamptz not null default now()
);

-- Safe migration for projects that already ran the earlier schema.
alter table public.mtproxy_instances add column if not exists provider_name text;
alter table public.mtproxy_instances add column if not exists provider_server_id text;
alter table public.mtproxy_instances add column if not exists provider_location text;
alter table public.mtproxy_instances add column if not exists server_type text;

alter table public.mtproxy_instances enable row level security;

-- Access is intentionally server-side only through the Supabase service-role key.
-- Never expose SUPABASE_SERVICE_ROLE_KEY to browser code.
