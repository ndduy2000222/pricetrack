import { createHmac } from 'node:crypto'

export type ShopeeModel = {
  itemId: string
  modelId: string
  sku: string | null
  currentPrice: number | null
  originalPrice: number | null
  currency: string | null
  status: string | null
  available: boolean
  stock: number | null
  modelName: string | null
  imageUrl: string | null
  imageId: string | null
}

export type ShopeeItem = {
  itemId: string
  itemSku: string | null
  name: string | null
  status: string | null
  categoryId: string | null
  hasModel: boolean
  condition: string | null
  price: number | null
  originalPrice: number | null
  currency: string | null
  stock: number | null
  attributes: Record<string, string>
  imageUrl: string | null
  imageId: string | null
  createTime: string | null
  updateTime: string | null
}

export type ShopeeTokenSet = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  accessTokenExpiresAt: string
  requestId: string | null
}

type Credentials = {
  partnerId?: string
  partnerKey?: string
  accessToken?: string
  refreshToken?: string
  accessTokenExpiresAt?: string
  shopId?: string
  apiBaseUrl?: string
  onTokensRefreshed?: (tokens: ShopeeTokenSet) => Promise<void> | void
}

const itemListPath = '/api/v2/product/get_item_list'
const itemBaseInfoPath = '/api/v2/product/get_item_base_info'
const modelListPath = '/api/v2/product/get_model_list'
const refreshTokenPath = '/api/v2/auth/access_token/get'
const tokenPath = '/api/v2/auth/token/get'
const authPartnerPath = '/api/v2/shop/auth_partner'

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const numberOrNull = (value: unknown): number | null => Number.isFinite(Number(value)) ? Number(value) : null
const stringOrNull = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null
const booleanValue = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true'

function stringList (value: unknown): string[] {
  if (typeof value === 'string') return value.length > 0 ? [value] : []
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => stringList(entry))
}

function imageInfo (value: Record<string, unknown>) {
  const imageRecords = ['image', 'image_info', 'model_image', 'model_image_info', 'product_image']
    .flatMap((key) => {
      const field = value[key]
      return Array.isArray(field) ? field.map(asRecord) : [asRecord(field)]
    })
  const imageUrls = [
    ...stringList(value.image_url_list),
    ...stringList(value.image_url),
    ...stringList(value.model_image_url),
    ...imageRecords.flatMap((image) => [
      ...stringList(image.image_url_list),
      ...stringList(image.image_url),
      ...stringList(image.image_urls),
      ...stringList(image.image_path_list),
      ...stringList(image.image_path)
    ]),
  ].filter((entry) => /^https?:\/\//i.test(entry))
  const imageIds = [
    ...stringList(value.image_id_list),
    ...stringList(value.image_id),
    ...stringList(value.model_image_id),
    ...stringList(value.model_image),
    ...imageRecords.flatMap((image) => [
      ...stringList(image.image_id_list),
      ...stringList(image.image_id)
    ])
  ]
  const imageId = imageIds[0] ?? null
  return {
    imageUrl: imageUrls[0] ?? (imageId ? `https://cf.shopee.vn/file/${encodeURIComponent(imageId)}` : null),
    imageId
  }
}

function priceInfo (value: unknown) {
  const record = Array.isArray(value) ? asRecord(value[0]) : asRecord(value)
  return { current: numberOrNull(record.current_price), original: numberOrNull(record.original_price), currency: stringOrNull(record.currency) }
}

function readStock (value: Record<string, unknown>): number | null {
  const direct = numberOrNull(value.stock)
  if (direct !== null) return direct
  const stockInfo = asRecord(value.stock_info_v2)
  const summary = asRecord(stockInfo.summary_info)
  return numberOrNull(summary.total_available_stock) ?? numberOrNull(summary.total_reserved_stock)
}

function buildSign (partnerId: string, partnerKey: string, path: string, timestamp: number, accessToken = '', shopId = '') {
  const base = accessToken && shopId ? `${partnerId}${path}${timestamp}${accessToken}${shopId}` : `${partnerId}${path}${timestamp}`
  return createHmac('sha256', partnerKey).update(base).digest('hex')
}

function publicRequestUrl (apiBaseUrl: string, partnerId: string, partnerKey: string, path: string, extra: Record<string, string> = {}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const url = new URL(`${apiBaseUrl.replace(/\/$/, '')}${path}`)
  url.searchParams.set('partner_id', partnerId)
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('sign', buildSign(partnerId, partnerKey, path, timestamp))
  Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, value))
  return url
}

