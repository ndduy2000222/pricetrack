-- Allow the portal to manage one own shop and up to five explicitly
-- authorized competitor shops. Tokens and catalog rows remain isolated by
-- connection_id; no public-shop scraping is introduced.

alter table public.shop_connections
  add column if not exists connection_type text not null default 'own';

alter table public.shop_connection_invites
  add column if not exists connection_type text not null default 'own';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_connections_connection_type_check'
      and conrelid = 'public.shop_connections'::regclass
  ) then
    alter table public.shop_connections
      add constraint shop_connections_connection_type_check
      check (connection_type in ('own', 'competitor'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'shop_connection_invites_connection_type_check'
      and conrelid = 'public.shop_connection_invites'::regclass
  ) then
    alter table public.shop_connection_invites
      add constraint shop_connection_invites_connection_type_check
      check (connection_type in ('own', 'competitor'));
  end if;
end $$;

create index if not exists shop_connections_type_status_idx
  on public.shop_connections (connection_type, status, created_at);

grant select, insert, update, delete on table public.shop_connections to service_role;
grant select, insert, update, delete on table public.shop_connection_invites to service_role;
