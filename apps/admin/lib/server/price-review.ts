import type { CatalogRow } from './catalog'
import { isPastOrPresentObservation, numberOrNull } from './price-integrity'
import type { CompetitorComparison } from '../mock-data'
import { affiliateConfigured, searchAffiliateProducts, type AffiliateProductOffer } from './shopee-affiliate'
import { supabaseHeaders } from './supabase-http'

export type CompetitorRow = {
  shopKey?: string
  sourceRowKey?: string
  itemId?: string
  modelId?: string
  sku?: string
  name: string
  isbn?: string
  ean?: string
  author?: string
  publisher?: string
  edition?: string
  coverType?: string
  volumeOrCombo?: string
  shop: string
  price: number
  listPrice?: number
  promoPrice?: number
  shipping?: number
  voucher?: number
  shippingGenerallyApplicable?: boolean
  voucherGenerallyApplicable?: boolean
  available: boolean
  comparisonEligible?: boolean
  condition?: string
  imageUrl?: string
  imageId?: string
  productUrl: string
  observedAt: string
  priceBasis?: string
}

type CompetitorShopProfile = { key: string, name: string, handle: string, shopUrl: string, aliases: string[] }
export type CompetitorShopStatus = { key: string, name: string, handle: string, shopUrl: string, status: 'live' | 'no_results' | 'not_configured' | 'error', resultCount: number, error: string | null }
export type CompetitorDiscoveryScope = { mode: 'feed' | 'affiliate_keyword' | 'none', requestedRows: number, totalRows: number, limited: boolean, rowKeys: string[] }
export type CompetitorFeedResult = { status: 'not_configured' | 'live' | 'partial' | 'error', source: string, sourceName: string, rows: CompetitorRow[], errors: string[], shops: CompetitorShopStatus[], scope: CompetitorDiscoveryScope }

const defaultCompetitorShops: CompetitorShopProfile[] = [
  { key: 'omegaplusvn', name: 'Omega Plus Books Store', handle: 'omegaplusvn', shopUrl: 'https://shopee.vn/omegaplusvn', aliases: ['omega plus', 'omegaplusvn', 'nhà sách omega plus', 'omega plus books store'] },
  { key: 'tramdochcm', name: 'Trạm Đọc HCM', handle: 'tramdochcm', shopUrl: 'https://shopee.vn/tramdochcm', aliases: ['trạm đọc hcm', 'tramdochcm'] },
  { key: 'tram-doc-read-station', name: 'Nhà Sách Trạm Đọc', handle: 'tram_doc_read_station', shopUrl: 'https://shopee.vn/tram_doc_read_station', aliases: ['nhà sách trạm đọc', 'trạm đọc', 'tram doc read station'] },
  { key: 'tramdocbooks', name: 'Trạm Đọc Books', handle: 'tramdocbooks', shopUrl: 'https://shopee.vn/tramdocbooks', aliases: ['trạm đọc books', 'tramdocbooks'] },
  { key: 'readstation-vn', name: 'Read Station', handle: 'readstation.vn', shopUrl: 'https://shopee.vn/readstation.vn', aliases: ['read station', 'readstation', 'readstation.vn'] }
]

export function competitorShopProfiles (): CompetitorShopProfile[] {
  return defaultCompetitorShops.map((shop, index) => ({
    ...shop,
    name: process.env[`SHOPEE_COMPETITOR_SHOP_NAME_${index + 1}`]?.trim() || shop.name,
    aliases: [...shop.aliases, process.env[`SHOPEE_COMPETITOR_SHOP_NAME_${index + 1}`]?.trim() || ''].filter(Boolean)
  }))
}

