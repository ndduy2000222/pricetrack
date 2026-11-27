create table if not exists public.shop_connections (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null unique,
  name text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'syncing', 'error', 'disconnected')),
  last_catalog_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_connection_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  state_hash text unique,
  state_expires_at timestamptz,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'used', 'revoked')),
  used_at timestamptz,
  connection_id uuid references public.shop_connections(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.shop_connections(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'partial', 'failed')),
  next_offset integer not null default 0,
  page_count integer not null default 0,
  total_items integer,
  processed_items integer not null default 0,
  processed_rows integer not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_catalog_rows (
  connection_id uuid not null references public.shop_connections(id) on delete cascade,
  item_id text not null,
  model_id text not null,
  observed_at timestamptz not null,
  sku text,
  name text,
  model_name text,
  isbn text,
  ean text,
  author text,
  publisher text,
  edition text,
  cover_type text,
  volume_or_combo text,
  image_url text,
  image_id text,
  image_source text check (image_source in ('model', 'product')),
  current_price numeric,
  original_price numeric,
  currency text,
  stock integer,
  status text,
  available boolean,
  condition text,
  product_url text not null,
  data_source text not null default 'shopee_open_api',
  unsupported_fields jsonb not null default '[]'::jsonb,
  request_id text,
  updated_at timestamptz not null default now(),
  primary key (connection_id, item_id, model_id)
);

alter table public.shop_connections enable row level security;
alter table public.shop_connection_invites enable row level security;
alter table public.shop_sync_runs enable row level security;
alter table public.shop_catalog_rows enable row level security;

-- These tables are accessed by the server with the Supabase service role.
-- No client policy is intentionally created because they contain OAuth state and catalog data.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.shop_connections to service_role;
grant select, insert, update, delete on table public.shop_connection_invites to service_role;
grant select, insert, update, delete on table public.shop_sync_runs to service_role;
grant select, insert, update, delete on table public.shop_catalog_rows to service_role;
