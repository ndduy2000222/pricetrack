import { NextResponse } from 'next/server'
import { buildCatalogRows, createClientForShop } from '../../../../lib/server/catalog'
import { classifyShopeeError } from '../../../../lib/server/shopee-open-api'
import { completeSyncConnection, createSyncRun, getSyncRun, listConnections, saveCatalogRows, updateSyncRun } from '../../../../lib/server/shop-portal'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized (request: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.CATALOG_SYNC_SECRET ?? ''
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

function dbRow (row: Awaited<ReturnType<typeof buildCatalogRows>>['rows'][number]) {
  return { item_id: row.itemId, model_id: row.modelId, observed_at: row.observedAt, sku: row.sku, name: row.name, model_name: row.modelName, isbn: row.isbn, ean: row.ean, author: row.author, publisher: row.publisher, edition: row.edition, cover_type: row.coverType, volume_or_combo: row.volumeOrCombo, image_url: row.imageUrl, image_id: row.imageId, image_source: row.imageSource, current_price: row.currentPrice, original_price: row.originalPrice, currency: row.currency, stock: row.stock, status: row.status, available: row.available, condition: row.condition, product_url: row.productUrl, data_source: row.dataSource, unsupported_fields: row.unsupportedFields, request_id: row.requestId, updated_at: row.observedAt }
}

export async function POST (request: Request) {
  if (!authorized(request)) return NextResponse.json({ status: 'unauthorized', code: 'cron_secret_required' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  const results: Array<Record<string, unknown>> = []
  for (const connection of await listConnections()) {
    let run: Awaited<ReturnType<typeof createSyncRun>> | null = null
    try {
      run = await createSyncRun(connection.id)
      if (!run) throw new Error('sync_run_create_failed')
      const storedRun = await getSyncRun(run.id)
      if (!storedRun) throw new Error('sync_run_not_found')
      await completeSyncConnection(connection.id, { status: 'syncing', last_error: null })
      const { client } = await createClientForShop(connection.shop_id)
      if (!client.configured) throw new Error('shop_token_not_configured')
      let offset = storedRun.next_offset; let processedItems = storedRun.processed_items; let processedRows = storedRun.processed_rows; let pageCount = storedRun.page_count; let totalItems = storedRun.total_items
      for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
        const page = await client.getItemList({ offset, pageSize: 100 })
        const built = await buildCatalogRows({ client, shopId: connection.shop_id, itemIds: page.items })
        await saveCatalogRows(connection.id, built.rows.map(dbRow))
        const nextOffset = page.nextOffset > offset ? page.nextOffset : offset + page.items.length
        processedItems += page.items.length; processedRows += built.rows.length; pageCount += 1; totalItems = page.totalCount ?? totalItems
        const done = !page.hasNextPage || !page.items.length
        await updateSyncRun(run.id, { next_offset: nextOffset, page_count: pageCount, total_items: totalItems, processed_items: processedItems, processed_rows: processedRows, status: done ? 'succeeded' : 'running', completed_at: done ? new Date().toISOString() : null, last_error: null })
        offset = nextOffset
        if (done) break
      }
      const completedAt = new Date().toISOString()
      await completeSyncConnection(connection.id, { status: 'connected', last_catalog_sync_at: completedAt, last_successful_sync_at: completedAt, next_sync_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), last_error: null })
      results.push({ connectionId: connection.id, status: 'succeeded', processedItems, processedRows })
    } catch (error) {
      const code = classifyShopeeError(error); const message = error instanceof Error ? error.message : 'sync_failed'
      if (run) await updateSyncRun(run.id, { status: 'failed', last_error: message, completed_at: new Date().toISOString() }).catch(() => undefined)
      await completeSyncConnection(connection.id, { status: 'error', last_error: code, next_sync_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }).catch(() => undefined)
      results.push({ connectionId: connection.id, status: 'error', code })
    }
  }
  return NextResponse.json({ status: 'ok', processed: results.length, results }, { headers: { 'cache-control': 'no-store' } })
}
