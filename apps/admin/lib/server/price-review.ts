import type { CatalogRow } from './catalog'

export type CompetitorRow = {
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
  condition?: string
  productUrl: string
  observedAt: string
  priceBasis?: string
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
const numberOrNull = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null

function comparablePrice (competitor: CompetitorRow) {
  const base = numberOrNull(competitor.promoPrice) ?? numberOrNull(competitor.price)
  if (base === null) return null
  const shipping = competitor.shippingGenerallyApplicable ? (numberOrNull(competitor.shipping) ?? 0) : 0
  const voucher = competitor.voucherGenerallyApplicable ? (numberOrNull(competitor.voucher) ?? 0) : 0
  return Math.max(0, base + shipping - voucher)
}

function match (own: CatalogRow, candidate: CompetitorRow) {
  if (!candidate.available || normalize(candidate.condition) && normalize(candidate.condition) !== 'new') return { confidence: 0, reason: 'Hết hàng hoặc không phải hàng mới' }
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

export function buildReview (catalog: CatalogRow[], competitors: CompetitorRow[]) {
  const settings = config(); const now = Date.now()
  return catalog.map((own): ReviewRow => {
    const candidates = competitors.map((candidate) => ({ candidate, match: match(own, candidate), price: comparablePrice(candidate), observedAt: Date.parse(candidate.observedAt) })).filter((entry) => entry.match.confidence > 0 && entry.price !== null && Number.isFinite(entry.observedAt) && now - entry.observedAt <= settings.maxAgeMinutes * 60_000)
    const ordered = candidates.sort((a, b) => (a.price as number) - (b.price as number)); const chosen = ordered[0]
    const prices = ordered.map((entry) => entry.price as number); const lowest = prices[0] ?? null; const median = prices.length ? prices.length % 2 ? prices[Math.floor(prices.length / 2)] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2 : null
    const cost = numberOrNull(settings.costs[own.sku ?? '']); const fee = settings.fee; const operations = settings.operations; const margin = settings.margin
    const floor = cost !== null && fee !== null && fee >= 0 && fee < 100 && operations !== null && margin !== null ? Math.ceil((cost + operations + margin) / (1 - fee / 100)) : null
    const target = lowest !== null && (settings.bufferAmount !== null || settings.bufferPercent !== null) ? Math.max(0, Math.floor(lowest - (settings.bufferAmount ?? lowest * (settings.bufferPercent ?? 0) / 100))) : null
    const proposed = target !== null && floor !== null ? Math.max(target, floor) : null
    const expectedProfit = proposed !== null && cost !== null && fee !== null && operations !== null ? Math.round(proposed * (1 - fee / 100) - cost - operations) : null
    const status = !chosen ? 'blocked' : proposed === null ? 'simulation' : floor === null ? 'simulation' : proposed < (own.currentPrice ?? 0) ? 'proposal' : 'needs_review'
    const reason = !chosen ? (competitors.length ? 'Không có đối thủ hợp lệ/khớp chắc chắn hoặc dữ liệu đã cũ' : 'Chưa cấu hình nguồn dữ liệu đối thủ được phép') : proposed === null ? 'Chưa đủ dữ liệu kinh doanh hoặc quy tắc giảm; chỉ mô phỏng' : floor !== null && target !== null && target < floor ? 'Giá mục tiêu bị chặn bởi giá sàn' : 'Đủ dữ liệu để xem xét đề xuất'
    return { sku: own.sku, itemId: own.itemId, modelId: own.modelId, name: own.name, modelName: own.modelName, isbn: own.isbn, ean: own.ean, author: own.author, publisher: own.publisher, edition: own.edition, coverType: own.coverType, volumeOrCombo: own.volumeOrCombo, stock: own.stock, productUrl: own.productUrl, imageUrl: own.imageUrl, imageId: own.imageId, imageSource: own.imageSource, ownObservedAt: own.observedAt, ownPrice: own.currentPrice, competitorPrice: chosen?.price ?? null, competitorListPrice: chosen?.candidate.listPrice ?? null, competitorPromoPrice: chosen?.candidate.promoPrice ?? null, competitorShipping: chosen?.candidate.shipping ?? null, competitorVoucher: chosen?.candidate.voucher ?? null, competitorShop: chosen?.candidate.shop ?? null, competitorName: chosen?.candidate.name ?? null, competitorModelId: chosen?.candidate.modelId ?? null, competitorSku: chosen?.candidate.sku ?? null, competitorVariant: chosen?.candidate.volumeOrCombo ?? chosen?.candidate.coverType ?? null, competitorUrl: chosen?.candidate.productUrl ?? null, competitorObservedAt: chosen?.candidate.observedAt ?? null, competitorPriceBasis: chosen ? (chosen.candidate.priceBasis ?? 'Giá khuyến mãi/niêm yết; cộng phí và trừ voucher chỉ khi áp dụng chung') : null, competitorSource: 'unknown', competitorSourceName: 'unknown', confidence: chosen?.match.confidence ?? null, confidenceReason: chosen?.match.reason ?? 'Chưa có kết quả ghép', validCompetitorCount: prices.length, competitorLowestPrice: lowest, competitorMedianPrice: median, priceDifference: own.currentPrice !== null && lowest !== null ? own.currentPrice - lowest : null, targetPrice: proposed, reductionVnd: own.currentPrice !== null && proposed !== null ? Math.max(0, own.currentPrice - proposed) : null, reductionPercent: own.currentPrice !== null && proposed !== null && own.currentPrice > 0 ? Math.max(0, (own.currentPrice - proposed) / own.currentPrice * 100) : null, floorPrice: floor, expectedProfit, status, reason }
  })
}

export async function loadCompetitorFeed () {
  const url = process.env.SHOPEE_COMPETITOR_FEED_URL
  if (!url || process.env.SHOPEE_COMPETITOR_SOURCE_APPROVED !== 'true') return { status: 'not_configured' as const, source: 'none', rows: [] as CompetitorRow[] }
  const response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' }); if (!response.ok) throw new Error('competitor_feed_failed')
  const body: unknown = await response.json(); const bodyRecord = body && typeof body === 'object' ? body as { rows?: unknown } : {}; const rows: unknown[] = Array.isArray(body) ? body : Array.isArray(bodyRecord.rows) ? bodyRecord.rows : []
  return { status: 'live' as const, source: 'approved_feed', rows: rows.filter((row): row is Record<string, unknown> => { const record = row && typeof row === 'object' ? row as Record<string, unknown> : null; return Boolean(record && typeof record.name === 'string' && typeof record.shop === 'string' && typeof record.productUrl === 'string' && Number.isFinite(Number(record.price)) && typeof record.observedAt === 'string') }).map((row) => ({ ...row, price: Number(row.price), available: Boolean(row.available) }) as CompetitorRow) }
}
