# Catalog sync runbook

## Normal operation

1. User signs in with the approved email.
2. User connects a Shopee shop through an invite.
3. The OAuth callback verifies the returned Shopee shop identity, stores credentials encrypted, and creates the owner's `shop_memberships` row.
4. The user starts an authenticated sync. Rows are upserted by `(connection_id, item_id, model_id)` and price history is appended.
5. The dashboard reads the last stored snapshot. A failed sync leaves the last successful rows in place and records the error on the connection/run.

## Background sync

`POST /api/internal/sync` is protected by `Authorization: Bearer <CRON_SECRET>` and is scheduled every 30 minutes in `apps/admin/vercel.json`. It must not be exposed without `CRON_SECRET` or `CATALOG_SYNC_SECRET`. Verify the Vercel plan supports the configured cron frequency and set the same secret in Production before enabling it.

## Recovery

- `refresh_token_not_configured` or `reauthorization_required`: reconnect only the affected shop.
- A failed run: inspect `shop_sync_runs.last_error`; do not delete catalog rows.
- If a deploy is bad: roll back to the previous Vercel deployment and revert only the additive migration if a controlled rollback is required. Do not drop tables or reset Supabase.
