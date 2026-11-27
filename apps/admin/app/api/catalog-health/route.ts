import { NextResponse } from 'next/server'
import { syncCatalog } from '../../../lib/server/catalog'
import { contextError, requireShopContext } from '../../../lib/server/shop-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET (request: Request) {
  try {
    const context = await requireShopContext(request, 'sync')
    const result = await syncCatalog({ shopId: context.shopeeShopId, all: false, maxItems: 1 })
    return NextResponse.json({
      status: 'live', itemCount: result.itemCount, rowCount: result.rows.length, pageCount: result.pageCount,
      observedAt: result.observedAt, tokenSource: result.tokenSource,
      unsupportedFieldCount: new Set(result.rows.flatMap((row) => row.unsupportedFields)).size,
      writesEnabled: false
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const auth = contextError(error); if (auth.status !== 500) return NextResponse.json({ status: 'error', code: auth.code }, { status: auth.status })
    console.error('catalog_health_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'error', message: 'catalog_health_failed' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
