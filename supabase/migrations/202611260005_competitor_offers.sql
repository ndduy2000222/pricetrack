create table if not exists public.competitor_offers (
  shop_key text not null,
  shop_name text not null,
  shop_handle text not null,
  shop_url text not null,
  source_row_key text,
  item_id text,
  model_id text,
  sku text,
  name text not null,
  isbn text,
  ean text,
  author text,
  publisher text,
  edition text,
  cover_type text,
  volume_or_combo text,
  image_url text,
  image_id text,
  price numeric,
  list_price numeric,
  promo_price numeric,
  shipping numeric,
  voucher numeric,
  available boolean not null default false,
  comparison_eligible boolean not null default false,
  condition text,
  product_url text not null,
  observed_at timestamptz not null,
  price_basis text,
  source text not null,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (shop_key, product_url)
);

create index if not exists competitor_offers_row_shop_observed_idx
  on public.competitor_offers (source_row_key, shop_key, observed_at desc);

create index if not exists competitor_offers_shop_observed_idx
  on public.competitor_offers (shop_key, observed_at desc);

alter table public.competitor_offers enable row level security;
grant select, insert, update, delete on table public.competitor_offers to service_role;
