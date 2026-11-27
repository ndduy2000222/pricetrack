# Stagehand competitor worker

This worker is the browser-based discovery layer for Alpha Books Price Control.
It uses the official Stagehand SDK with a local persistent Chrome profile to
search the five approved Shopee shops by the Alpha catalog product name. It
stores only normalized observations: shop, item/model IDs when present, title,
image, list/promotion price, availability, URL and observation time.

The worker does not change prices, use Affiliate credentials, bypass CAPTCHA,
use stealth/proxies, or treat a search-card result as a confirmed book match.
If Shopee presents a traffic-verification or access challenge, that shop is
marked as blocked for the run and the worker stops using it until a permitted
manual/API path is available.

## Setup

```powershell
cd workers/stagehand-competitor
Copy-Item .env.example .env
npm install
```

Set `OPENAI_API_KEY` for the Stagehand SDK and point `STAGEHAND_CATALOG_URL`
at the production catalog route. If that route is protected, set
`STAGEHAND_CATALOG_SYNC_SECRET`. No Affiliate key is needed.

## First login

Run `npm run login`. Chrome opens with the persistent profile from
`STAGEHAND_BROWSER_PROFILE_DIR`. Sign in manually if required, return to the
terminal and press Enter. The cookies remain in that profile for later runs.

## Run and expose feeds

```powershell
npm run run
npm start
```

The server exposes:

- `GET /health`
- `GET /feed/<shop-key>` (Bearer token required when configured)
- `POST /run` (Bearer token required when configured)

Configure the Vercel app with one feed URL per shop:

```text
SHOPEE_COMPETITOR_SOURCE_APPROVED=true
SHOPEE_COMPETITOR_FEED_URL_1=https://worker.example/feed/omegaplusvn
...
SHOPEE_COMPETITOR_FEED_URL_5=https://worker.example/feed/readstation-vn
SHOPEE_COMPETITOR_FEED_TOKEN_1=<same worker token>
...
SHOPEE_COMPETITOR_FEED_TOKEN_5=<same worker token>
```

The worker must be hosted on a machine/service that can keep Chrome running;
it cannot be deployed as a normal Vercel Function. Vercel reads the normalized
feeds and persists them through the existing `competitor_offers` pipeline.
