# Multi-shop portal

The admin portal is available at `/connect/shops`.

Required production configuration:

- `SUPABASE_URL`, either `SUPABASE_SECRET_KEY` (current Supabase) or `SUPABASE_SERVICE_ROLE_KEY` (legacy), and `SHOPEE_TOKEN_ENCRYPTION_KEY`
- `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, and `SHOPEE_API_BASE_URL`
- `SHOP_PORTAL_ADMIN_SECRET` (or the existing `CATALOG_SYNC_SECRET` as a temporary fallback)
- `SHOPEE_REDIRECT_URI=https://alpha-books-price-control.vercel.app/api/shopee/callback`

Apply `supabase/migrations/202611230003_multi_shop_portal.sql` before using the portal. The admin creates an opaque, expiring invite link. The seller completes Shopee OAuth, the callback exchanges the one-time code at `/api/v2/auth/token/get`, and tokens are encrypted before storage. Refresh tokens are rotated by the existing server-side token store.

Catalog sync is checkpointed: each request reads one Shopee item-list page, fetches base information and models, upserts rows keyed by `connection_id + item_id + model_id`, and returns a cursor. The browser continues the job until the API reports `succeeded`; there is no price-write endpoint.