export type ReviewRow = {
  sku: string | null
  itemId: string
  modelId: string
  name: string | null
  modelName: string | null
  isbn: string | null
  ean: string | null
  author: string | null
  publisher: string | null
  edition: string | null
  coverType: string | null
  volumeOrCombo: string | null
  stock: number | null
  productUrl: string
  imageUrl: string | null
  imageId: string | null
  imageSource: 'model' | 'product' | null
  ownObservedAt: string
  ownPrice: number | null
  competitorPrice: number | null
  competitorListPrice: number | null
  competitorPromoPrice: number | null
  competitorShipping: number | null
  competitorVoucher: number | null
  competitorShop: string | null
  competitorName: string | null
  competitorModelId: string | null
  competitorSku: string | null
  competitorVariant: string | null
  competitorUrl: string | null
  competitorObservedAt: string | null
  competitorPriceBasis: string | null
  competitorSource: string
  competitorSourceName: string
  confidence: number | null
  confidenceReason: string
  validCompetitorCount: number
  competitorLowestPrice: number | null
  competitorMedianPrice: number | null
  competitorComparisons: CompetitorComparison[]
  priceDifference: number | null
  targetPrice: number | null
  reductionVnd: number | null
  reductionPercent: number | null
  floorPrice: number | null
  expectedProfit: number | null
  status: 'proposal' | 'needs_review' | 'simulation' | 'blocked'
  reason: string
}

const normalize = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const tokens = (value: string | null | undefined) => new Set(normalize(value).split(/\s+/).filter((token) => token.length > 1))
const similarity = (a: string | null | undefined, b: string | null | undefined) => {
  const left = tokens(a); const right = tokens(b); if (!left.size || !right.size) return 0
  let same = 0; left.forEach((token) => { if (right.has(token)) same += 1 })
  return same / Math.max(left.size, right.size)
}
const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && normalize(a) === normalize(b))
const differsWhenBothPresent = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && !same(a, b))
const shopMatches = (offer: AffiliateProductOffer, profile: CompetitorShopProfile) => {
  if (profile.key === offer.shopId || profile.handle === offer.shopId) return true
  const name = normalize(offer.shopName)
  return Boolean(name && profile.aliases.some((alias) => name.includes(normalize(alias)) || normalize(alias).includes(name)))
}

function comparablePrice (competitor: CompetitorRow) {
  const base = numberOrNull(competitor.promoPrice) ?? numberOrNull(competitor.price)
  if (base === null) return null
  const shipping = competitor.shippingGenerallyApplicable ? (numberOrNull(competitor.shipping) ?? 0) : 0
  const voucher = competitor.voucherGenerallyApplicable ? (numberOrNull(competitor.voucher) ?? 0) : 0
  const comparable = base + shipping - voucher
  return Number.isFinite(comparable) && comparable > 0 ? comparable : null
}

function match (own: CatalogRow, candidate: CompetitorRow) {
  if (!candidate.available || normalize(candidate.condition) && normalize(candidate.condition) !== 'new') return { confidence: 0, reason: 'Hết hàng hoặc không phải hàng mới' }
  if (candidate.comparisonEligible === false) return { confidence: 0, reason: 'Ứng viên từ tìm kiếm tên; chưa có ISBN/model/phiên bản để so sánh chính thức' }
  if (differsWhenBothPresent(own.coverType, candidate.coverType) || differsWhenBothPresent(own.volumeOrCombo, candidate.volumeOrCombo)) return { confidence: 0, reason: 'Cùng mã nhưng khác loại bìa hoặc quy cách' }
  if (own.isbn && candidate.isbn && normalize(own.isbn) === normalize(candidate.isbn)) return { confidence: 0.99, reason: 'Khớp ISBN chính xác và cùng quy cách' }
  if (own.ean && candidate.ean && normalize(own.ean) === normalize(candidate.ean)) return { confidence: 0.98, reason: 'Khớp EAN chính xác và cùng quy cách' }
  const title = similarity(own.name, candidate.name)
  const author = same(own.author, candidate.author)
  const publisher = same(own.publisher, candidate.publisher)
  const edition = !own.edition || !candidate.edition || same(own.edition, candidate.edition)
  const cover = !own.coverType || !candidate.coverType || same(own.coverType, candidate.coverType)
  const volume = !own.volumeOrCombo || !candidate.volumeOrCombo || same(own.volumeOrCombo, candidate.volumeOrCombo)
  if (title >= 0.9 && author && publisher && edition && cover && volume) return { confidence: 0.92 + Math.min(0.06, (title - 0.9) * 0.6), reason: 'Khớp tên, tác giả, NXB và quy cách' }
  return { confidence: 0, reason: 'Không đủ bằng chứng để ghép cùng sản phẩm' }
}

