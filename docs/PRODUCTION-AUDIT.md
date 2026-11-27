# Alpha Price Control — Production audit

Audit date: 2026-11-27 (Asia/Bangkok)

## Root causes found

| Area | Finding | Impact | Status after this change |
|---|---|---|---|
| Read path | `/api/catalog` and `/api/price-review` could run live Shopee sync when `source=live` was supplied. | A refresh could fail on token/API limits and make the dashboard appear empty. | Fixed: browser read path is stored-only; live reads return `live_read_requires_diagnostic_route`. |
| UI status | Stored responses were labelled `live` and observed time fell back to the current time. | Operators could mistake stale/empty data for fresh data. | Fixed: responses use `status=ok`, explicit `dataStatus`, and nullable timestamps. |
| Competitors | Review reads could invoke configured competitor/affiliate discovery. | Dashboard reads were coupled to external discovery. | Fixed: review read path uses stored competitor offers only. |
| Shop isolation | Shop context already checked memberships, but the shop list was global and OAuth did not create an owner membership. | A user could see unrelated shop choices or be unable to use a newly connected shop. | Fixed in code: list is membership-scoped for OTP users; invite owner receives an admin membership. Migration required. |
| Session | Portal cookie was limited to the access-token lifetime and refresh token was discarded. | Users could be forced to sign in again. | Partially fixed: refresh token is captured in a separate HttpOnly cookie; full rotation middleware remains required before claiming seamless refresh. |
| Sync | Browser page loop was the only full catalog sync path. | Sync was fragile and not suitable as a background job. | Added a secret-protected `/api/internal/sync` worker and 30-minute Vercel schedule. Plan/secret/migration still need production verification. |

## Verification

- TypeScript: PASS (`apps/admin/tsconfig.json`).
- Targeted unit/integration tests: PASS, 6 files / 24 tests.
- Full Vitest discovery: NOT PASS because two legacy `worker-functions/test/*.test.js` files contain no Vitest suite; this is a test-runner configuration issue, not silently ignored.
- ESLint from the current local dependency tree: BLOCKED by unresolved `next/babel` and a Pages-directory rule; no lint pass is claimed.
- Supabase migrations: BLOCKED until run in the production project. No reset or destructive SQL was used.
- Production deployment: must be performed only after the migration and environment checks below.

## No-secret policy

Tokens, partner keys, OAuth values and signed URLs are not included in this report or in API response logs.
