import { NextResponse } from 'next/server'
import { createClientForShop } from '../../../../../lib/server/catalog'
import { classifyShopeeError } from '../../../../../lib/server/shopee-open-api'
import { contextError, requireShopContext } from '../../../../../lib/server/shop-context'
import { normalizePromotion, savePromotions } from '../../../../../lib/server/promotion-store'

export const dynamic = 'force-dynamic'

function promotionsFromResponse (value: unknown) {
  const response = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const list = response.discount_list ?? response.discounts ?? response.discount
  return Array.isArray(list) ? list : []
}

export async function POST (request: Request) {
  try {
    const context = await requireShopContext(request, 'sync')
    const client = (await createClientForShop(context.shopeeShopId)).client
    const all = [] as NonNullable<ReturnType<typeof normalizePromotion>>[]
    const pages = Math.min(Math.max(Number(new URL(request.url).searchParams.get('pages') ?? 10) || 10, 1), 100)
    for (let page = 1; page <= pages; page += 1) {
      const result = await client.getDiscountList({ status: 'all', pageNo: page, pageSize: 100 })
      if (result.error) return NextResponse.json({ status: 'partial', code: result.error, requestId: result.request_id, saved: await savePromotions(context.connectionId, all) }, { status: 502 })
      const rows = promotionsFromResponse(result.response)
      all.push(...rows.map((row) => normalizePromotion(context.connectionId, row, result.request_id)).filter((row): row is NonNullable<typeof row> => Boolean(row)))
      if (rows.length < 100) break
    }
    return NextResponse.json({ status: 'ok', connectionId: context.connectionId, count: all.length, saved: await savePromotions(context.connectionId, all) }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const auth = contextError(error); if (auth.status !== 500) return NextResponse.json({ status: 'error', code: auth.code }, { status: auth.status })
    return NextResponse.json({ status: 'error', code: classifyShopeeError(error) }, { status: 502 })
  }
}