function config () {
  const costs = (() => { try { return JSON.parse(process.env.PRICE_COSTS_JSON ?? '{}') as Record<string, number> } catch { return {} } })()
  const fee = numberOrNull(process.env.PRICE_PLATFORM_FEE_PERCENT)
  const operations = numberOrNull(process.env.PRICE_OPERATION_COST_VND)
  const margin = numberOrNull(process.env.PRICE_MIN_MARGIN_VND)
  const bufferAmount = numberOrNull(process.env.PRICE_BUFFER_AMOUNT_VND)
  const bufferPercent = numberOrNull(process.env.PRICE_BUFFER_PERCENT)
  const maxAgeMinutes = numberOrNull(process.env.PRICE_COMPETITOR_MAX_AGE_MINUTES) ?? 60
  return { costs, fee, operations, margin, bufferAmount, bufferPercent, maxAgeMinutes }
}

type BuildReviewOptions = { shops?: CompetitorShopStatus[], scope?: CompetitorDiscoveryScope }

function comparisonForShop (own: CatalogRow, shop: CompetitorShopStatus, competitors: CompetitorRow[], discoveryAttempted: boolean, now: number, maxAgeMinutes: number): CompetitorComparison {
  const candidates = competitors
    .filter((candidate) => (!candidate.sourceRowKey || candidate.sourceRowKey === `${own.itemId}:${own.modelId}`) && (candidate.shopKey === shop.key || (!candidate.shopKey && normalize(candidate.shop) === normalize(shop.name))))
    .map((candidate) => ({ candidate, match: match(own, candidate), price: comparablePrice(candidate), observedAt: Date.parse(candidate.observedAt) }))
    .filter((entry) => entry.price !== null && Number.isFinite(entry.observedAt))
  const fresh = candidates.filter((entry) => isPastOrPresentObservation(entry.observedAt, now) && now - entry.observedAt <= maxAgeMinutes * 60_000).sort((a, b) => (a.price as number) - (b.price as number))
  const valid = fresh.filter((entry) => entry.match.confidence > 0)
  const entry = valid[0] ?? fresh[0]
  if (valid[0]) {
    const { candidate, match: matched, price } = valid[0]
    return { shopKey: shop.key, shop: shop.name, shopUrl: shop.shopUrl, name: candidate.name, variant: candidate.volumeOrCombo ?? candidate.coverType ?? null, sku: candidate.sku ?? null, modelId: candidate.modelId ?? null, imageUrl: candidate.imageUrl ?? null, listPrice: numberOrNull(candidate.listPrice), promoPrice: numberOrNull(candidate.promoPrice), shipping: numberOrNull(candidate.shipping), voucher: numberOrNull(candidate.voucher), comparablePrice: price, url: candidate.productUrl, observedAt: candidate.observedAt, priceBasis: candidate.priceBasis ?? null, confidence: matched.confidence, confidenceReason: matched.reason, status: 'matched', reason: matched.reason }
  }
  if (entry) {
    const { candidate, match: matched, price } = entry
    return { shopKey: shop.key, shop: shop.name, shopUrl: shop.shopUrl, name: candidate.name, variant: candidate.volumeOrCombo ?? candidate.coverType ?? null, sku: candidate.sku ?? null, modelId: candidate.modelId ?? null, imageUrl: candidate.imageUrl ?? null, listPrice: numberOrNull(candidate.listPrice), promoPrice: numberOrNull(candidate.promoPrice), shipping: numberOrNull(candidate.shipping), voucher: numberOrNull(candidate.voucher), comparablePrice: price, url: candidate.productUrl, observedAt: candidate.observedAt, priceBasis: candidate.priceBasis ?? null, confidence: 0, confidenceReason: matched.reason, status: 'candidate', reason: matched.reason }
  }
  const status = !discoveryAttempted ? 'not_checked' : shop.status === 'not_configured' ? 'not_configured' : shop.status === 'error' ? 'error' : candidates.length ? 'stale' : 'no_match'
  const reason = !discoveryAttempted ? 'Chưa chạy dò trong phạm vi thử nghiệm' : shop.status === 'not_configured' ? 'Nguồn shop chưa cấu hình' : shop.status === 'error' ? 'Nguồn shop lỗi hoặc bị từ chối' : candidates.length ? 'Giá đã cũ' : 'Không tìm thấy sản phẩm khớp'
  return { shopKey: shop.key, shop: shop.name, shopUrl: shop.shopUrl, name: null, variant: null, sku: null, modelId: null, imageUrl: null, listPrice: null, promoPrice: null, shipping: null, voucher: null, comparablePrice: null, url: shop.shopUrl, observedAt: null, priceBasis: null, confidence: null, confidenceReason: reason, status, reason }
}