export function createShopeeAuthorizationUrl (options: { partnerId?: string, partnerKey?: string, redirectUri: string, apiBaseUrl?: string }) {
  const partnerId = options.partnerId ?? process.env.SHOPEE_PARTNER_ID ?? ''
  const partnerKey = options.partnerKey ?? process.env.SHOPEE_PARTNER_KEY ?? ''
  if (!partnerId || !partnerKey || !options.redirectUri) throw new Error('shopee_oauth_not_configured')
  return publicRequestUrl(options.apiBaseUrl ?? process.env.SHOPEE_API_BASE_URL ?? 'https://partner.shopeemobile.com', partnerId, partnerKey, authPartnerPath, { redirect: options.redirectUri }).toString()
}

export async function exchangeShopeeAuthorizationCode (options: { code: string, shopId: string, partnerId?: string, partnerKey?: string, apiBaseUrl?: string }) {
  const partnerId = options.partnerId ?? process.env.SHOPEE_PARTNER_ID ?? ''
  const partnerKey = options.partnerKey ?? process.env.SHOPEE_PARTNER_KEY ?? ''
  if (!partnerId || !partnerKey || !/^\d+$/.test(options.shopId) || !options.code) throw new Error('shopee_oauth_not_configured')
  const url = publicRequestUrl(options.apiBaseUrl ?? process.env.SHOPEE_API_BASE_URL ?? 'https://partner.shopeemobile.com', partnerId, partnerKey, tokenPath)
  const response = await fetch(url, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ code: options.code, shop_id: Number(options.shopId), partner_id: Number(partnerId) }), cache: 'no-store' })
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.error) throw new Error(body?.error || `http_${response.status}`)
  const expiresIn = Number(body?.expire_in)
  const tokens: ShopeeTokenSet = { accessToken: String(body?.access_token ?? ''), refreshToken: String(body?.refresh_token ?? ''), expiresIn: Number.isFinite(expiresIn) ? expiresIn : 0, accessTokenExpiresAt: new Date(Date.now() + Math.max(0, expiresIn - 60) * 1000).toISOString(), requestId: stringOrNull(body?.request_id) }
  if (!tokens.accessToken || !tokens.refreshToken) throw new Error('invalid_token_response')
  return { tokens, merchantId: body?.merchant_id == null ? null : String(body.merchant_id), shopId: body?.shop_id == null ? options.shopId : String(body.shop_id), requestId: tokens.requestId }
}

