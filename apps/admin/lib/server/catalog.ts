import { createShopeeOpenApiClient, type ShopeeItem, type ShopeeModel } from './shopee-open-api'

export type CatalogRow = {
  observedAt: string
  itemId: string
  modelId: string
  sku: string | null
  name: string | null
  modelName: string | null
  isbn: string | null
  ean: string | null
  author: string | null
  publisher: string | null
  edition: string | null
  coverType: string | null
  volumeOrCombo: string | null
  imageUrl: string | null
  imageId: string | null
  imageSource: 'model' | 'product' | null
  currentPrice: number | null
  originalPrice: number | null
  currency: string | null
  stock: number | null
  status: string | null
  available: boolean
  condition: string | null
  productUrl: string
  dataSource: 'shopee_open_api'
  unsupportedFields: string[]
  requestId: string | null
}

const firstAttribute = (attributes: Record<string, string>, names: string[]) => {
  const entry = Object.entries(attributes).find(([name]) => names.some((candidate) => name.toLowerCase().includes(candidate)))
  return entry?.[1] ?? null
}

const isbnValue = (value: string | null) => value?.replace(/[^0-9Xx]/g, '').toUpperCase() || null

function productUrl (shopId: string, itemId: string) {
  return `https://shopee.vn/product/${shopId}/${itemId}`
}

export function rowFromModel (item: ShopeeItem, model: ShopeeModel | null, shopId: string, observedAt: string, requestId: string | null): CatalogRow {
  const unsupportedFields = ['author', 'publisher', 'edition', 'coverType', 'volumeOrCombo']
  const get = (names: string[]) => firstAttribute(item.attributes, names)
  const isbn = isbnValue(get(['isbn']))
  const ean = isbnValue(get(['ean', 'barcode', 'mã vạch']))
  const author = get(['author', 'tác giả'])
  const publisher = get(['publisher', 'nhà xuất bản', 'nxb'])
  const edition = get(['edition', 'ấn bản', 'năm xuất bản', 'year'])
  const coverType = get(['cover', 'bìa'])
  const volumeOrCombo = get(['volume', 'tập', 'combo', 'quy cách'])
  ;[['author', author], ['publisher', publisher], ['edition', edition], ['coverType', coverType], ['volumeOrCombo', volumeOrCombo]].forEach(([key, value]) => { if (value) unsupportedFields.splice(unsupportedFields.indexOf(String(key)), 1) })
  return {
    observedAt, itemId: item.itemId, modelId: model?.modelId ?? '0', sku: model?.sku ?? item.itemSku,
    name: item.name, modelName: model?.modelName ?? null, isbn, ean, author, publisher, edition, coverType, volumeOrCombo,
    imageUrl: model?.imageUrl ?? item.imageUrl, imageId: model?.imageId ?? item.imageId, imageSource: model?.imageUrl || model?.imageId ? 'model' : item.imageUrl || item.imageId ? 'product' : null,
    currentPrice: model ? model.currentPrice : item.price, originalPrice: model ? model.originalPrice : item.originalPrice, currency: model ? model.currency : item.currency,
    stock: model ? model.stock : item.stock, status: model ? model.status : item.status, available: model ? model.available : (item.status === 'NORMAL' && (item.stock === null || item.stock > 0)), condition: item.condition,
    productUrl: productUrl(shopId, item.itemId), dataSource: 'shopee_open_api', unsupportedFields, requestId
  }
}

export async function createClientFromEnvironment () {
  return createClientForShop(process.env.SHOPEE_SHOP_ID ?? '')
}

export async function createClientForShop (shopId: string) {
  const { readStoredShopeeTokens, persistShopeeTokens } = await import('./shopee-token-store')
  const stored = shopId ? await readStoredShopeeTokens(shopId) : null
  const accessToken = stored?.accessToken ?? process.env.SHOPEE_ACCESS_TOKEN
  const refreshToken = stored?.refreshToken ?? process.env.SHOPEE_REFRESH_TOKEN
  const client = createShopeeOpenApiClient({ partnerId: process.env.SHOPEE_PARTNER_ID, partnerKey: process.env.SHOPEE_PARTNER_KEY, accessToken, refreshToken, accessTokenExpiresAt: stored?.accessTokenExpiresAt ?? process.env.SHOPEE_ACCESS_TOKEN_EXPIRES_AT, shopId, apiBaseUrl: process.env.SHOPEE_API_BASE_URL, onTokensRefreshed: async (tokens) => { if (shopId && process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) && process.env.SHOPEE_TOKEN_ENCRYPTION_KEY) await persistShopeeTokens(shopId, tokens) } })
  return { client, shopId, tokenSource: stored ? 'encrypted_supabase' : (refreshToken ? 'env_bootstrap' : 'missing_refresh_token') as string }
}

export async function buildCatalogRows (options: { client: ReturnType<typeof createShopeeOpenApiClient>, shopId: string, itemIds: string[] }) {
  const { client, shopId, itemIds } = options
  const items: ShopeeItem[] = []
  const baseRequests: string[] = []
  for (let index = 0; index < itemIds.length; index += 50) {
    const result = await client.getItemBaseInfo(itemIds.slice(index, index + 50))
    items.push(...result.items)
    if (result.requestId) baseRequests.push(result.requestId)
  }
  const observedAt = new Date().toISOString()
  const rows: CatalogRow[] = []
  for (let index = 0; index < items.length; index += 5) {
    const batch = items.slice(index, index + 5)
    const results = await Promise.all(batch.map((item) => item.hasModel ? client.getModelList(item.itemId) : Promise.resolve({ requestId: null, models: [] as ShopeeModel[] })))
    batch.forEach((item, batchIndex) => {
      const modelResult = results[batchIndex]
      if (modelResult.models.length > 0) rows.push(...modelResult.models.map((model) => rowFromModel(item, model, shopId, observedAt, modelResult.requestId)))
      else rows.push(rowFromModel(item, null, shopId, observedAt, baseRequests[0] ?? null))
    })
  }
  return { rows, observedAt, itemCount: itemIds.length }
}

export async function syncCatalog (options: { all?: boolean, maxItems?: number } = {}) {
  const { client, shopId, tokenSource } = await createClientFromEnvironment()
  if (!client.configured) throw new Error('not_configured')
  const listed = options.all === false ? await client.getItemList({ offset: 0, pageSize: Math.min(options.maxItems ?? 100, 100) }) : await client.getAllItemIds()
  const itemIds = options.all === false ? listed.items : listed.items.slice(0, options.maxItems ?? listed.items.length)
  const built = await buildCatalogRows({ client, shopId, itemIds })
  const { rows, observedAt } = built
  return { rows, itemCount: itemIds.length, pageCount: 'pages' in listed ? listed.pages : 1, observedAt, tokenSource }
}

export function csvValue (value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export const catalogColumns: (keyof CatalogRow)[] = ['observedAt', 'itemId', 'modelId', 'sku', 'name', 'modelName', 'isbn', 'ean', 'author', 'publisher', 'edition', 'coverType', 'volumeOrCombo', 'imageUrl', 'imageId', 'imageSource', 'currentPrice', 'originalPrice', 'currency', 'stock', 'status', 'available', 'condition', 'productUrl', 'dataSource', 'unsupportedFields', 'requestId']

export function catalogCsv (rows: CatalogRow[]) {
  return [catalogColumns.map(csvValue).join(','), ...rows.map((row) => catalogColumns.map((column) => csvValue(Array.isArray(row[column]) ? row[column].join('|') : row[column])).join(','))].join('\n')
}
