import { NextResponse } from 'next/server'
import { buildCatalogRows, createClientForShop } from '../../../../../lib/server/catalog'
import { completeSyncConnection, createSyncRun, getConnection, getSyncRun, isPortalAdmin, saveCatalogRows, updateSyncRun } from '../../../../../lib/server/shop-portal'

export const dynamic = 'force-dynamic'

function dbRow (row: Awaited<ReturnType<typeof buildCatalogRows>>['rows'][number]) {
  return { item_id: row.itemId, model_id: row.modelId, observed_at: row.observedAt, sku: row.sku, name: row.name, model_name: row.modelName, isbn: row.isbn, ean: row.ean, author: row.author, publisher: row.publisher, edition: row.edition, cover_type: row.coverType, volume_or_combo: row.volumeOrCombo, image_url: row.imageUrl, image_id: row.imageId, image_source: row.imageSource, current_price: row.currentPrice, original_price: row.originalPrice, currency: row.currency, stock: row.stock, status: row.status, available: row.available, condition: row.condition, product_url: row.productUrl, data_source: row.dataSource, unsupported_fields: row.unsupportedFields, request_id: row.requestId, updated_at: row.observedAt }
}

export async function POST (request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isPortalAdmin(request)) return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  const { id } = await context.params
  try {
    const connection = await getConnection(id); if (!connection) return NextResponse.json({ status: 'not_found' }, { status: 404 })
    const body = await request.json().catch(() => ({})) as { runId?: string }
    const run = body.runId ? await getSyncRun(body.runId) : await createSyncRun(id)
    if (!run || run.connection_id !== id) return NextResponse.json({ status: 'invalid_run' }, { status: 400 })
    if (run.status === 'succeeded') return NextResponse.json({ status: 'ok', run, done: true })
    await completeSyncConnection(id, { status: 'syncing', last_error: null })
    const { client } = await createClientForShop(connection.shop_id)
    if (!client.configured) throw new Error('shop_token_not_configured')
    const page = await client.getItemList({ offset: run.next_offset, pageSize: 100 })
    const built = await buildCatalogRows({ client, shopId: connection.shop_id, itemIds: page.items })
    await saveCatalogRows(id, built.rows.map(dbRow))
    const nextOffset = page.nextOffset > run.next_offset ? page.nextOffset : run.next_offset + page.items.length
    const hasNext = page.hasNextPage && page.items.length > 0 && nextOffset > run.next_offset
    const nextRun = { next_offset: nextOffset, page_count: run.page_count + 1, total_items: page.totalCount ?? run.total_items, processed_items: run.processed_items + page.items.length, processed_rows: run.processed_rows + built.rows.length, status: hasNext ? 'running' : 'succeeded', completed_at: hasNext ? null : new Date().toISOString(), last_error: null }
    await updateSyncRun(run.id, nextRun)
    if (!hasNext) await completeSyncConnection(id, { status: 'connected', last_catalog_sync_at: new Date().toISOString(), last_error: null })
    return NextResponse.json({ status: 'ok', done: !hasNext, run: { ...run, ...nextRun } }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync_failed'
    try { await completeSyncConnection(id, { status: 'error', last_error: message }) } catch { /* preserve original sync error */ }
    return NextResponse.json({ status: 'error', message }, { status: 500, headers: { 'cache-control': 'no-store' } })
  }
}
