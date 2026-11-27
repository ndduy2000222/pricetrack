import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Stagehand, localBrowser } from '@browserbasehq/stagehand'
import { z } from 'zod'

const shops = [
  { key: 'omegaplusvn', name: 'Omega Plus Books Store', handle: 'omegaplusvn', url: 'https://shopee.vn/omegaplusvn' },
  { key: 'tramdochcm', name: 'Trạm Đọc HCM', handle: 'tramdochcm', url: 'https://shopee.vn/tramdochcm' },
  { key: 'tram-doc-read-station', name: 'Nhà Sách Trạm Đọc', handle: 'tram_doc_read_station', url: 'https://shopee.vn/tram_doc_read_station' },
  { key: 'tramdocbooks', name: 'Trạm Đọc Books', handle: 'tramdocbooks', url: 'https://shopee.vn/tramdocbooks' },
  { key: 'readstation-vn', name: 'Read Station', handle: 'readstation.vn', url: 'https://shopee.vn/readstation.vn' }
]

const env = {
  port: Number(process.env.STAGEHAND_PORT || 8787),
  secret: process.env.STAGEHAND_WORKER_SECRET?.trim() || process.env.STAGEHAND_FEED_TOKEN?.trim() || '',
  catalogUrl: process.env.STAGEHAND_CATALOG_URL?.trim() || 'https://alpha-books-price-control.vercel.app/api/catalog?source=stored',
  catalogSecret: process.env.STAGEHAND_CATALOG_SYNC_SECRET?.trim() || '',
  model: process.env.STAGEHAND_MODEL?.trim() || 'openai/gpt-5.4-mini',
  modelKey: process.env.OPENAI_API_KEY?.trim() || process.env.STAGEHAND_MODEL_API_KEY?.trim() || '',
  profileDir: process.env.STAGEHAND_BROWSER_PROFILE_DIR?.trim() || './browser-data',
  dataFile: process.env.STAGEHAND_DATA_FILE?.trim() || './data/competitor-offers.json',
  limit: Math.min(Math.max(Number(process.env.STAGEHAND_LIMIT || 10), 1), 50),
  delayMs: Math.max(Number(process.env.STAGEHAND_DELAY_MS || 1800), 500),
  intervalMs: Math.max(Number(process.env.STAGEHAND_RUN_INTERVAL_MINUTES || 0), 0) * 60_000
}

const searchSchema = z.object({
  products: z.array(z.object({
    name: z.string().nullable(),
    url: z.string().nullable(),
    priceText: z.string().nullable(),
    listPriceText: z.string().nullable(),
    promoPriceText: z.string().nullable(),
    imageUrl: z.string().nullable(),
    variant: z.string().nullable(),
    available: z.boolean().nullable()
  }))
})