export function buildReview (catalog: CatalogRow[], competitors: CompetitorRow[], options: BuildReviewOptions = {}) {
  const settings = config(); const now = Date.now()
  const shops = options.shops?.length ? options.shops : competitorShopProfiles().map((shop) => ({ ...shop, status: 'not_configured' as const, resultCount: 0, error: null }))
  return catalog.map((own): ReviewRow => {
    const key = `${own.itemId}:${own.modelId}`
    const discoveryAttempted = !options.scope || options.scope.rowKeys.includes(key)
    const discoveredCompetitors = discoveryAttempted ? competitors : []
    const candidates = discoveredCompetitors.map((candidate) => ({ candidate, match: match(own, candidate), price: comparablePrice(candidate), observedAt: Date.parse(candidate.observedAt) })).filter((entry) => entry.match.confidence > 0 && entry.price !== null && Number.isFinite(entry.observedAt) && isPastOrPresentObservation(entry.observedAt, now) && now - entry.observedAt <= settings.maxAgeMinutes * 60_000)
    const ordered = candidates.sort((a, b) => (a.price as number) - (b.price as number)); const chosen = ordered[0]
    const prices = ordered.map((entry) => entry.price as number); const lowest = prices[0] ?? null; const median = prices.length ? prices.length % 2 ? prices[Math.floor(prices.length / 2)] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2 : null
    const cost = numberOrNull(settings.costs[own.sku ?? '']); const fee = settings.fee; const operations = settings.operations; const margin = settings.margin
    const floor = cost !== null && fee !== null && fee >= 0 && fee < 100 && operations !== null && margin !== null ? Math.ceil((cost + operations + margin) / (1 - fee / 100)) : null
    const target = lowest !== null && (settings.bufferAmount !== null || settings.bufferPercent !== null) ? Math.max(0, Math.floor(lowest - (settings.bufferAmount ?? lowest * (settings.bufferPercent ?? 0) / 100))) : null
    const proposed = target !== null && floor !== null ? Math.max(target, floor) : null
    const expectedProfit = proposed !== null && cost !== null && fee !== null && operations !== null ? Math.round(proposed * (1 - fee / 100) - cost - operations) : null
    const status = !chosen ? 'simulation' : proposed === null ? 'simulation' : floor === null ? 'simulation' : proposed < (own.currentPrice ?? 0) ? 'proposal' : 'needs_review'
    const reason = !discoveryAttempted ? 'Chưa chạy đối chiếu đối thủ cho SKU này trong phạm vi thử nghiệm' : !chosen ? (competitors.length ? 'Không có đối thủ hợp lệ/khớp chắc chắn hoặc dữ liệu đã cũ' : 'Chưa cấu hình nguồn dữ liệu đối thủ được phép') : proposed === null ? 'Chưa đủ dữ liệu kinh doanh hoặc quy tắc giảm; chỉ mô phỏng' : floor !== null && target !== null && target < floor ? 'Giá mục tiêu bị chặn bởi giá sàn' : 'Đủ dữ liệu để xem xét đề xuất'
    const competitorComparisons = shops.map((shop) => comparisonForShop(own, shop, discoveredCompetitors, discoveryAttempted, now, settings.maxAgeMinutes))
    return { sku: own.sku, itemId: own.itemId, modelId: own.modelId, name: own.name, modelName: own.modelName, isbn: own.isbn, ean: own.ean, author: own.author, publisher: own.publisher, edition: own.edition, coverType: own.coverType, volumeOrCombo: own.volumeOrCombo, stock: own.stock, productUrl: own.productUrl, imageUrl: own.imageUrl, imageId: own.imageId, imageSource: own.imageSource, ownObservedAt: own.observedAt, ownPrice: own.currentPrice, competitorPrice: chosen?.price ?? null, competitorListPrice: chosen?.candidate.listPrice ?? null, competitorPromoPrice: chosen?.candidate.promoPrice ?? null, competitorShipping: chosen?.candidate.shipping ?? null, competitorVoucher: chosen?.candidate.voucher ?? null, competitorShop: chosen?.candidate.shop ?? null, competitorName: chosen?.candidate.name ?? null, competitorModelId: chosen?.candidate.modelId ?? null, competitorSku: chosen?.candidate.sku ?? null, competitorVariant: chosen?.candidate.volumeOrCombo ?? chosen?.candidate.coverType ?? null, competitorUrl: chosen?.candidate.productUrl ?? null, competitorObservedAt: chosen?.candidate.observedAt ?? null, competitorPriceBasis: chosen ? (chosen.candidate.priceBasis ?? 'Giá khuyến mãi/niêm yết; cộng phí và trừ voucher chỉ khi áp dụng chung') : null, competitorSource: 'unknown', competitorSourceName: 'unknown', confidence: chosen?.match.confidence ?? null, confidenceReason: chosen?.match.reason ?? 'Chưa có kết quả ghép', validCompetitorCount: prices.length, competitorLowestPrice: lowest, competitorMedianPrice: median, competitorComparisons, priceDifference: own.currentPrice !== null && lowest !== null ? own.currentPrice - lowest : null, targetPrice: proposed, reductionVnd: own.currentPrice !== null && proposed !== null ? Math.max(0, own.currentPrice - proposed) : null, reductionPercent: own.currentPrice !== null && proposed !== null && own.currentPrice > 0 ? Math.max(0, (own.currentPrice - proposed) / own.currentPrice * 100) : null, floorPrice: floor, expectedProfit, status, reason }
  })
}

