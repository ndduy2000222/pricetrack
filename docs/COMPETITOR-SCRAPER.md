# Competitor scraper feed

Price Control does not run a browser scraper inside a Vercel request. A scraper
worker may run separately (for example, a self-hosted instance based on
`omkarcloud/shopee-scraper`) and publish a normalized JSON feed over HTTPS.

Configure up to five approved feeds with:

```text
SHOPEE_COMPETITOR_SOURCE_APPROVED=true
SHOPEE_COMPETITOR_FEED_URL_1=https://scraper.example/alpha-books/competitor-1.json
SHOPEE_COMPETITOR_FEED_NAME_1=Đối thủ 1
...
SHOPEE_COMPETITOR_FEED_URL_5=https://scraper.example/alpha-books/competitor-5.json
SHOPEE_COMPETITOR_FEED_TOKEN_1=<server-only-bearer-token>
...
SHOPEE_COMPETITOR_FEED_TOKEN_5=<server-only-bearer-token>
SHOPEE_COMPETITOR_FEED_NAME_5=Đối thủ 5
```

Each feed returns either an array or `{ "rows": [...] }`. Every row must have
`name`, `shop`, `productUrl`, `price`, `available`, and an ISO-8601
`observedAt`. For reliable book matching, also provide `isbn` or `ean`,
`author`, `publisher`, `edition`, `coverType`, and `volumeOrCombo`.

The service must return the price of the exact listing/model, not a search-page
price. Keep list price, promotion price, shipping and broadly applicable
voucher as separate fields. Price Control rejects stale, unavailable, used,
different-format, or weakly matched rows.

The adapter fetches all configured feeds independently, times out a failed feed,
reports partial failures, and never exposes feed URLs or credentials in the UI.
It does not bypass CAPTCHA, use stealth/proxy evasion, or retry an access-control
challenge. If a source requires an interactive challenge, pause that source and
use a permitted API, owner authorization, or a manual review workflow.

## Stagehand local worker

The repository includes `workers/stagehand-competitor`, a separate Node 22
worker based on the official Browserbase Stagehand SDK. It uses a persistent
local Chrome profile to search the five shop URLs by catalog name, opens the
selected listing, extracts structured fields, and exposes one normalized feed
per shop. It is deliberately outside Vercel Functions because it needs a
long-lived browser and a persisted login profile. Run it on a permitted local
machine/VM, configure `SHOPEE_COMPETITOR_FEED_URL_1..5` to its `/feed/<shop>`
endpoints, and set the matching `SHOPEE_COMPETITOR_FEED_TOKEN_1..5` values.

The worker does not use Affiliate credentials. A traffic-verification page is
reported as an error and is not bypassed; resolve it through a permitted manual
session or switch to an authorized API/feed. Only observations with an exact
ISBN/EAN or sufficiently strong visible title/format evidence are marked
`comparisonEligible`, so weak search candidates remain visible but cannot drive
a price proposal.

## Five-shop discovery pilot

When `SHOPEE_COMPETITOR_SOURCE_APPROVED=true` and no normalized feed URLs are
configured, the admin route can use the official Shopee Affiliate Open API
`productOfferV2` when `SHOPEE_AFFILIATE_APP_ID` and
`SHOPEE_AFFILIATE_SECRET` are present. It searches the first
`SHOPEE_COMPETITOR_DISCOVERY_LIMIT` catalog rows by product name and filters
results into these five configured shops: Omega Plus Books Store, Trạm Đọc HCM,
Nhà Sách Trạm Đọc, Trạm Đọc Books, and Read Station.

This mode is intentionally a discovery layer. Affiliate product offers expose
product-level price, image, shop, item ID, and product URL, but not enough
model/ISBN/edition evidence for a safe book match. The dashboard therefore
shows each of the five shops as `Ứng viên`, `Không khớp`, `Chưa dò`, or
`Đã khớp`; only an exact approved feed row can contribute to the lowest-price,
median, and price proposal calculations.

## Persistent worker

`POST /api/competitors/sync` runs the same five-shop discovery and stores the
normalized result in the Supabase `competitor_offers` table. It requires
`Authorization: Bearer $COMPETITOR_SYNC_SECRET` (or Vercel's `CRON_SECRET`).
The dashboard reads persisted offers first, so opening the dashboard does not
launch a search for every SKU. `apps/admin/vercel.json` schedules the worker
daily at 02:00 UTC; configure the secret, the Supabase server key, approval flag, and
official Affiliate credentials before enabling it in Production.
