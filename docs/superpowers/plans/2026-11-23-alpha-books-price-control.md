# Alpha Books price-control vertical slice

## Goal

Build a guarded first slice for one Alpha Books Shopee shop: competitor observations, deterministic proposals, explicit Monitor/Review/Auto modes, and a worker seam that cannot write until the integration is validated.

## Delivered

- [x] Product, architecture, validation, decision, and runbook documentation.
- [x] Supabase schema with tenant-scoped RLS and seed data.
- [x] Pure pricing engine with freshness, floor/ceiling, cooldown, daily-limit, and max-change gates.
- [x] Worker cycle with stop switch, read-before-write, idempotency key, and read-back verification.
- [x] Shopee adapter seam that remains `not_configured` and write-disabled.
- [x] Responsive admin preview with Monitor/Review/Auto controls and simulated-data banner.
- [x] Unit, worker, lint, production-build, and browser interaction checks.

## Remaining before production writes

- [ ] Provide Shopee app/shop authorization and validate current product/promotion permissions.
- [ ] Provide the first 10 competitor URLs and approve manual model mappings.
- [ ] Apply the Supabase migration in a real project and run RLS/integration checks.
- [ ] Implement and test the authenticated Shopee seller adapter with one approved SKU only.