type CompetitorFeedConfig = { url: string, name: string, index: number, profile: CompetitorShopProfile, token: string | null }
type CompetitorFeedOptions = { forceDiscovery?: boolean }

function feedConfigs (profiles: CompetitorShopProfile[]): CompetitorFeedConfig[] {
  return profiles.flatMap((profile, index) => {
    const url = process.env[`SHOPEE_COMPETITOR_FEED_URL_${index + 1}`]?.trim()
    const token = process.env[`SHOPEE_COMPETITOR_FEED_TOKEN_${index + 1}`]?.trim() || process.env.SHOPEE_COMPETITOR_FEED_TOKEN?.trim() || null
    return url ? [{ url, name: process.env[`SHOPEE_COMPETITOR_FEED_NAME_${index + 1}`]?.trim() || profile.name, index: index + 1, profile, token }] : []
  })
}

function safeFeedUrl (value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')
  } catch { return false }
}

function feedRows (body: unknown, fallbackShop: string, fallbackShopKey: string): CompetitorRow[] {
  const bodyRecord = body && typeof body === 'object' ? body as { rows?: unknown } : {}
  const rows: unknown[] = Array.isArray(body) ? body : Array.isArray(bodyRecord.rows) ? bodyRecord.rows : []
  return rows.filter((row): row is Record<string, unknown> => {
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : null
    return Boolean(record && typeof record.name === 'string' && typeof record.productUrl === 'string' && numberOrNull(record.price) !== null && typeof record.observedAt === 'string' && isPastOrPresentObservation(record.observedAt))
  }).map((row) => ({ ...row, shopKey: fallbackShopKey, shop: typeof row.shop === 'string' && row.shop ? row.shop : fallbackShop, price: numberOrNull(row.price) as number, available: row.available === true, listPrice: numberOrNull(row.listPrice) ?? undefined, promoPrice: numberOrNull(row.promoPrice) ?? undefined, imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : undefined, imageId: typeof row.imageId === 'string' ? row.imageId : undefined }) as CompetitorRow)
}