export function createShopeeOpenApiClient (credentials: Credentials) {
  const partnerId = credentials.partnerId ?? ''
  const partnerKey = credentials.partnerKey ?? ''
  let activeAccessToken = credentials.accessToken ?? ''
  let activeRefreshToken = credentials.refreshToken ?? ''
  let accessTokenExpiresAt = credentials.accessTokenExpiresAt ? Date.parse(credentials.accessTokenExpiresAt) : 0
  const shopId = credentials.shopId ?? ''
  const apiBaseUrl = (credentials.apiBaseUrl ?? 'https://partner.shopeemobile.com').replace(/\/$/, '')
  const configured = Boolean(partnerId && partnerKey && shopId && (activeAccessToken || activeRefreshToken))

  async function refreshAccessToken (): Promise<ShopeeTokenSet> {
    if (!partnerId || !partnerKey || !shopId || !activeRefreshToken) throw new Error('refresh_token_not_configured')
    const timestamp = Math.floor(Date.now() / 1000)
    const url = new URL(`${apiBaseUrl}${refreshTokenPath}`)
    url.searchParams.set('partner_id', partnerId)
    url.searchParams.set('timestamp', String(timestamp))
    url.searchParams.set('sign', buildSign(partnerId, partnerKey, refreshTokenPath, timestamp))
    const response = await fetch(url, {
      method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ partner_id: Number(partnerId), shop_id: Number(shopId), refresh_token: activeRefreshToken }), cache: 'no-store'
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || body?.error) throw new Error(body?.error || `http_${response.status}`)
    const expiresIn = Number(body?.expire_in)
    const tokens: ShopeeTokenSet = {
      accessToken: String(body?.access_token ?? ''), refreshToken: String(body?.refresh_token ?? ''),
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : 0,
      accessTokenExpiresAt: new Date(Date.now() + Math.max(0, expiresIn - 60) * 1000).toISOString(),
      requestId: stringOrNull(body?.request_id)
    }
    if (!tokens.accessToken || !tokens.refreshToken) throw new Error('invalid_refresh_response')
    activeAccessToken = tokens.accessToken
    activeRefreshToken = tokens.refreshToken
    accessTokenExpiresAt = Date.parse(tokens.accessTokenExpiresAt)
    await credentials.onTokensRefreshed?.(tokens)
    return tokens
  }

  async function ensureAccessToken (force = false) {
    if (!activeAccessToken || force || (accessTokenExpiresAt > 0 && Date.now() >= accessTokenExpiresAt)) await refreshAccessToken()
    if (!activeAccessToken) throw new Error('access_token_not_configured')
    return activeAccessToken
  }

  async function request (path: string, method: 'GET' | 'POST', params: Record<string, unknown> = {}, body?: Record<string, unknown>, retry = true) {
    const accessToken = await ensureAccessToken()
    const timestamp = Math.floor(Date.now() / 1000)
    const url = new URL(`${apiBaseUrl}${path}`)
    const query: Record<string, unknown> = { partner_id: partnerId, timestamp, access_token: accessToken, shop_id: shopId, sign: buildSign(partnerId, partnerKey, path, timestamp, accessToken, shopId), ...params }
    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, String(entry)))
      else url.searchParams.set(key, String(value))
    })
    const response = await fetch(url, {
      method, headers: { accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}), cache: 'no-store'
    })
    const rawResponse = await response.text()
    let responseBody: any = null
    try { responseBody = rawResponse ? JSON.parse(rawResponse) : null } catch { responseBody = null }
    const errorCode = String(responseBody?.error ?? '')
    if ((!response.ok || errorCode) && retry && /token|auth|sign/i.test(`${errorCode} ${responseBody?.message ?? ''}`) && activeRefreshToken) {
      await ensureAccessToken(true)
      return request(path, method, params, body, false)
    }
    if (!response.ok || errorCode) throw new Error(`${path}:${errorCode ? `${errorCode}:${String(responseBody?.message ?? '')}` : `http_${response.status}:${rawResponse.slice(0, 160)}`}`)
    return responseBody
  }

  return {
    configured,
    getTokens: () => ({ accessToken: activeAccessToken, refreshToken: activeRefreshToken, accessTokenExpiresAt: accessTokenExpiresAt ? new Date(accessTokenExpiresAt).toISOString() : null }),
    refreshAccessToken,
    async getItemList (options: { offset?: number, pageSize?: number } = {}) {
      if (!configured) throw new Error('not_configured')
      const body = await request(itemListPath, 'GET', {
        offset: options.offset ?? 0,
        page_size: Math.min(options.pageSize ?? 100, 100),
        item_status: ['NORMAL']
      })
      const response = asRecord(body?.response)
      const items = Array.isArray(response.item) ? response.item : Array.isArray(response.item_list) ? response.item_list : []
      return { requestId: stringOrNull(body?.request_id), items: items.map((item) => String(asRecord(item).item_id)).filter((id) => /^\d+$/.test(id)), hasNextPage: booleanValue(response.has_next_page), nextOffset: numberOrNull(response.next_offset) ?? 0, totalCount: numberOrNull(response.total_count) }
    },
    async getAllItemIds () {
      const items: string[] = []
      let offset = 0; let hasNextPage = true; let pages = 0; const visitedOffsets = new Set<number>()
      while (hasNextPage && pages < 1000) {
        if (visitedOffsets.has(offset)) break
        visitedOffsets.add(offset)
        const page = await this.getItemList({ offset, pageSize: 100 })
        const uniqueBefore = new Set(items).size
        items.push(...page.items)
        const uniqueCount = new Set(items).size
        const nextOffset = page.nextOffset > offset ? page.nextOffset : offset + page.items.length
        hasNextPage = page.hasNextPage && page.items.length > 0 && uniqueCount > uniqueBefore && (page.totalCount === null || uniqueCount < page.totalCount)
        if (nextOffset <= offset) break
        offset = nextOffset
        pages += 1
      }
      return { items: [...new Set(items)], pages }
    },
    async getItemBaseInfo (itemIds: string[]) {
      if (!configured) throw new Error('not_configured')
      const validIds = itemIds.filter((id) => /^\d+$/.test(id)).slice(0, 50)
      if (validIds.length === 0) return { requestId: null, items: [] as ShopeeItem[] }
      const body = await request(itemBaseInfoPath, 'GET', { item_id_list: validIds.map(Number) })
      const response = asRecord(body?.response)
      const items = Array.isArray(response.item_list) ? response.item_list : []
      return {
        requestId: stringOrNull(body?.request_id),
        items: items.map((raw): ShopeeItem => {
          const item = asRecord(raw); const price = priceInfo(item.price_info); const attributes: Record<string, string> = {}; const image = imageInfo(item)
          if (Array.isArray(item.attribute_list)) item.attribute_list.forEach((attribute) => {
            const value = asRecord(attribute); const name = stringOrNull(value.original_attribute_name) ?? stringOrNull(value.attribute_name)
            const rawValue = value.attribute_value_list ?? value.value; const firstValue = Array.isArray(rawValue) ? asRecord(rawValue[0]) : asRecord(rawValue)
            const textValue = stringOrNull(firstValue.original_value_name) ?? stringOrNull(firstValue.value_name) ?? stringOrNull(rawValue)
            if (name && textValue) attributes[name] = textValue
          })
          return { itemId: String(item.item_id), itemSku: stringOrNull(item.item_sku), name: stringOrNull(item.item_name), status: stringOrNull(item.item_status), categoryId: item.category_id == null ? null : String(item.category_id), hasModel: booleanValue(item.has_model), condition: stringOrNull(item.condition), price: price.current, originalPrice: price.original, currency: price.currency, stock: readStock(item), attributes, imageUrl: image.imageUrl, imageId: image.imageId, createTime: numberOrNull(item.create_time) ? new Date(Number(item.create_time) * 1000).toISOString() : null, updateTime: numberOrNull(item.update_time) ? new Date(Number(item.update_time) * 1000).toISOString() : null }
        }).filter((item) => /^\d+$/.test(item.itemId))
      }
    },
    async getModelList (itemId: string): Promise<{ requestId: string | null, models: ShopeeModel[] }> {
      if (!configured) throw new Error('not_configured')
      if (!/^\d+$/.test(itemId)) throw new Error('invalid_item_id')
      const body = await request(modelListPath, 'GET', { item_id: itemId })
      const models: unknown[] = Array.isArray(body?.response?.model) ? body.response.model : []
      return {
        requestId: stringOrNull(body?.request_id),
        models: models.map((raw): ShopeeModel => {
          const model = asRecord(raw); const price = priceInfo(model.price_info); const stock = readStock(model); const image = imageInfo(model)
          return { itemId, modelId: String(model.model_id), sku: stringOrNull(model.model_sku), currentPrice: price.current, originalPrice: price.original ?? price.current, currency: price.currency, status: stringOrNull(model.model_status), available: model.model_status === 'MODEL_NORMAL' && (stock === null || stock > 0), stock, modelName: stringOrNull(model.model_name), imageUrl: image.imageUrl, imageId: image.imageId }
        }).filter((model) => /^\d+$/.test(model.modelId))
      }
    }
  }
}
