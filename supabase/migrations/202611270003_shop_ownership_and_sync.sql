-- Additive migration: preserves existing connections and catalog rows.
alter table public.shop_connection_invites add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
alter table public.shop_connections add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.shop_connections add column if not exists last_successful_sync_at timestamptz;
alter table public.shop_connections add column if not exists next_sync_at timestamptz;
alter table public.shop_connections add column if not exists sync_lock_until timestamptz;
create index if not exists shop_connections_due_sync_idx on public.shop_connections(status, next_sync_at);
grant select, insert, update, delete on table public.shop_connections to service_role;
grant select, insert, update, delete on table public.shop_connection_invites to service_role;
