import { NextResponse } from 'next/server'
import { createClientForShop } from '../../../../lib/server/catalog'
import { classifyShopeeError } from '../../../../lib/server/shopee-open-api'
import { contextError, requireShopContext } from '../../../../lib/server/shop-context'

export const dynamic = 'force-dynamic'

export async function GET (request: Request) {
  try {
    const context = await requireShopContext(request, 'viewer')
    const url = new URL(request.url)
    const discountId = url.searchParams.get('discount_id')?.trim() ?? ''
    const client = (await createClientForShop(context.shopeeShopId)).client
    const result = /^\d+$/.test(discountId)
      ? await client.getDiscount(Number(discountId), { pageNo: Number(url.searchParams.get('page_no') ?? 1) || 1, pageSize: Number(url.searchParams.get('page_size') ?? 100) || 100 })
      : await client.getDiscountList({ status: url.searchParams.get('status') ?? 'all', pageNo: Number(url.searchParams.get('page_no') ?? 1) || 1, pageSize: Number(url.searchParams.get('page_size') ?? 100) || 100 })
    return NextResponse.json({ status: result.error ? 'upstream_error' : 'live', requestId: result.request_id, error: result.error || null, message: result.message || null, response: result.response ?? null, connectionId: context.connectionId }, { status: result.error ? 502 : 200, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const auth = contextError(error)
    if (auth.status !== 500) return NextResponse.json({ status: 'error', code: auth.code }, { status: auth.status })
    const code = classifyShopeeError(error)
    return NextResponse.json({ status: 'error', code, message: code === 'refresh_token_not_configured' ? 'refresh_token_not_configured' : 'Không đọc được chương trình khuyến mãi Shopee' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
