import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { catalogCsv } from '../../../lib/server/catalog'
import { readStoredCatalog } from '../../../lib/server/stored-catalog'
import { classifyShopeeError } from '../../../lib/server/shopee-open-api'
import { contextError, requireShopContext } from '../../../lib/server/shop-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET (request: Request) {
  const url = new URL(request.url); const format = url.searchParams.get('format') ?? 'json'; const all = url.searchParams.get('all') !== 'false'; const source = url.searchParams.get('source') ?? 'stored'
  try {
    const context = await requireShopContext(request, 'viewer')
    if (source === 'live') return NextResponse.json({ status: 'error', code: 'live_read_requires_diagnostic_route' }, { status: 400, headers: { 'cache-control': 'no-store' } })
    const stored = await readStoredCatalog(context.connectionId)
    const result = { rows: stored.rows, itemCount: new Set(stored.rows.map((row) => row.itemId)).size, pageCount: null, observedAt: stored.observedAt, tokenSource: 'encrypted_supabase', catalogSource: 'stored' as const, connectionId: stored.connectionId, syncStatus: stored.syncStatus, lastCatalogSyncAt: stored.lastCatalogSyncAt, lastError: stored.lastError }
    if (format === 'csv') return new Response(`\ufeff${catalogCsv(result.rows)}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="alpha-books-catalog.csv"', 'cache-control': 'no-store' } })
    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.json_to_sheet(result.rows); XLSX.utils.book_append_sheet(workbook, sheet, 'Catalog')
      const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      return new Response(output, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="alpha-books-catalog.xlsx"', 'cache-control': 'no-store' } })
    }
    return NextResponse.json({ status: 'ok', dataStatus: result.rows.length ? 'ready' : result.lastCatalogSyncAt ? 'empty' : 'initial_sync', ...result, unsupportedFields: [...new Set(result.rows.flatMap((row) => row.unsupportedFields))] }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const auth = contextError(error); if (auth.status !== 500) return NextResponse.json({ status: 'error', code: auth.code }, { status: auth.status, headers: { 'cache-control': 'no-store' } })
    console.error('catalog_read_failed', error instanceof Error ? error.message : 'unknown_error')
    const code = classifyShopeeError(error)
    const message = error instanceof Error && ['not_configured', 'refresh_token_not_configured', 'token_store_not_configured'].includes(error.message) ? error.message : code === 'refresh_token_not_configured' ? 'refresh_token_not_configured' : code === 'reauthorization_required' ? 'reauthorization_required' : 'Không đồng bộ được catalog Shopee'
    const status = error instanceof Error && error.message === 'shop_not_found' ? 404 : 502
    return NextResponse.json({ status: 'error', code: error instanceof Error && error.message === 'shop_not_found' ? 'shop_not_found' : code, message }, { status, headers: { 'cache-control': 'no-store' } })
  }
}
