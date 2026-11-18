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
  created_at timestamptz not null default now()
);

alter table public.mtproxy_instances enable row level security;

-- Access is intentionally server-side only through the Supabase service-role key.
-- Never expose SUPABASE_SERVICE_ROLE_KEY to browser code.