function competitorSupabaseConfig () {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? ''
  return url && key ? { url, key } : null
}

function storedCompetitorRow (value: unknown): CompetitorRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.shop_key !== 'string' || typeof row.name !== 'string' || typeof row.product_url !== 'string' || typeof row.observed_at !== 'string' || !isPastOrPresentObservation(row.observed_at)) return null
  const price = numberOrNull(row.price)
  if (price === null) return null
  return {
    shopKey: row.shop_key,
    sourceRowKey: typeof row.source_row_key === 'string' ? row.source_row_key : undefined,
    itemId: typeof row.item_id === 'string' ? row.item_id : undefined,
    modelId: typeof row.model_id === 'string' ? row.model_id : undefined,
    sku: typeof row.sku === 'string' ? row.sku : undefined,
    name: row.name,
    isbn: typeof row.isbn === 'string' ? row.isbn : undefined,
    ean: typeof row.ean === 'string' ? row.ean : undefined,
    author: typeof row.author === 'string' ? row.author : undefined,
    publisher: typeof row.publisher === 'string' ? row.publisher : undefined,
    edition: typeof row.edition === 'string' ? row.edition : undefined,
    coverType: typeof row.cover_type === 'string' ? row.cover_type : undefined,
    volumeOrCombo: typeof row.volume_or_combo === 'string' ? row.volume_or_combo : undefined,
    shop: typeof row.shop_name === 'string' ? row.shop_name : row.shop_key,
    price,
    listPrice: numberOrNull(row.list_price) ?? undefined,
    promoPrice: numberOrNull(row.promo_price) ?? undefined,
    shipping: numberOrNull(row.shipping) ?? undefined,
    voucher: numberOrNull(row.voucher) ?? undefined,
    available: row.available === true,
    comparisonEligible: row.comparison_eligible === true,
    condition: typeof row.condition === 'string' ? row.condition : undefined,
    imageUrl: typeof row.image_url === 'string' ? row.image_url : undefined,
    imageId: typeof row.image_id === 'string' ? row.image_id : undefined,
    productUrl: row.product_url,
    observedAt: row.observed_at,
    priceBasis: typeof row.price_basis === 'string' ? row.price_basis : undefined
  }
}

async function readStoredCompetitorRows (profiles: CompetitorShopProfile[]) {
  const config = competitorSupabaseConfig()
  if (!config) return null
  try {
    const query = new URLSearchParams({ select: 'shop_key,shop_name,shop_handle,shop_url,source_row_key,item_id,model_id,sku,name,isbn,ean,author,publisher,edition,cover_type,volume_or_combo,image_url,image_id,price,list_price,promo_price,shipping,voucher,available,comparison_eligible,condition,product_url,observed_at,price_basis', order: 'observed_at.desc', limit: '5000' })
    const response = await fetch(`${config.url}/rest/v1/competitor_offers?${query.toString()}`, { headers: supabaseHeaders(config.key), cache: 'no-store' })
    if (!response.ok) return null
    const raw = await response.json() as unknown
    const rows = Array.isArray(raw) ? raw.map(storedCompetitorRow).filter((row): row is CompetitorRow => Boolean(row)) : []
    if (!rows.length) return null
    const shops = profiles.map((profile) => {
      const resultCount = rows.filter((row) => row.shopKey === profile.key).length
      return { key: profile.key, name: profile.name, handle: profile.handle, shopUrl: profile.shopUrl, status: resultCount ? 'live' as const : 'no_results' as const, resultCount, error: null }
    })
    const sourceRows = [...new Set(rows.map((row) => row.sourceRowKey).filter((key): key is string => Boolean(key)))]
    return { rows, shops, scope: { mode: 'affiliate_keyword' as const, requestedRows: sourceRows.length, totalRows: sourceRows.length, limited: false, rowKeys: sourceRows } }
  } catch {
    return null
  }
}

