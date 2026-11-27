create table if not exists public.shop_memberships (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.shop_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'sync', 'price_editor', 'admin')),
  created_at timestamptz not null default now(),
  unique (connection_id, user_id)
);

create index if not exists shop_memberships_user_connection_idx on public.shop_memberships(user_id, connection_id);
alter table public.shop_memberships enable row level security;
revoke all on public.shop_memberships from anon, authenticated;
grant select, insert, update, delete on public.shop_memberships to service_role;

comment on table public.shop_memberships is 'Per-user access to a shop connection. Existing connections remain platform-admin owned until memberships are assigned.';
