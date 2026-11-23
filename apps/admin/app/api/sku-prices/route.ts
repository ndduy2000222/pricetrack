import { NextResponse } from 'next/server'
import { createShopeeOpenApiClient, type ShopeeModel } from '../../../lib/server/shopee-open-api'

export const dynamic = 'force-dynamic'

type TrackedSku = { itemId: string, modelId?: string }

function parseTrackedSkus (value: string | undefined): TrackedSku[] {
  return (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).flatMap((entry) => {
    const [itemId, modelId] = entry.split(':').map((part) => part.trim())
    return /^\d+$/.test(itemId) ? [{ itemId, ...(modelId && /^\d+$/.test(modelId) ? { modelId } : {}) }] : []
  })
}

function toApiRow (model: ShopeeModel, requestId: string | null) {
  return {
    id: `${model.itemId}:${model.modelId}`,
    itemId: model.itemId,
    modelId: model.modelId,
    sku: model.sku || `${model.itemId}:${model.modelId}`,
    currentPrice: model.currentPrice,
    originalPrice: model.originalPrice,
    currency: model.currency,
    available: model.available,
    observedAt: new Date().toISOString(),
    requestId
  }
}

export async function GET () {
  const trackedSkus = parseTrackedSkus(process.env.SHOPEE_TRACKED_SKUS)
  const client = createShopeeOpenApiClient({
    partnerId: process.env.SHOPEE_PARTNER_ID,
    partnerKey: process.env.SHOPEE_PARTNER_KEY,
    accessToken: process.env.SHOPEE_ACCESS_TOKEN,
    shopId: process.env.SHOPEE_SHOP_ID,
    apiBaseUrl: process.env.SHOPEE_API_BASE_URL
  })

  if (!client.configured || trackedSkus.length === 0) {
    return NextResponse.json({ status: 'not_configured', rows: [], checkedAt: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } })
  }

  try {
    const itemIds = [...new Set(trackedSkus.map(({ itemId }) => itemId))]
    const responses = await Promise.all(itemIds.map((itemId) => client.getModelList(itemId)))
    const requested = new Set(trackedSkus.filter(({ modelId }) => modelId).map(({ itemId, modelId }) => `${itemId}:${modelId}`))
    const rows = responses.flatMap((response) => response.models.filter((model) => requested.size === 0 || requested.has(`${model.itemId}:${model.modelId}`)).map((model) => toApiRow(model, response.requestId)))
    return NextResponse.json({ status: 'live', rows, checkedAt: new Date().toISOString(), pollIntervalSeconds: 30 }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('sku_price_tracking_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'error', rows: [], checkedAt: new Date().toISOString(), message: 'Không đọc được giá SKU từ Shopee' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
