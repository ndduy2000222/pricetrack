# Price Track Project (inprogress)

![GitHub top language](https://img.shields.io/github/languages/top/duyetdev/pricetrack?style=flat-square)
![Website](https://img.shields.io/website/https/tracker.duyet.net?style=flat-square)
![Uptime Robot ratio (7 days)](https://img.shields.io/uptimerobot/ratio/7/m783954368-3c5526c1e57d14f0eb83e7a4?label=uptime%20%28pricetrack.web.app%29)

![Deploy Functions](https://github.com/duyetdev/pricetrack/workflows/Deploy%20Functions/badge.svg)
![Deploy Hostings](https://github.com/duyetdev/pricetrack/workflows/Deploy%20Hostings/badge.svg)

Auto collect, visualize and alert for product items.

**Live**: [https://pricetrack.web.app](https://pricetrack.web.app) or [https://tracker.duyet.net](https://tracker.duyet.net)

**Support**

<a href="https://s.duyet.net/r/patreon"><img src="https://c5.patreon.com/external/logo/become_a_patron_button@2x.png" width="160"></a>

![Home page](.screenshot/screenshot-home.png)
![Home page](.screenshot/screenshot-detail.png)
![Home page](.screenshot/screenshot-cashback.png)
![Home page](.screenshot/screenshot-about.png)
![Raw API](.screenshot/intro-raw-api.png)


# Installation

1. **Set up Node.js and the Firebase CLI**
	You'll need a Node.js environment. This project is written with Nodejs 8.x.
	After that, install the Firebase CLI via npm:

	```
	npm install -g firebase-tools
	```

	To initialize project: Run `firebase login` to log in via the browser and authenticate the firebase tool.

	Setup packages: `cd functions/ && npm install`

2. Go to https://console.firebase.google.com and create new project.

3. Setup env variables, copy and modify `env.example.sh` to `env.local.sh`
	```
	firebase functions:config:set pricetrack.sentry_dsn=https://abc@sentry.io/1362210
	firebase functions:config:set pricetrack.cronjob_key=696969
	firebase functions:config:set pricetrack.api_key=xxxxxxooooooKMgWKRhUdY91
	firebase functions:config:set pricetrack.admin_token=xxxxxxxxxx
	firebase functions:config:set pricetrack.gmail_email=pricetrack.apps@gmail.com
	firebase functions:config:set pricetrack.gmail_password=xxxxxxxxxx
	firebase functions:config:set pricetrack.hosting_url=https://tracker.duyet.net
	firebase functions:config:set pricetrack.accesstrade_deeplink_base=https://fast.accesstrade.com.vn/deep_link/4557459014401077484
	firebase functions:config:set pricetrack.admin_email=lvduit08@gmail.com
	firebase functions:config:set pricetrack.worker_custom_domain=
	```

	Run: `bash ./env.local.sh`

3. Test in local: https://firebase.google.com/docs/functions/local-emulator
	- Export local configs: `firebase functions:config:get > functions/.runtimeconfig.json`
	- Start firebase: `firebase serve`
	- Start hosting local: `cd hosting && npm run develop`
	- Open UI: http://localhost:8000

4. **Deploy serverless functions and hosting to Firebase**
	```
	firebase deploy
	```

	You can also start this project locally via: `firebase serve`

	All functions will be list at Firebase Dashboard:

	![Firebase Dashboard](.screenshot/setup-dashboard-functions.png)

5. **Test your API**
	
	Add new URL: `https://<your-project>.cloudfunctions.net/addUrl?url=<your-url>`

	![Test API](.screenshot/setup-test-1.png)

	List: `https://<your-project>.cloudfunctions.net/listUrls`

	![Test API](.screenshot/setup-test-2.png)

	Pull data: `https://<your-project>.cloudfunctions.net/pullData?url=<your-url>`

	![Test API](.screenshot/setup-test-3.png)

	Query in raw data: `https://<your-project>.cloudfunctions.net/query?url=<your-url>&fields=datetime,price&limit=100`

	![Test API](.screenshot/setup-test-4.png)


6. Check out the UI: https://tracker.duyet.net

	![Home page](.screenshot/screenshot-home.png)

# Technology

- UI Website for result (Gatsby.js, React.js)
- Cronjob: Firebase Cloud Scheduler
- Deployment:
	+ API: Firebase Functions
	+ Database: Firebase Firestore
	+ Web: Firebase Hosting, GatsbyJS
- CICD: Github Workflows

# Next Step

- Support for more ecommerce websites.
- Move worker `pullData` to another services (`worker.dev`, Google App Scripts, ...) to reduce cost.
- Auto trigger `BUY`, `Add to cart`, ...

# Alpha Books price control

The `feat/alpha-books-price-control` branch adds a guarded price-control vertical slice for one Alpha Books Shopee shop. It includes the pricing engine, worker write-gates, Supabase schema, and a responsive admin preview.

## Local preview

```powershell
cd apps/admin
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The preview is intentionally labelled as simulated data until the Shopee and Supabase integrations are validated.

## Shopee SKU price tracking

Copy `apps/admin/.env.example` to `apps/admin/.env.local`, fill the server-only Shopee credentials, and set `SHOPEE_TRACKED_SKUS` as comma-separated `item_id:model_id` pairs. The admin route `/api/sku-prices` reads the current model price through Shopee Open API and refreshes the dashboard every 30 seconds. This is polling, not a WebSocket feed.

The API client is read-only. Price writes remain disabled until the authorization, permission, one-SKU dry run, and read-back checks in `docs/INTEGRATION-VALIDATION.md` are completed.

To read one SKU directly, call:

```text
GET https://alpha-books-price-control.vercel.app/api/products/price?item_id=<ITEM_ID>&model_id=<MODEL_ID>
```

## Validation commands

```powershell
cd packages/pricing-engine
pnpm test

cd ../../worker-functions
node --test test/price-control.test.js

cd ../apps/admin
pnpm lint
pnpm build
```

See [`docs/PRD.md`](docs/PRD.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and [`docs/INTEGRATION-VALIDATION.md`](docs/INTEGRATION-VALIDATION.md) for scope, safety gates, and the current integration status.
