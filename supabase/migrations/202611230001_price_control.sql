create extension if not exists pgcrypto;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'shopee' check (platform in ('shopee')),
  external_shop_id text not null,
  name text not null,
  integration_status text not null default 'not_configured'
    check (integration_status in ('not_configured', 'read_only', 'write_ready', 'disabled')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, platform, external_shop_id)
);

create table public.shop_secret_refs (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'runtime_secret_store',
  secret_ref text not null,
  created_at timestamptz not null default now()
);

create table public.own_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  external_item_id text not null,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'unavailable')),
  created_at timestamptz not null default now(),
  unique (shop_id, external_item_id)
);

create table public.own_models (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.own_products(id) on delete cascade,
  external_model_id text not null,
  sku text not null,
  name text not null,
  current_price numeric(12, 2) not null check (current_price >= 0),
  floor_price numeric(12, 2) not null check (floor_price >= 0),
  ceiling_price numeric(12, 2) not null check (ceiling_price >= floor_price),
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, external_model_id)
);

create table public.own_price_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  own_model_id uuid not null references public.own_models(id) on delete cascade,
  current_price numeric(12, 2) not null check (current_price >= 0),
  original_price numeric(12, 2),
  currency text,
  available boolean not null,
  source text not null default 'shopee_open_api',
  external_request_id text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.competitor_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  own_model_id uuid not null references public.own_models(id) on delete cascade,
  label text not null,
  product_url text not null,
  external_item_id text,
  external_model_id text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (external_model_id is null or external_item_id is not null)
);

create table public.competitor_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  competitor_link_id uuid not null references public.competitor_links(id) on delete cascade,
  external_item_id text not null,
  external_model_id text not null,
  price numeric(12, 2) not null check (price > 0),
  available boolean not null,
  source text not null,
  observed_at timestamptz not null,
  fresh_until timestamptz not null,
  raw_ref text,
  created_at timestamptz not null default now(),
  check (fresh_until >= observed_at)
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  own_model_id uuid not null references public.own_models(id) on delete cascade,
  rule_mode text not null check (rule_mode in ('amount', 'percent')),
  amount numeric(12, 2) check (amount is null or amount >= 0),
  percent numeric(8, 6) check (percent is null or percent >= 0 and percent <= 1),
  rounding_increment numeric(12, 2) not null default 1 check (rounding_increment > 0),
  allow_price_increase boolean not null default false,
  cooldown_minutes integer not null default 60 check (cooldown_minutes >= 0),
  max_change_per_run numeric(12, 2) not null default 10000 check (max_change_per_run >= 0),
  max_daily_change numeric(12, 2) not null default 20000 check (max_daily_change >= 0),
  max_observation_age_minutes integer not null default 15 check (max_observation_age_minutes > 0),
  mode text not null default 'monitor' check (mode in ('monitor', 'review', 'auto')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check ((rule_mode = 'amount' and amount is not null and percent is null)
    or (rule_mode = 'percent' and percent is not null and amount is null))
);

create table public.pricing_decisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  own_model_id uuid not null references public.own_models(id) on delete cascade,
  pricing_rule_id uuid not null references public.pricing_rules(id) on delete restrict,
  status text not null check (status in ('proposal', 'blocked', 'approved', 'executed', 'rejected', 'expired')),
  current_price numeric(12, 2) not null check (current_price >= 0),
  proposed_price numeric(12, 2) not null check (proposed_price >= 0),
  reference_price numeric(12, 2),
  reason_codes text[] not null default '{}',
  input_snapshot jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  idempotency_key text not null unique
);

create table public.execution_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.pricing_decisions(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null check (status in ('dry_run', 'started', 'succeeded', 'failed', 'reconciled', 'unknown')),
  request_snapshot jsonb not null default '{}'::jsonb,
  response_snapshot jsonb not null default '{}'::jsonb,
  error_code text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.worker_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('monitor', 'review', 'auto')),
  source_status text not null default 'mock',
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed', 'stopped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_summary text
);

create index own_models_active_idx on public.own_models (owner_id, paused, product_id);
create index own_price_observations_recent_idx on public.own_price_observations (owner_id, own_model_id, observed_at desc);
create index competitor_observations_fresh_idx on public.competitor_observations (owner_id, competitor_link_id, fresh_until desc);
create index pricing_decisions_queue_idx on public.pricing_decisions (owner_id, status, expires_at desc);
create index execution_attempts_decision_idx on public.execution_attempts (owner_id, decision_id, attempted_at desc);
create index worker_runs_recent_idx on public.worker_runs (owner_id, started_at desc);

alter table public.shops enable row level security;
alter table public.shop_secret_refs enable row level security;
alter table public.own_products enable row level security;
alter table public.own_models enable row level security;
alter table public.own_price_observations enable row level security;
alter table public.competitor_links enable row level security;
alter table public.competitor_observations enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.pricing_decisions enable row level security;
alter table public.execution_attempts enable row level security;
alter table public.worker_runs enable row level security;

create policy shops_owner_select on public.shops for select to authenticated using ((select auth.uid()) = owner_id);
create policy shops_owner_insert on public.shops for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy shops_owner_update on public.shops for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create policy shop_secret_refs_owner_select on public.shop_secret_refs for select to authenticated using ((select auth.uid()) = owner_id);
create policy shop_secret_refs_owner_insert on public.shop_secret_refs for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy own_products_owner_all on public.own_products for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy own_models_owner_all on public.own_models for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy own_price_observations_owner_all on public.own_price_observations for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy competitor_links_owner_all on public.competitor_links for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy competitor_observations_owner_all on public.competitor_observations for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy pricing_rules_owner_all on public.pricing_rules for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy pricing_decisions_owner_all on public.pricing_decisions for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy execution_attempts_owner_all on public.execution_attempts for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy worker_runs_owner_all on public.worker_runs for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
