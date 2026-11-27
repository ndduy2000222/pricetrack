import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { catalogCsv, syncCatalog } from '../../../lib/server/catalog'
import { readStoredCatalog } from '../../../lib/server/stored-catalog'
import { classifyShopeeError } from '../../../lib/server/shopee-open-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized (request: Request) {
  const expected = process.env.CATALOG_SYNC_SECRET
  if (!expected) return true
  return request.headers.get('authorization') === `Bearer ${expected}` || request.headers.get('x-catalog-sync-secret') === expected
}

export async function GET (request: Request) {
  if (!authorized(request)) return NextResponse.json({ status: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  const url = new URL(request.url); const format = url.searchParams.get('format') ?? 'json'; const all = url.searchParams.get('all') !== 'false'; const source = url.searchParams.get('source') ?? 'stored'
  try {
    const stored = source === 'live' ? null : await readStoredCatalog()
    const result = stored
      ? { rows: stored.rows, itemCount: new Set(stored.rows.map((row) => row.itemId)).size, pageCount: null, observedAt: stored.observedAt ?? new Date().toISOString(), tokenSource: 'encrypted_supabase', catalogSource: 'stored' as const, connectionId: stored.connectionId }
      : { ...(await syncCatalog({ all, maxItems: Number(url.searchParams.get('max_items') ?? '') || undefined })), catalogSource: 'live_sync' as const, connectionId: null }
    if (format === 'csv') return new Response(`\ufeff${catalogCsv(result.rows)}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="alpha-books-catalog.csv"', 'cache-control': 'no-store' } })
    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.json_to_sheet(result.rows); XLSX.utils.book_append_sheet(workbook, sheet, 'Catalog')
      const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      return new Response(output, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="alpha-books-catalog.xlsx"', 'cache-control': 'no-store' } })
    }
    return NextResponse.json({ status: 'live', ...result, unsupportedFields: [...new Set(result.rows.flatMap((row) => row.unsupportedFields))] }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('catalog_sync_failed', error instanceof Error ? error.message : 'unknown_error')
    const code = classifyShopeeError(error)
    const message = error instanceof Error && ['not_configured', 'refresh_token_not_configured', 'token_store_not_configured'].includes(error.message) ? error.message : code === 'refresh_token_not_configured' ? 'refresh_token_not_configured' : code === 'reauthorization_required' ? 'reauthorization_required' : 'Không đồng bộ được catalog Shopee'
    return NextResponse.json({ status: 'error', code, message }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
