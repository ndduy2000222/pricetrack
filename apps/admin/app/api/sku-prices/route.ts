import { NextResponse } from 'next/server'
import type { ShopeeItem, ShopeeModel } from '../../../lib/server/shopee-open-api'
import { createClientFromEnvironment } from '../../../lib/server/catalog'

export const dynamic = 'force-dynamic'

type TrackedSku = { itemId: string, modelId?: string }

function parseTrackedSkus (value: string | undefined): TrackedSku[] {
  return (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).flatMap((entry) => {
    const [itemId, modelId] = entry.split(':').map((part) => part.trim())
    return /^\d+$/.test(itemId) ? [{ itemId, ...(modelId && /^\d+$/.test(modelId) ? { modelId } : {}) }] : []
  })
}

function toApiRow (model: ShopeeModel, item: ShopeeItem | undefined, requestId: string | null, observedAt: string) {
  return {
    id: `${model.itemId}:${model.modelId}`,
    itemId: model.itemId,
    modelId: model.modelId,
    sku: model.sku || `${model.itemId}:${model.modelId}`,
    name: item?.name ?? null,
    modelName: model.modelName,
    imageUrl: model.imageUrl ?? item?.imageUrl ?? null,
    imageId: model.imageId ?? item?.imageId ?? null,
    imageSource: model.imageUrl || model.imageId ? 'model' : item?.imageUrl || item?.imageId ? 'product' : null,
    currentPrice: model.currentPrice,
    originalPrice: model.originalPrice,
    currency: model.currency,
    available: model.available,
    observedAt,
    requestId
  }
}

export async function GET () {
  const trackedSkus = parseTrackedSkus(process.env.SHOPEE_TRACKED_SKUS)
  let client: Awaited<ReturnType<typeof createClientFromEnvironment>>['client']
  try {
    client = (await createClientFromEnvironment()).client
  } catch (error) {
    console.error('sku_price_token_store_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'error', rows: [], checkedAt: new Date().toISOString(), message: 'Token Shopee chưa sẵn sàng' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  if (!client.configured || trackedSkus.length === 0) {
    return NextResponse.json({ status: 'not_configured', rows: [], checkedAt: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } })
  }

  try {
    const itemIds = [...new Set(trackedSkus.map(({ itemId }) => itemId))]
    const [responses, baseInfo] = await Promise.all([Promise.all(itemIds.map((itemId) => client.getModelList(itemId))), client.getItemBaseInfo(itemIds)])
    const itemById = new Map(baseInfo.items.map((item) => [item.itemId, item]))
    const observedAt = new Date().toISOString()
    const requested = new Set(trackedSkus.filter(({ modelId }) => modelId).map(({ itemId, modelId }) => `${itemId}:${modelId}`))
    const rows = responses.flatMap((response) => response.models.filter((model) => requested.size === 0 || requested.has(`${model.itemId}:${model.modelId}`)).map((model) => toApiRow(model, itemById.get(model.itemId), response.requestId, observedAt)))
    return NextResponse.json({ status: 'live', rows, checkedAt: new Date().toISOString(), pollIntervalSeconds: 30 }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('sku_price_tracking_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'error', rows: [], checkedAt: new Date().toISOString(), message: 'Không đọc được giá SKU từ Shopee' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
