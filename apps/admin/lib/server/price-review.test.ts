import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildReview, type CompetitorRow } from './price-review'
import type { CatalogRow } from './catalog'

const catalogRow: CatalogRow = {
  observedAt: '2026-11-27T09:59:00.000Z',
  itemId: 'item-1',
  modelId: 'model-1',
  sku: 'SKU-1',
  name: 'Sách mẫu',
  modelName: 'Bản chuẩn',
  isbn: '9780000000001',
  ean: null,
  author: 'Tác giả',
  publisher: 'Alpha Books',
  edition: null,
  coverType: null,
  volumeOrCombo: null,
  imageUrl: null,
  imageId: null,
  imageSource: null,
  currentPrice: 100_000,
  originalPrice: 100_000,
  currency: 'VND',
  stock: 10,
  status: 'NORMAL',
  available: true,
  condition: 'new',
  productUrl: 'https://shopee.vn/product/1/1',
  dataSource: 'shopee_open_api',
  unsupportedFields: [],
  requestId: null
}

const futureCompetitor: CompetitorRow = {
  itemId: 'item-1',
  modelId: 'model-1',
  name: 'Sách mẫu',
  isbn: '9780000000001',
  author: 'Tác giả',
  publisher: 'Alpha Books',
  shop: 'Omega Plus Books Store',
  shopKey: 'omegaplusvn',
  price: 90_000,
  available: true,
  comparisonEligible: true,
  productUrl: 'https://shopee.vn/product/2/2',
  observedAt: '2026-11-27T10:01:00.000Z'
}

describe('buildReview pricing safety', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('rejects future competitor observations without changing review semantics', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-27T10:00:00.000Z'))
    vi.stubEnv('PRICE_COSTS_JSON', JSON.stringify({ 'SKU-1': 50_000 }))
    vi.stubEnv('PRICE_PLATFORM_FEE_PERCENT', '10')
    vi.stubEnv('PRICE_OPERATION_COST_VND', '0')
    vi.stubEnv('PRICE_MIN_MARGIN_VND', '0')
    vi.stubEnv('PRICE_BUFFER_AMOUNT_VND', '1_000')

    const [row] = buildReview([catalogRow], [futureCompetitor])

    expect(row.validCompetitorCount).toBe(0)
    expect(row.competitorPrice).toBeNull()
    expect(row.targetPrice).toBeNull()
    expect(row.status).toBe('simulation')
  })
})
