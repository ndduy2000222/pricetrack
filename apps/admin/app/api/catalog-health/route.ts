import { NextResponse } from 'next/server'
import { syncCatalog } from '../../../lib/server/catalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized (request: Request) {
  const expected = process.env.CATALOG_SYNC_SECRET
  return !expected || request.headers.get('authorization') === `Bearer ${expected}` || request.headers.get('x-catalog-sync-secret') === expected
}

export async function GET (request: Request) {
  if (!authorized(request)) return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  try {
    const result = await syncCatalog({ all: false, maxItems: 1 })
    return NextResponse.json({
      status: 'live', itemCount: result.itemCount, rowCount: result.rows.length, pageCount: result.pageCount,
      observedAt: result.observedAt, tokenSource: result.tokenSource,
      unsupportedFieldCount: new Set(result.rows.flatMap((row) => row.unsupportedFields)).size,
      writesEnabled: false
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('catalog_health_failed', error instanceof Error ? error.message : 'unknown_error')
    return NextResponse.json({ status: 'error', message: 'catalog_health_failed' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