async function fetchFeed (config: CompetitorFeedConfig) {
  if (!safeFeedUrl(config.url)) throw new Error('invalid_feed_url')
  const headers: Record<string, string> = { accept: 'application/json' }
  if (config.token) headers.authorization = `Bearer ${config.token}`
  const response = await fetch(config.url, { headers, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`feed_http_${response.status}`)
  return feedRows(await response.json(), config.name, config.profile.key)
}

function shopStatuses (profiles: CompetitorShopProfile[], patch: Partial<CompetitorShopStatus>[] = []): CompetitorShopStatus[] {
  return profiles.map((profile) => ({ key: profile.key, name: profile.name, handle: profile.handle, shopUrl: profile.shopUrl, status: 'not_configured', resultCount: 0, error: null, ...patch.find((item) => item.key === profile.key) }))
}

function scope (mode: CompetitorDiscoveryScope['mode'], catalog: CatalogRow[], sampled: CatalogRow[]) {
  return { mode, requestedRows: sampled.length, totalRows: catalog.length, limited: sampled.length < catalog.length, rowKeys: sampled.map((row) => `${row.itemId}:${row.modelId}`) }
}

function affiliateRow (offer: AffiliateProductOffer, profile: CompetitorShopProfile): CompetitorRow | null {
  const price = offer.priceMin ?? offer.priceMax
  if (price === null) return null
  const productUrl = offer.productLink ?? (offer.shopId ? `https://shopee.vn/product/${offer.shopId}/${offer.itemId}` : null)
  if (!productUrl) return null
  return { shopKey: profile.key, itemId: offer.itemId, name: offer.productName, shop: offer.shopName ?? profile.name, price, available: true, comparisonEligible: false, imageUrl: offer.imageUrl ?? undefined, productUrl, observedAt: new Date().toISOString(), priceBasis: 'Shopee Affiliate productOfferV2 · giá sản phẩm, chưa đủ model/ISBN để quyết định' }
}

async function loadAffiliateDiscovery (catalog: CatalogRow[], profiles: CompetitorShopProfile[]): Promise<CompetitorFeedResult> {
  const limit = Math.min(Math.max(Number(process.env.SHOPEE_COMPETITOR_DISCOVERY_LIMIT ?? 10) || 10, 1), 50)
  const sampled = catalog.slice(0, limit)
  const rows: CompetitorRow[] = []
  const errors: string[] = []
  const counts = new Map(profiles.map((profile) => [profile.key, 0]))
  for (const own of sampled) {
    if (!own.name) continue
    try {
      const offers = await searchAffiliateProducts(own.name ?? '', { limit: 50 })
      offers.forEach((offer) => {
        const profile = profiles.find((candidate) => shopMatches(offer, candidate))
        const row = profile ? affiliateRow(offer, profile) : null
        if (row) row.sourceRowKey = `${own.itemId}:${own.modelId}`
        if (profile && row) { rows.push(row); counts.set(profile.key, (counts.get(profile.key) ?? 0) + 1) }
      })
    } catch (error) {
      errors.push(`affiliate_${own.itemId}:${error instanceof Error ? error.message : 'search_failed'}`)
    }
  }
  const shops = profiles.map((profile) => ({ key: profile.key, name: profile.name, handle: profile.handle, shopUrl: profile.shopUrl, status: errors.length && !counts.get(profile.key) ? 'error' as const : counts.get(profile.key) ? 'live' as const : 'no_results' as const, resultCount: counts.get(profile.key) ?? 0, error: errors.length && !counts.get(profile.key) ? 'affiliate_search_failed' : null }))
  return { status: rows.length ? errors.length ? 'partial' : 'live' : errors.length ? 'error' : 'partial', source: 'shopee_affiliate_discovery', sourceName: 'Shopee Affiliate Open API · productOfferV2', rows, errors, shops, scope: scope('affiliate_keyword', catalog, sampled) }
}

export async function loadCompetitorFeed (catalog: CatalogRow[] = [], options: CompetitorFeedOptions = {}): Promise<CompetitorFeedResult> {
  const profiles = competitorShopProfiles()
  const configs = feedConfigs(profiles)
  if (process.env.SHOPEE_COMPETITOR_SOURCE_APPROVED !== 'true') return { status: 'not_configured', source: 'none', sourceName: 'none', rows: [], errors: [], shops: shopStatuses(profiles), scope: scope('none', catalog, []) }
  if (!configs.length && !options.forceDiscovery) {
    const stored = await readStoredCompetitorRows(profiles)
    if (stored) return { status: 'live', source: 'stored_competitor_offers', sourceName: 'Supabase · competitor_offers', rows: stored.rows, errors: [], shops: stored.shops, scope: stored.scope }
  }
  if (!configs.length && affiliateConfigured()) return loadAffiliateDiscovery(catalog, profiles)
  if (!configs.length) return { status: 'not_configured', source: 'none', sourceName: 'none', rows: [], errors: [], shops: shopStatuses(profiles), scope: scope('none', catalog, []) }
  const results = await Promise.all(configs.map(async (config) => {
    try { return { config, rows: await fetchFeed(config), error: null } } catch (error) { return { config, rows: [] as CompetitorRow[], error: error instanceof Error ? error.message : 'feed_failed' } }
  }))
  const rows = results.flatMap((result) => result.rows)
  const errors = results.filter((result) => result.error).map((result) => `feed_${result.config.index || 'legacy'}:${result.error}`)
  const shops = profiles.map((profile) => {
    const result = results.find((entry) => entry.config.profile.key === profile.key)
    const resultCount = rows.filter((row) => row.shopKey === profile.key).length
    return { key: profile.key, name: profile.name, handle: profile.handle, shopUrl: profile.shopUrl, status: result?.error ? 'error' as const : result ? resultCount ? 'live' as const : 'no_results' as const : 'not_configured' as const, resultCount, error: result?.error ?? null }
  })
  return { status: rows.length ? errors.length ? 'partial' : 'live' : errors.length ? 'error' : 'partial', source: 'approved_scraper_feeds', sourceName: results.map((result) => result.config.name).join(' · '), rows, errors, shops, scope: scope('feed', catalog, catalog) }
}

export async function persistCompetitorFeed (feed: CompetitorFeedResult) {
  const config = competitorSupabaseConfig()
  if (!config || !feed.rows.length) return { saved: 0, skipped: !config ? 'supabase_not_configured' : 'no_rows' }
  const profiles = new Map(competitorShopProfiles().map((profile) => [profile.key, profile]))
  const rows = feed.rows.filter((row) => isPastOrPresentObservation(row.observedAt)).map((row) => {
    const profile = row.shopKey ? profiles.get(row.shopKey) : null
    return {
      shop_key: row.shopKey ?? profile?.key ?? normalize(row.shop),
      shop_name: profile?.name ?? row.shop,
      shop_handle: profile?.handle ?? row.shop,
      shop_url: profile?.shopUrl ?? row.productUrl,
      source_row_key: row.sourceRowKey ?? null,
      item_id: row.itemId ?? null,
      model_id: row.modelId ?? null,
      sku: row.sku ?? null,
      name: row.name,
      isbn: row.isbn ?? null,
      ean: row.ean ?? null,
      author: row.author ?? null,
      publisher: row.publisher ?? null,
      edition: row.edition ?? null,
      cover_type: row.coverType ?? null,
      volume_or_combo: row.volumeOrCombo ?? null,
      image_url: row.imageUrl ?? null,
      image_id: row.imageId ?? null,
      price: row.price,
      list_price: row.listPrice ?? null,
      promo_price: row.promoPrice ?? null,
      shipping: row.shipping ?? null,
      voucher: row.voucher ?? null,
      available: row.available,
      comparison_eligible: row.comparisonEligible === true,
      condition: row.condition ?? null,
      product_url: row.productUrl,
      observed_at: row.observedAt,
      price_basis: row.priceBasis ?? null,
      source: feed.source,
      raw: row
    }
  })
  const response = await fetch(`${config.url}/rest/v1/competitor_offers?on_conflict=shop_key,product_url`, { method: 'POST', headers: supabaseHeaders(config.key, { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(rows), cache: 'no-store' })
  if (!response.ok) throw new Error(`supabase_competitor_offers_${response.status}`)
  return { saved: rows.length, skipped: null }
}
