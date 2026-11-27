import { describe, expect, it } from 'vitest'
import { buildReview } from './price-review'
import { rowFromModel, type CatalogRow } from './catalog'

const item = {
  itemId: '100', itemSku: 'SKU-100', name: 'The Same Book', status: 'NORMAL', categoryId: '1',
  hasModel: true, condition: 'NEW', price: 100000, originalPrice: 120000, currency: 'VND', stock: 5,
  attributes: { ISBN: '978-1-2345-6789-0', Author: 'Author', Publisher: 'Publisher' }, imageUrl: null,
  imageId: null, createTime: null, updateTime: null
}

const model = {
  itemId: '100', modelId: '200', sku: 'SKU-100-RED', currentPrice: 100000, originalPrice: 120000,
  currency: 'VND', status: 'MODEL_NORMAL', available: true, stock: 5, modelName: 'Red', imageUrl: null, imageId: null
}

const catalogRow = (shopId: string): CatalogRow => rowFromModel(item, model, shopId, new Date().toISOString(), 'request-1')

describe('phase 1 verification coverage', () => {
  it('keeps catalog identity and product URLs isolated between shops', () => {
    const shopA = catalogRow('111')
    const shopB = catalogRow('222')

    expect(shopA.productUrl).toBe('https://shopee.vn/product/111/100')
    expect(shopB.productUrl).toBe('https://shopee.vn/product/222/100')
    expect(shopA.productUrl).not.toBe(shopB.productUrl)
  })

  it('keeps competitor evidence attached to its own shop key', () => {
    const now = new Date().toISOString()
    const shops = [
      { key: 'shop-a', name: 'Shop A', handle: 'shop-a', shopUrl: 'https://shopee.vn/shop-a', status: 'live' as const, resultCount: 1, error: null },
      { key: 'shop-b', name: 'Shop B', handle: 'shop-b', shopUrl: 'https://shopee.vn/shop-b', status: 'live' as const, resultCount: 1, error: null }
    ]
    const competitors = [
      { shopKey: 'shop-a', itemId: '100', modelId: '200', name: 'The Same Book', shop: 'Shop A', isbn: '978-1-2345-6789-0', price: 91000, available: true, comparisonEligible: true, productUrl: 'https://shopee.vn/product/111/100', observedAt: now },
      { shopKey: 'shop-b', itemId: '100', modelId: '200', name: 'The Same Book', shop: 'Shop B', isbn: '978-1-2345-6789-0', price: 92000, available: true, comparisonEligible: true, productUrl: 'https://shopee.vn/product/222/100', observedAt: now }
    ]

    const [review] = buildReview([catalogRow('999')], competitors, { shops, scope: { mode: 'feed', requestedRows: 1, totalRows: 1, limited: false, rowKeys: ['100:200'] } })
    expect(review.competitorComparisons).toHaveLength(2)
    expect(review.competitorComparisons.map((entry) => [entry.shopKey, entry.comparablePrice])).toEqual([['shop-a', 91000], ['shop-b', 92000]])
  })

  // Test note: requireShopContext and token persistence call Supabase directly. This phase does not fake
  // a successful authenticated request; those paths need an injected repository/fetch seam or credentialed integration test.
})
