# Multi-store architecture

The system uses two identifiers:

- `shop_connections.id`: internal connection identity used in URLs and database foreign keys.
- `shop_connections.shop_id`: Shopee shop identity used only server-side for Shopee requests.

Every business read or write must carry an explicit internal `connection_id`. The server resolves it, verifies the signed-in Supabase user has a `shop_memberships` row with the required role, then loads only that connection's encrypted credentials. There is no environment-token fallback in `createClientForShop`.

The dashboard reads `shop_catalog_rows`, `shop_price_history`, and stored competitor offers. A refresh never calls Shopee. Shopee calls are confined to the authenticated sync/diagnostic routes and the secret-protected background worker.

## Required production migration

Apply, in order, without resetting the database:

1. `supabase/migrations/202611270001_multi_store_authorization.sql`
2. `supabase/migrations/202611270002_shop_products_promotions.sql`
3. `supabase/migrations/202611270003_shop_ownership_and_sync.sql`

After applying them, verify that every existing connection has an intentional membership. Existing rows are not automatically assigned to an arbitrary user.
