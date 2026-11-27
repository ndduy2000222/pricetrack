-- Compatible extension: existing shop_catalog_rows remains the source of truth for
-- item/model catalog data. These columns preserve fields when Shopee supplies them.
alter table public.shop_catalog_rows add column if not exists image_urls jsonb not null default '[]'::jsonb;
alter table public.shop_catalog_rows add column if not exists brand text;
alter table public.shop_catalog_rows add column if not exists description text;
alter table public.shop_catalog_rows add column if not exists item_created_at timestamptz;
alter table public.shop_catalog_rows add column if not exists item_updated_at timestamptz;

create table if not exists public.shop_promotions (
  connection_id uuid not null references public.shop_connections(id) on delete cascade,
  discount_id text not null,
  name text,
  status text,
  start_at timestamptz,
  end_at timestamptz,
  item_count integer,
  model_count integer,
  observed_at timestamptz not null default now(),
  request_id text,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (connection_id, discount_id)
);

create table if not exists public.shop_promotion_items (
  connection_id uuid not null,
  discount_id text not null,
  item_id text not null,
  purchase_limit integer,
  item_promotion_price numeric,
  item_promotion_stock integer,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (connection_id, discount_id, item_id),
  foreign key (connection_id, discount_id) references public.shop_promotions(connection_id, discount_id) on delete cascade
);

create table if not exists public.shop_promotion_models (
  connection_id uuid not null,
  discount_id text not null,
  item_id text not null,
  model_id text not null,
  model_name text,
  model_promotion_price numeric,
  model_promotion_stock integer,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (connection_id, discount_id, item_id, model_id),
  foreign key (connection_id, discount_id, item_id) references public.shop_promotion_items(connection_id, discount_id, item_id) on delete cascade
);

create table if not exists public.shop_price_history (
  connection_id uuid not null references public.shop_connections(id) on delete cascade,
  item_id text not null,
  model_id text not null,
  current_price numeric,
  original_price numeric,
  observed_at timestamptz not null default now(),
  request_id text,
  source text not null default 'shopee_open_api',
  primary key (connection_id, item_id, model_id, observed_at)
);

create index if not exists shop_promotions_connection_status_idx on public.shop_promotions(connection_id, status, start_at, end_at);
create index if not exists shop_promotion_items_connection_item_idx on public.shop_promotion_items(connection_id, item_id);
create index if not exists shop_price_history_lookup_idx on public.shop_price_history(connection_id, item_id, model_id, observed_at desc);

alter table public.shop_promotions enable row level security;
alter table public.shop_promotion_items enable row level security;
alter table public.shop_promotion_models enable row level security;
alter table public.shop_price_history enable row level security;
revoke all on public.shop_promotions, public.shop_promotion_items, public.shop_promotion_models, public.shop_price_history from anon, authenticated;
grant select, insert, update, delete on public.shop_promotions, public.shop_promotion_items, public.shop_promotion_models, public.shop_price_history to service_role;
