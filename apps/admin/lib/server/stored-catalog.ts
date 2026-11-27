import type { CatalogRow } from './catalog'
import { supabaseHeaders } from './supabase-http'

type StoredCatalog = {
  connectionId: string
  shopId: string | null
  rows: CatalogRow[]
  observedAt: string | null
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const textOrNull = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : null
const numberOrNull = (value: unknown) => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null

function supabaseConfig () {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
  return url && key ? { url: url.replace(/\/$/, ''), key } : null
}

async function readJson (url: string, key: string) {
  const response = await fetch(url, { headers: supabaseHeaders(key), cache: 'no-store' })
  if (!response.ok) throw new Error(`supabase_http_${response.status}`)
  return response.json() as Promise<unknown>
}

function toCatalogRow (rawValue: unknown): CatalogRow {
  const raw = asRecord(rawValue)
  const imageSource = raw.image_source === 'model' || raw.image_source === 'product' ? raw.image_source : null
  return {
    observedAt: String(raw.observed_at ?? ''),
    itemId: String(raw.item_id ?? ''),
    modelId: String(raw.model_id ?? '0'),
    sku: textOrNull(raw.sku),
    name: textOrNull(raw.name),
    modelName: textOrNull(raw.model_name),
    isbn: textOrNull(raw.isbn),
    ean: textOrNull(raw.ean),
    author: textOrNull(raw.author),
    publisher: textOrNull(raw.publisher),
    edition: textOrNull(raw.edition),
    coverType: textOrNull(raw.cover_type),
    volumeOrCombo: textOrNull(raw.volume_or_combo),
    imageUrl: textOrNull(raw.image_url),
    imageId: textOrNull(raw.image_id),
    imageSource,
    currentPrice: numberOrNull(raw.current_price),
    originalPrice: numberOrNull(raw.original_price),
    currency: textOrNull(raw.currency),
    stock: numberOrNull(raw.stock),
    status: textOrNull(raw.status),
    available: raw.available === true,
    condition: textOrNull(raw.condition),
    productUrl: String(raw.product_url ?? ''),
    dataSource: 'shopee_open_api',
    unsupportedFields: Array.isArray(raw.unsupported_fields) ? raw.unsupported_fields.filter((value): value is string => typeof value === 'string') : [],
    requestId: textOrNull(raw.request_id)
  }
}

async function resolveConnection (config: { url: string, key: string }) {
  const explicitId = process.env.SHOP_CONNECTION_ID
  if (explicitId) return { id: explicitId, shopId: process.env.SHOPEE_SHOP_ID ?? null }
  const shopId = process.env.SHOPEE_SHOP_ID
  const query = new URLSearchParams({ select: 'id,shop_id', order: 'created_at.desc', limit: '1' })
  if (shopId) query.set('shop_id', `eq.${shopId}`)
  const rows = await readJson(`${config.url}/rest/v1/shop_connections?${query.toString()}`, config.key)
  const connection = asRecord(Array.isArray(rows) ? rows[0] : null)
  return connection.id ? { id: String(connection.id), shopId: connection.shop_id == null ? shopId ?? null : String(connection.shop_id) } : null
}

export async function readStoredCatalog (): Promise<StoredCatalog | null> {
  const config = supabaseConfig()
  if (!config) return null
  try {
    const connection = await resolveConnection(config)
    if (!connection) return null
    const rows: CatalogRow[] = []
    let offset = 0
    const pageSize = 1000
    for (let page = 0; page < 1000; page += 1) {
      const query = new URLSearchParams({
        select: 'observed_at,item_id,model_id,sku,name,model_name,isbn,ean,author,publisher,edition,cover_type,volume_or_combo,image_url,image_id,image_source,current_price,original_price,currency,stock,status,available,condition,product_url,unsupported_fields,request_id',
        connection_id: `eq.${connection.id}`,
        order: 'item_id.asc,model_id.asc',
        limit: String(pageSize),
        offset: String(offset)
      })
      const pageRows = await readJson(`${config.url}/rest/v1/shop_catalog_rows?${query.toString()}`, config.key)
      const batch = Array.isArray(pageRows) ? pageRows.map(toCatalogRow) : []
      rows.push(...batch)
      if (batch.length < pageSize) break
      offset += batch.length
    }
    if (!rows.length) return null
    const observedAt = rows.map((row) => row.observedAt).filter(Boolean).sort().at(-1) ?? null
    return { connectionId: connection.id, shopId: connection.shopId, rows, observedAt }
  } catch {
    return null
  }
}
