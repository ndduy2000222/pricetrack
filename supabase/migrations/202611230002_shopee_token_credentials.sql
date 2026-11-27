create table if not exists public.shopee_token_credentials (
  shop_id text primary key,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- This table is server-only. The service-role key is used by the Vercel function
-- after the values have been encrypted with SHOPEE_TOKEN_ENCRYPTION_KEY.
alter table public.shopee_token_credentials enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.shopee_token_credentials to service_role;