const detailSchema = z.object({
  name: z.string().nullable(),
  productUrl: z.string().nullable(),
  priceText: z.string().nullable(),
  listPriceText: z.string().nullable(),
  promoPriceText: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sku: z.string().nullable(),
  isbn: z.string().nullable(),
  ean: z.string().nullable(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  edition: z.string().nullable(),
  coverType: z.string().nullable(),
  volumeOrCombo: z.string().nullable(),
  variant: z.string().nullable(),
  available: z.boolean().nullable(),
  condition: z.string().nullable()
})

let stored = { updatedAt: null, rows: [], shops: [], errors: [] }
let running = false

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const now = () => new Date().toISOString()
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = (value) => new Set(normalize(value).split(/\s+/).filter((token) => token.length > 1))

function similarity(left, right) {
  const a = tokens(left); const b = tokens(right)
  if (!a.size || !b.size) return 0
  let same = 0
  for (const token of a) if (b.has(token)) same += 1
  return same / Math.max(a.size, b.size)
}

function parsePrice(value) {
  if (value == null) return null
  const digits = String(value).replace(/[^0-9]/g, '')
  if (!digits) return null
  const price = Number(digits)
  return Number.isFinite(price) && price > 0 ? price : null
}

function absoluteUrl(value, base) {
  if (!value) return null
  try { return new URL(value, base).toString() } catch { return null }
}

function idsFromUrl(value) {
  if (!value) return {}
  const product = value.match(/\/product\/(\d+)\/(\d+)/)
  const listing = value.match(/\/i\.(\d+)\.(\d+)/)
  const model = value.match(/display_model_id(?:%22|%3A|=|%3D)(\d+)/i) || value.match(/display_model_id["':=]+(\d+)/i)
  return product ? { itemId: product[2], modelId: model?.[1] || null } : listing ? { itemId: listing[2], shopId: listing[1], modelId: model?.[1] || null } : {}
}

function challenge(page) {
  const url = page.url()
  return /\/verify\/traffic|captcha|challenge/i.test(url)
}

async function readCatalog() {
  const headers = { accept: 'application/json' }
  if (env.catalogSecret) headers.authorization = `Bearer ${env.catalogSecret}`
  const response = await fetch(env.catalogUrl, { headers, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`catalog_http_${response.status}`)
  const body = await response.json()
  const rows = Array.isArray(body?.rows) ? body.rows : []
  return rows.filter((row) => row && typeof row.name === 'string').slice(0, env.limit)
}

function extractPrompt(name, own) {
  return `On the current Shopee page, extract visible product cards for the search query "${name}". Return only information visibly present; never guess ISBN, SKU, prices, availability, variants, or URLs. Use absolute product URLs. Keep list price and promotion price separate, do not subtract vouchers, and leave unknown fields null. The target is a book and the Alpha catalog reference is: ${JSON.stringify({ title: own.name, isbn: own.isbn, ean: own.ean, modelName: own.modelName, volumeOrCombo: own.volumeOrCombo })}.`
}

async function searchShop(stagehand, page, shop, own) {
  const searchUrl = `${shop.url}?keyword=${encodeURIComponent(own.name)}`
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35_000 })
  await sleep(1200)
  if (challenge(page)) throw new Error('traffic_challenge')
  const extracted = await stagehand.extract(extractPrompt(own.name, own), searchSchema)
  const candidates = extracted.data.products
    .map((item) => ({ ...item, url: absoluteUrl(item.url, page.url()), score: similarity(own.name, item.name) }))
    .filter((item) => item.url && item.name && item.score >= 0.55)
    .sort((a, b) => b.score - a.score)
  const candidate = candidates[0]
  if (!candidate?.url) return null

  await page.goto(candidate.url, { waitUntil: 'domcontentloaded', timeout: 35_000 })
  await sleep(900)
  if (challenge(page)) throw new Error('traffic_challenge')
  const detail = await stagehand.extract('Extract the exact visible product detail for this listing. Do not guess anything; return null for missing values. Use the selected variant shown on the page, keep list and promotion prices separate, exclude vouchers and shipping, and mark available false only when the page explicitly shows sold out/unavailable.', detailSchema)
  const value = detail.data
  const url = absoluteUrl(value.productUrl, page.url()) || candidate.url
  const price = parsePrice(value.promoPriceText) ?? parsePrice(value.priceText) ?? parsePrice(candidate.promoPriceText) ?? parsePrice(candidate.priceText)
  if (price === null) return null

  const detailTitle = value.name || candidate.name
  const isbnMatch = own.isbn && value.isbn && normalize(own.isbn) === normalize(value.isbn)
  const eanMatch = own.ean && value.ean && normalize(own.ean) === normalize(value.ean)
  const titleMatch = similarity(own.name, detailTitle) >= 0.9
  const variantMatch = !own.modelName && !own.volumeOrCombo || similarity(`${own.modelName || ''} ${own.volumeOrCombo || ''}`, `${value.variant || ''} ${value.volumeOrCombo || ''}`) >= 0.75
  const comparisonEligible = Boolean(isbnMatch || eanMatch || (titleMatch && variantMatch))
  const ids = idsFromUrl(url)
  return {
    shopKey: shop.key,
    shop: shop.name,
    sourceRowKey: `${own.itemId}:${own.modelId}`,
    itemId: ids.itemId || null,
    modelId: ids.modelId || null,
    sku: value.sku || null,
    name: detailTitle,
    isbn: value.isbn || null,
    ean: value.ean || null,
    author: value.author || null,
    publisher: value.publisher || null,
    edition: value.edition || null,
    coverType: value.coverType || null,
    volumeOrCombo: value.volumeOrCombo || value.variant || candidate.variant || null,
    imageUrl: absoluteUrl(value.imageUrl, page.url()) || absoluteUrl(candidate.imageUrl, page.url()),
    price,
    listPrice: parsePrice(value.listPriceText) ?? parsePrice(candidate.listPriceText),
    promoPrice: parsePrice(value.promoPriceText) ?? parsePrice(candidate.promoPriceText),
    available: value.available === true || candidate.available === true,
    comparisonEligible,
    condition: value.condition || null,
    productUrl: url,
    observedAt: now(),
    priceBasis: value.promoPriceText || candidate.promoPriceText ? 'Giá khuyến mãi công khai, chưa trừ voucher' : 'Giá niêm yết công khai',
    matchEvidence: isbnMatch ? 'ISBN chính xác' : eanMatch ? 'EAN chính xác' : titleMatch && variantMatch ? 'Tên và quy cách hiển thị khớp' : 'Ứng viên theo tên, cần duyệt'
  }
}

async function runOnce() {
  if (running) throw new Error('run_in_progress')
  if (!env.modelKey) throw new Error('OPENAI_API_KEY_not_configured')
  running = true
  const startedAt = now()
  const rows = []
  const statuses = []
  let browser
  let stagehand
  try {
    const catalog = await readCatalog()
    browser = await localBrowser.launch({ userDataDir: env.profileDir, headless: false })
    stagehand = await Stagehand.create({ browser, model: { modelName: env.model, apiKey: env.modelKey } })
    const pages = await browser.context.pages()
    const page = pages[0] || await browser.context.newPage()
    for (const shop of shops) {
      let count = 0
      let error = null
      for (const own of catalog) {
        try {
          const row = await searchShop(stagehand, page, shop, own)
          if (row) { rows.push(row); count += 1 }
        } catch (cause) {
          error = cause instanceof Error ? cause.message : 'search_failed'
          if (error === 'traffic_challenge') break
        }
        await sleep(env.delayMs)
      }
      statuses.push({ key: shop.key, name: shop.name, status: error ? 'error' : count ? 'live' : 'no_results', resultCount: count, error })
    }
    stored = { updatedAt: startedAt, rows, shops: statuses, errors: statuses.filter((shop) => shop.error).map((shop) => `${shop.key}:${shop.error}`) }
    await fs.mkdir(path.dirname(env.dataFile), { recursive: true })
    await fs.writeFile(env.dataFile, JSON.stringify(stored, null, 2), 'utf8')
    return { startedAt, finishedAt: now(), catalogRows: catalog.length, rows: rows.length, shops: statuses }
  } finally {
    try { await stagehand?.close() } catch {}
    try { await browser?.close() } catch {}
    running = false
  }
}

async function loadData() {
  try { stored = JSON.parse(await fs.readFile(env.dataFile, 'utf8')) } catch { /* first run */ }
}

function authorized(request) {
  if (!env.secret) return true
  return request.headers.authorization === `Bearer ${env.secret}`
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function handle(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (url.pathname === '/health' && request.method === 'GET') return json(response, 200, { status: 'ok', running, updatedAt: stored.updatedAt, rows: stored.rows.length, shops: stored.shops, errors: stored.errors })
  if (!authorized(request)) return json(response, 401, { status: 'unauthorized' })
  if (url.pathname === '/run' && request.method === 'POST') {
    try { return json(response, 200, { status: 'ok', result: await runOnce() }) } catch (error) { return json(response, 502, { status: 'error', message: error instanceof Error ? error.message : 'run_failed' }) }
  }
  if (url.pathname.startsWith('/feed/') && request.method === 'GET') {
    const key = url.pathname.slice('/feed/'.length)
    const shop = shops.find((item) => item.key === key)
    if (!shop) return json(response, 404, { status: 'not_found' })
    return json(response, 200, { rows: stored.rows.filter((row) => row.shopKey === key) })
  }
  return json(response, 404, { status: 'not_found' })
}

await loadData()
if (process.argv.includes('--login')) {
  const browser = await localBrowser.launch({ userDataDir: env.profileDir, headless: false })
  const pages = await browser.context.pages()
  const page = pages[0] || await browser.context.newPage()
  await page.goto('https://shopee.vn', { waitUntil: 'domcontentloaded' })
  console.log('Chrome profile opened. Complete any permitted sign-in manually, then press Enter here.')
  process.stdin.setEncoding('utf8')
  process.stdin.once('data', async () => { await browser.close(); process.exit(0) })
} else {
  const server = http.createServer((request, response) => { handle(request, response).catch((error) => json(response, 500, { status: 'error', message: error instanceof Error ? error.message : 'request_failed' })) })
  server.listen(env.port, () => console.log(`stagehand_worker_listening port=${env.port}`))
  if (process.argv.includes('--once') || process.env.STAGEHAND_RUN_ON_START === 'true') runOnce().then((result) => console.log(JSON.stringify(result))).catch((error) => console.error(error instanceof Error ? error.message : 'run_failed'))
  if (env.intervalMs > 0) setInterval(() => runOnce().then((result) => console.log(JSON.stringify(result))).catch((error) => console.error(error instanceof Error ? error.message : 'run_failed')), env.intervalMs)
}
