import { NextResponse } from 'next/server'
import { createClientForShop } from '../../../../../../lib/server/catalog'
import { contextError, requireShopContext } from '../../../../../../lib/server/shop-context'
import type { DiscountItemUpdate } from '../../../../../../lib/server/shopee-open-api'

export const dynamic = 'force-dynamic'

function authorized (request: Request) {
  const expected = process.env.SHOPEE_DISCOUNT_WRITE_SECRET
  if (!expected) return false
  return request.headers.get('authorization') === `Bearer ${expected}` || request.headers.get('x-shopee-discount-write-secret') === expected
}

function validItemList (value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) return null
  if (value.some((item) => {
    if (!item || typeof item !== 'object') return true
    const candidate = item as Record<string, unknown>
    if (!Number.isSafeInteger(candidate.item_id) || Number(candidate.item_id) <= 0) return true
    if (candidate.item_promotion_price !== undefined && (typeof candidate.item_promotion_price !== 'number' || candidate.item_promotion_price <= 0)) return true
    if (candidate.purchase_limit !== undefined && (!Number.isSafeInteger(candidate.purchase_limit) || Number(candidate.purchase_limit) < 0)) return true
    if (candidate.model_list !== undefined && (!Array.isArray(candidate.model_list) || candidate.model_list.some((model) => {
      if (!model || typeof model !== 'object') return true
      const variation = model as Record<string, unknown>
      return !Number.isSafeInteger(variation.model_id) || Number(variation.model_id) <= 0 || typeof variation.model_promotion_price !== 'number' || variation.model_promotion_price <= 0
    }))) return true
    return false
  })) return null
  return value
}

export async function POST (request: Request, context: { params: Promise<{ discountId: string }> }) {
  if (!authorized(request)) return NextResponse.json({ status: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  try { await requireShopContext(request, 'price_editor') } catch (error) { const auth = contextError(error); return NextResponse.json({ status: 'error', code: auth.code }, { status: auth.status }) }

  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return NextResponse.json({ status: 'invalid_request', message: 'Body phải là JSON' }, { status: 400 }) }
  if (body.approved !== true) return NextResponse.json({ status: 'approval_required', message: 'Cần approved=true cho thao tác ghi giá khuyến mãi' }, { status: 400 })

  const { discountId } = await context.params
  if (!/^\d+$/.test(discountId)) return NextResponse.json({ status: 'invalid_request', message: 'discountId phải là số' }, { status: 400 })
  const itemList = validItemList(body.item_list)
  if (!itemList) return NextResponse.json({ status: 'invalid_request', message: 'item_list phải có 1-50 sản phẩm và giá hợp lệ' }, { status: 400 })

  try {
    const shopContext = await requireShopContext(request, 'price_editor')
    const { client } = await createClientForShop(shopContext.shopeeShopId)
    if (!client.configured) return NextResponse.json({ status: 'not_configured', message: 'Shopee API credentials chưa sẵn sàng' }, { status: 503 })
    const result = await client.updateDiscountItem({ discountId: Number(discountId), itemList: itemList as DiscountItemUpdate[] }, true)
    return NextResponse.json({ status: result.error ? 'upstream_error' : 'updated', requestId: result.request_id, error: result.error || null, message: result.message || null, response: result.response ?? null }, { status: result.error ? 502 : 200, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('shopee_discount_update_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'upstream_error', message: 'Không cập nhật được giá khuyến mãi trên Shopee' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
