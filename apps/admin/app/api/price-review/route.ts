import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { syncCatalog } from '../../../lib/server/catalog'
import { buildReview, loadCompetitorFeed, type ReviewRow } from '../../../lib/server/price-review'
import { readStoredCatalog } from '../../../lib/server/stored-catalog'
import { classifyShopeeError } from '../../../lib/server/shopee-open-api'
import { contextError, requireShopContext } from '../../../lib/server/shop-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const columns: (keyof ReviewRow)[] = ['sku', 'itemId', 'modelId', 'name', 'modelName', 'isbn', 'ean', 'author', 'publisher', 'edition', 'coverType', 'volumeOrCombo', 'stock', 'productUrl', 'imageUrl', 'imageId', 'imageSource', 'ownObservedAt', 'ownPrice', 'competitorPrice', 'competitorListPrice', 'competitorPromoPrice', 'competitorShipping', 'competitorVoucher', 'competitorShop', 'competitorName', 'competitorModelId', 'competitorSku', 'competitorVariant', 'competitorUrl', 'competitorObservedAt', 'competitorPriceBasis', 'competitorSource', 'competitorSourceName', 'confidence', 'confidenceReason', 'validCompetitorCount', 'competitorLowestPrice', 'competitorMedianPrice', 'competitorComparisons', 'priceDifference', 'targetPrice', 'reductionVnd', 'reductionPercent', 'floorPrice', 'expectedProfit', 'status', 'reason']

function csv (rows: ReviewRow[]) {
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return [columns.map(quote).join(','), ...rows.map((row) => columns.map((column) => quote(row[column])).join(','))].join('\n')
}

export async function GET (request: Request) {
  const url = new URL(request.url); const format = url.searchParams.get('format') ?? 'json'; const source = url.searchParams.get('source') ?? 'stored'
  try {
    const context = await requireShopContext(request, source === 'live' ? 'sync' : 'viewer')
    const stored = source === 'live' ? null : await readStoredCatalog(context.connectionId)
    const catalog = stored
      ? { rows: stored.rows, itemCount: new Set(stored.rows.map((row) => row.itemId)).size, pageCount: null, observedAt: stored.observedAt ?? new Date().toISOString(), tokenSource: 'encrypted_supabase', catalogSource: 'stored' as const, connectionId: stored.connectionId }
      : { ...(await syncCatalog({ shopId: context.shopeeShopId, all: true, maxItems: Number(url.searchParams.get('max_items') ?? '') || undefined })), catalogSource: 'live_sync' as const, connectionId: context.connectionId }
    const feed = await loadCompetitorFeed(catalog.rows); const rows = buildReview(catalog.rows, feed.rows, { shops: feed.shops, scope: feed.scope }).map((row) => ({ ...row, competitorSource: feed.status, competitorSourceName: feed.sourceName }))
    if (format === 'csv') return new Response(`\ufeff${csv(rows)}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="alpha-books-price-review.csv"', 'cache-control': 'no-store' } })
    if (format === 'xlsx') { const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Price review'); const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }); return new Response(output, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="alpha-books-price-review.xlsx"', 'cache-control': 'no-store' } }) }
    return NextResponse.json({ status: 'live', competitorSource: feed.status, competitorSourceName: feed.sourceName, competitorFeedErrors: feed.errors, competitorFeedCount: feed.shops.filter((shop) => shop.status === 'live').length, competitorShops: feed.shops, competitorScope: feed.scope, catalogSource: catalog.catalogSource, catalogConnectionId: catalog.connectionId, catalogItemCount: catalog.itemCount, catalogRowCount: catalog.rows.length, catalogObservedAt: catalog.observedAt, rows, checkedAt: new Date().toISOString(), guardrails: { writesEnabled: false, unsupportedFields: [...new Set(catalog.rows.flatMap((row) => row.unsupportedFields))] } }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const auth = contextError(error); if (auth.status !== 500) return NextResponse.json({ status: 'error', code: auth.code }, { status: auth.status, headers: { 'cache-control': 'no-store' } })
    console.error('price_review_failed', error instanceof Error ? error.message : 'unknown_error')
    const code = classifyShopeeError(error)
    return NextResponse.json({ status: 'error', code, message: code === 'refresh_token_not_configured' ? 'refresh_token_not_configured' : code === 'reauthorization_required' ? 'reauthorization_required' : 'Không tạo được bảng phân tích giá' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
