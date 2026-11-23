import { NextResponse } from 'next/server'
import { createShopeeOpenApiClient } from '../../../../lib/server/shopee-open-api'

export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  const url = new URL(request.url)
  const itemId = url.searchParams.get('item_id')?.trim() ?? ''
  const modelId = url.searchParams.get('model_id')?.trim() ?? ''

  if (!/^\d+$/.test(itemId) || !/^\d+$/.test(modelId)) {
    return NextResponse.json({
      status: 'invalid_request',
      message: 'Cần truyền item_id và model_id dạng số'
    }, { status: 400, headers: { 'cache-control': 'no-store' } })
  }

  const client = createShopeeOpenApiClient({
    partnerId: process.env.SHOPEE_PARTNER_ID,
    partnerKey: process.env.SHOPEE_PARTNER_KEY,
    accessToken: process.env.SHOPEE_ACCESS_TOKEN,
    shopId: process.env.SHOPEE_SHOP_ID,
    apiBaseUrl: process.env.SHOPEE_API_BASE_URL
  })

  if (!client.configured) {
    return NextResponse.json({
      status: 'not_configured',
      message: 'Shopee API credentials chưa được cấu hình trên Vercel'
    }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  try {
    const result = await client.getModelList(itemId)
    const model = result.models.find((candidate) => candidate.modelId === modelId)
    if (!model) {
      return NextResponse.json({ status: 'not_found', itemId, modelId }, { status: 404, headers: { 'cache-control': 'no-store' } })
    }

    return NextResponse.json({
      status: 'live',
      itemId,
      modelId,
      sku: model.sku,
      currentPrice: model.currentPrice,
      originalPrice: model.originalPrice,
      currency: model.currency,
      available: model.available,
      observedAt: new Date().toISOString(),
      requestId: result.requestId
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('product_price_api_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'upstream_error', message: 'Không đọc được giá sản phẩm từ Shopee' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
